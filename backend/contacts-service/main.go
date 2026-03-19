package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const defaultPort = "8056"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "contacts"}) })
	r.GET("/contacts/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "contacts"}) })
	r.Use(h.requireUserID)
	r.GET("/contacts", h.listContacts)
	r.POST("/contacts", h.createContact)
	r.GET("/contacts/:id", h.getContact)
	r.PATCH("/contacts/:id", h.updateContact)
	r.DELETE("/contacts/:id", h.deleteContact)
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
	log.Println("Contacts service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/contacts/health" {
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

type Contact struct {
	ID        int    `json:"id"`
	TenantID  int    `json:"tenant_id"`
	UserID    int    `json:"user_id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (h *Handler) listContacts(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Contact{})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, tenant_id, user_id, name, email, phone, created_at::text, COALESCE(updated_at::text, '')
		FROM contacts
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		ORDER BY name ASC, email ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Contact
	for rows.Next() {
		var x Contact
		var phone sql.NullString
		var uat string
		if err := rows.Scan(&x.ID, &x.TenantID, &x.UserID, &x.Name, &x.Email, &phone, &x.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if phone.Valid {
			x.Phone = phone.String
		}
		x.UpdatedAt = uat
		list = append(list, x)
	}
	if list == nil {
		list = []Contact{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) getContact(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var x Contact
	var phone sql.NullString
	var uat string
	err := h.db.QueryRow(`
		SELECT id, tenant_id, user_id, name, email, phone, created_at::text, COALESCE(updated_at::text, '')
		FROM contacts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, id).Scan(&x.ID, &x.TenantID, &x.UserID, &x.Name, &x.Email, &phone, &x.CreatedAt, &uat)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if phone.Valid {
		x.Phone = phone.String
	}
	x.UpdatedAt = uat
	c.JSON(http.StatusOK, x)
}

func (h *Handler) createContact(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	email := strings.TrimSpace(strings.ToLower(body.Email))
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email requis et invalide"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = email
	}
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	tenantID := 1
	if t := c.GetHeader("X-Tenant-ID"); t != "" {
		if tid, err := strconv.Atoi(t); err == nil && tid > 0 {
			tenantID = tid
		}
	}
	phone := strings.TrimSpace(body.Phone)
	var id int
	err := h.db.QueryRow(`
		INSERT INTO contacts (tenant_id, user_id, name, email, phone)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''))
		RETURNING id
	`, tenantID, userID, name, email, phone).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": name, "email": email})
}

func (h *Handler) updateContact(c *gin.Context) {
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
		Name  *string `json:"name"`
		Email *string `json:"email"`
		Phone *string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	// Build dynamic update (only provided fields)
	updates := []string{}
	args := []interface{}{}
	pos := 1
	if body.Name != nil {
		updates = append(updates, "name = $"+strconv.Itoa(pos))
		args = append(args, strings.TrimSpace(*body.Name))
		pos++
	}
	if body.Email != nil {
		email := strings.TrimSpace(strings.ToLower(*body.Email))
		if email == "" || !strings.Contains(email, "@") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email invalide"})
			return
		}
		updates = append(updates, "email = $"+strconv.Itoa(pos))
		args = append(args, email)
		pos++
	}
	if body.Phone != nil {
		updates = append(updates, "phone = NULLIF($"+strconv.Itoa(pos)+", '')")
		args = append(args, strings.TrimSpace(*body.Phone))
		pos++
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}
	updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)
	q := `UPDATE contacts SET ` + strings.Join(updates, ", ") + ` WHERE id = $` + strconv.Itoa(pos) + ` AND user_id = current_setting('app.current_user_id', true)::INTEGER`
	res, err := h.db.Exec(q, args...)
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

func (h *Handler) deleteContact(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM contacts WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
