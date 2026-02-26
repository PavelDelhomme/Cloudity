package main

import (
	"database/sql"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const defaultPort = "8055"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "drive"})
	})
	r.GET("/drive/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "drive"})
	})
	r.Use(h.requireUserID)
	drive := r.Group("/drive")
	{
		drive.GET("/nodes", h.listNodes)
		drive.POST("/nodes", h.createNode)
		drive.PUT("/nodes/:id", h.updateNode)
		drive.DELETE("/nodes/:id", h.deleteNode)
		drive.GET("/nodes/:id/content", h.getNodeContent)
		drive.POST("/nodes/upload", h.uploadFile)
	}
	r.GET("/drive/files", func(c *gin.Context) {
		if h.db == nil {
			c.JSON(http.StatusOK, []interface{}{})
			return
		}
		c.Request.URL.RawQuery = ""
		c.Request.URL.Path = "/drive/nodes"
		r.HandleContext(c)
	})
	return r
}

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Println("DATABASE_URL not set; drive API will return empty list")
	}

	var db *sql.DB
	if dbURL != "" {
		var err error
		db, err = sql.Open("postgres", dbURL)
		if err != nil {
			log.Fatal("Failed to connect to database:", err)
		}
		defer db.Close()
		if err := db.Ping(); err != nil {
			log.Fatal("Failed to ping database:", err)
		}
	}

	r := setupRouter(db)
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	log.Println("Drive service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/drive/health" {
		c.Next()
		return
	}
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID required"})
		return
	}
	uid, err := strconv.Atoi(userID)
	if err != nil || uid <= 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid X-User-ID"})
		return
	}
	if h.db != nil {
		_, err = h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", uid)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set user context"})
			return
		}
	}
	c.Next()
}

type Node struct {
	ID        int     `json:"id"`
	TenantID  int     `json:"tenant_id"`
	UserID    int     `json:"user_id"`
	ParentID  *int    `json:"parent_id"`
	Name      string  `json:"name"`
	IsFolder  bool    `json:"is_folder"`
	Size      int64   `json:"size"`
	MimeType  *string `json:"mime_type,omitempty"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

func (h *Handler) listNodes(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Node{})
		return
	}
	parentIDStr := c.Query("parent_id")
	var rows *sql.Rows
	var err error
	if parentIDStr == "" || parentIDStr == "null" {
		rows, err = h.db.Query(`
			SELECT id, tenant_id, user_id, parent_id, name, is_folder, size, mime_type, created_at::text, COALESCE(updated_at::text, '')
			FROM drive_nodes WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND parent_id IS NULL ORDER BY is_folder DESC, name
		`)
	} else {
		parentID, perr := strconv.Atoi(parentIDStr)
		if perr != nil || parentID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
			return
		}
		rows, err = h.db.Query(`
			SELECT id, tenant_id, user_id, parent_id, name, is_folder, size, mime_type, created_at::text, COALESCE(updated_at::text, '')
			FROM drive_nodes WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND parent_id = $1 ORDER BY is_folder DESC, name
		`, parentID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Node
	for rows.Next() {
		var n Node
		var pid sql.NullInt64
		var mime sql.NullString
		var uat string
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &pid, &n.Name, &n.IsFolder, &n.Size, &mime, &n.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if pid.Valid {
			p := int(pid.Int64)
			n.ParentID = &p
		}
		if mime.Valid {
			n.MimeType = &mime.String
		}
		n.UpdatedAt = uat
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		ParentID *int   `json:"parent_id"`
		Name     string `json:"name"`
		IsFolder bool   `json:"is_folder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	userID := c.GetHeader("X-User-ID")
	tenantID := c.GetHeader("X-Tenant-ID")
	uid, _ := strconv.Atoi(userID)
	tid := 1
	if tenantID != "" {
		if t, err := strconv.Atoi(tenantID); err == nil && t > 0 {
			tid = t
		}
	}
	var id int
	if body.ParentID == nil || *body.ParentID == 0 {
		err := h.db.QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size) VALUES ($1, $2, NULL, $3, $4, 0)
			RETURNING id
		`, tid, uid, body.Name, body.IsFolder).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		err := h.db.QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size) VALUES ($1, $2, $3, $4, $5, 0)
			RETURNING id
		`, tid, uid, *body.ParentID, body.Name, body.IsFolder).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": body.Name, "is_folder": body.IsFolder})
}

func (h *Handler) updateNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	res, err := h.db.Exec(`
		UPDATE drive_nodes SET name = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.Name, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "name": body.Name})
}

func (h *Handler) deleteNode(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.Exec(`
		DELETE FROM drive_nodes WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) getNodeContent(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var name string
	var content []byte
	var mime sql.NullString
	err = h.db.QueryRow(`
		SELECT name, content, mime_type FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false
	`, id).Scan(&name, &content, &mime)
	if err == sql.ErrNoRows || content == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ct := "application/octet-stream"
	if mime.Valid && mime.String != "" {
		ct = mime.String
	}
	c.Header("Content-Disposition", "attachment; filename=\""+name+"\"")
	c.Data(http.StatusOK, ct, content)
}

func (h *Handler) uploadFile(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "multipart required"})
		return
	}
	parentIDStr := c.PostForm("parent_id")
	name := c.PostForm("name")
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "read file failed"})
		return
	}
	if name == "" {
		// use filename from multipart
		fh := form.File["file"]
		if len(fh) > 0 {
			name = fh[0].Filename
		}
	}
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name or file required"})
		return
	}
	userID := c.GetHeader("X-User-ID")
	tenantID := c.GetHeader("X-Tenant-ID")
	uid, _ := strconv.Atoi(userID)
	tid := 1
	if tenantID != "" {
		if t, e := strconv.Atoi(tenantID); e == nil && t > 0 {
			tid = t
		}
	}
	mimeType := "application/octet-stream"
	if ct := c.PostForm("mime_type"); ct != "" {
		mimeType = ct
	}
	size := int64(len(content))

	var id int
	if parentIDStr == "" || parentIDStr == "null" {
		err = h.db.QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size, mime_type, content)
			VALUES ($1, $2, NULL, $3, false, $4, $5, $6) RETURNING id
		`, tid, uid, name, size, mimeType, content).Scan(&id)
	} else {
		parentID, perr := strconv.Atoi(parentIDStr)
		if perr != nil || parentID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
			return
		}
		err = h.db.QueryRow(`
			INSERT INTO drive_nodes (tenant_id, user_id, parent_id, name, is_folder, size, mime_type, content)
			VALUES ($1, $2, $3, $4, false, $5, $6, $7) RETURNING id
		`, tid, uid, parentID, name, size, mimeType, content).Scan(&id)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": name, "size": size})
}
