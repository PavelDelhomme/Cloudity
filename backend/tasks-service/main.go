package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const defaultPort = "8054"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "tasks"}) })
	r.GET("/tasks/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "tasks"}) })
	r.Use(h.requireUserID)
	r.GET("/tasks/lists", h.listLists)
	r.POST("/tasks/lists", h.createList)
	r.GET("/tasks", h.listTasks)
	r.POST("/tasks", h.createTask)
	r.PUT("/tasks/:id", h.updateTask)
	r.DELETE("/tasks/:id", h.deleteTask)
	return r
}

func main() {
	_ = godotenv.Load()
	dbURL := os.Getenv("DATABASE_URL")
	var db *sql.DB
	if dbURL != "" {
		var err error
		db, err = sql.Open("postgres", dbURL)
		if err != nil {
			log.Fatal("db:", err)
		}
		defer db.Close()
		if err := db.Ping(); err != nil {
			log.Fatal("ping:", err)
		}
	}
	r := setupRouter(db)
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	log.Println("Tasks service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/tasks/health" {
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
		_, _ = h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", uid)
	}
	c.Next()
}

type TaskList struct {
	ID        int    `json:"id"`
	TenantID  int    `json:"tenant_id"`
	UserID    int    `json:"user_id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Task struct {
	ID        int     `json:"id"`
	TenantID  int     `json:"tenant_id"`
	UserID    int     `json:"user_id"`
	ListID    *int    `json:"list_id,omitempty"`
	Title     string  `json:"title"`
	Completed bool    `json:"completed"`
	DueAt     *string `json:"due_at,omitempty"`
	CreatedAt string  `json:"created_at"`
	UpdatedAt string  `json:"updated_at"`
}

func (h *Handler) listLists(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []TaskList{})
		return
	}
	rows, err := h.db.Query(`SELECT id, tenant_id, user_id, name, created_at::text, COALESCE(updated_at::text, '') FROM task_lists WHERE user_id = current_setting('app.current_user_id', true)::INTEGER ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []TaskList
	for rows.Next() {
		var l TaskList
		var uat string
		if err := rows.Scan(&l.ID, &l.TenantID, &l.UserID, &l.Name, &l.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		l.UpdatedAt = uat
		list = append(list, l)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createList(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	tenantID := 1
	if t := c.GetHeader("X-Tenant-ID"); t != "" {
		if tid, err := strconv.Atoi(t); err == nil && tid > 0 {
			tenantID = tid
		}
	}
	var id int
	if err := h.db.QueryRow(`INSERT INTO task_lists (tenant_id, user_id, name) VALUES ($1, $2, $3) RETURNING id`, tenantID, userID, body.Name).Scan(&id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": body.Name})
}

func (h *Handler) listTasks(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Task{})
		return
	}
	listID := c.Query("list_id")
	var rows *sql.Rows
	var err error
	if listID == "" {
		rows, err = h.db.Query(`
			SELECT id, tenant_id, user_id, list_id, title, completed, due_at::text, created_at::text, COALESCE(updated_at::text, '')
			FROM tasks WHERE user_id = current_setting('app.current_user_id', true)::INTEGER ORDER BY completed, due_at NULLS LAST, created_at
		`)
	} else {
		lid, _ := strconv.Atoi(listID)
		rows, err = h.db.Query(`
			SELECT id, tenant_id, user_id, list_id, title, completed, due_at::text, created_at::text, COALESCE(updated_at::text, '')
			FROM tasks WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND list_id = $1 ORDER BY completed, due_at NULLS LAST, created_at
		`, lid)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Task
	for rows.Next() {
		var t Task
		var lid sql.NullInt64
		var due sql.NullString
		var uat string
		if err := rows.Scan(&t.ID, &t.TenantID, &t.UserID, &lid, &t.Title, &t.Completed, &due, &t.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if lid.Valid {
			i := int(lid.Int64)
			t.ListID = &i
		}
		if due.Valid {
			t.DueAt = &due.String
		}
		t.UpdatedAt = uat
		list = append(list, t)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createTask(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		ListID *int    `json:"list_id"`
		Title  string  `json:"title"`
		DueAt  *string `json:"due_at"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title required"})
		return
	}
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	tenantID := 1
	if t := c.GetHeader("X-Tenant-ID"); t != "" {
		if tid, err := strconv.Atoi(t); err == nil && tid > 0 {
			tenantID = tid
		}
	}
	var id int
	err := h.db.QueryRow(`INSERT INTO tasks (tenant_id, user_id, list_id, title, due_at) VALUES ($1, $2, $3, $4, $5::timestamptz) RETURNING id`,
		tenantID, userID, body.ListID, body.Title, body.DueAt).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "title": body.Title})
}

func (h *Handler) updateTask(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Title     *string `json:"title"`
		Completed *bool   `json:"completed"`
		DueAt     *string `json:"due_at"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	res, err := h.db.Exec(`
		UPDATE tasks SET title = COALESCE($1, title), completed = COALESCE($2, completed), due_at = $3::timestamptz, updated_at = CURRENT_TIMESTAMP
		WHERE id = $4 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.Title, body.Completed, body.DueAt, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func (h *Handler) deleteTask(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM tasks WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
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
