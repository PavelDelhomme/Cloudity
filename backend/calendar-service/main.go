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

const defaultPort = "8052"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "calendar"}) })
	r.GET("/calendar/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "calendar"}) })
	r.Use(h.requireUserID)
	r.GET("/calendar/events", h.listEvents)
	r.POST("/calendar/events", h.createEvent)
	r.PUT("/calendar/events/:id", h.updateEvent)
	r.DELETE("/calendar/events/:id", h.deleteEvent)
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
	log.Println("Calendar service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/calendar/health" {
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

type Event struct {
	ID          int     `json:"id"`
	TenantID    int     `json:"tenant_id"`
	UserID      int     `json:"user_id"`
	Title       string  `json:"title"`
	StartAt     string  `json:"start_at"`
	EndAt       string  `json:"end_at"`
	AllDay      bool    `json:"all_day"`
	Location    *string `json:"location,omitempty"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func (h *Handler) listEvents(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Event{})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, tenant_id, user_id, title, start_at::text, end_at::text, all_day, location, description, created_at::text, COALESCE(updated_at::text, '')
		FROM calendar_events WHERE user_id = current_setting('app.current_user_id', true)::INTEGER ORDER BY start_at
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Event
	for rows.Next() {
		var e Event
		var loc, desc sql.NullString
		var uat string
		if err := rows.Scan(&e.ID, &e.TenantID, &e.UserID, &e.Title, &e.StartAt, &e.EndAt, &e.AllDay, &loc, &desc, &e.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if loc.Valid {
			e.Location = &loc.String
		}
		if desc.Valid {
			e.Description = &desc.String
		}
		e.UpdatedAt = uat
		list = append(list, e)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createEvent(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		Title       string  `json:"title"`
		StartAt     string  `json:"start_at"`
		EndAt       string  `json:"end_at"`
		AllDay      bool    `json:"all_day"`
		Location    *string `json:"location"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Title == "" || body.StartAt == "" || body.EndAt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title, start_at, end_at required"})
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
	err := h.db.QueryRow(`
		INSERT INTO calendar_events (tenant_id, user_id, title, start_at, end_at, all_day, location, description)
		VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8) RETURNING id
	`, tenantID, userID, body.Title, body.StartAt, body.EndAt, body.AllDay, body.Location, body.Description).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "title": body.Title})
}

func (h *Handler) updateEvent(c *gin.Context) {
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
		Title       *string `json:"title"`
		StartAt     *string `json:"start_at"`
		EndAt       *string `json:"end_at"`
		AllDay      *bool   `json:"all_day"`
		Location    *string `json:"location"`
		Description *string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	res, err := h.db.Exec(`
		UPDATE calendar_events SET
			title = COALESCE($1, title),
			start_at = COALESCE($2::timestamptz, start_at),
			end_at = COALESCE($3::timestamptz, end_at),
			all_day = COALESCE($4, all_day),
			location = $5,
			description = $6,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $7 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.Title, body.StartAt, body.EndAt, body.AllDay, body.Location, body.Description, id)
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

func (h *Handler) deleteEvent(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM calendar_events WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
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
