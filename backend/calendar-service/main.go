package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const defaultPort = "8052"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "calendar"}) })
	r.GET("/calendar/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "calendar"}) })
	r.Use(h.requireUserID)
	r.GET("/calendar/calendars", h.listCalendars)
	r.POST("/calendar/calendars", h.createCalendar)
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

type UserCalendar struct {
	ID        int    `json:"id"`
	TenantID  int    `json:"tenant_id"`
	UserID    int    `json:"user_id"`
	Name      string `json:"name"`
	ColorHex  string `json:"color_hex"`
	SortOrder int    `json:"sort_order"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Event struct {
	ID          int     `json:"id"`
	TenantID    int     `json:"tenant_id"`
	UserID      int     `json:"user_id"`
	CalendarID  *int    `json:"calendar_id,omitempty"`
	Title       string  `json:"title"`
	StartAt     string  `json:"start_at"`
	EndAt       string  `json:"end_at"`
	AllDay      bool    `json:"all_day"`
	Location    *string `json:"location,omitempty"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func (h *Handler) ensureDefaultCalendar(userID, tenantID int) (int, error) {
	if h.db == nil {
		return 0, fmt.Errorf("no db")
	}
	var id int
	err := h.db.QueryRow(`
		SELECT id FROM user_calendars
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		ORDER BY sort_order ASC, id ASC LIMIT 1
	`).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}
	err = h.db.QueryRow(`
		INSERT INTO user_calendars (tenant_id, user_id, name, color_hex, sort_order)
		VALUES ($1, $2, 'Mon agenda', '#1a73e8', 0) RETURNING id
	`, tenantID, userID).Scan(&id)
	return id, err
}

func (h *Handler) listCalendars(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []UserCalendar{})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, tenant_id, user_id, name, color_hex, sort_order, created_at::text, COALESCE(updated_at::text, '')
		FROM user_calendars
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		ORDER BY sort_order ASC, id ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []UserCalendar
	for rows.Next() {
		var x UserCalendar
		var uat string
		if err := rows.Scan(&x.ID, &x.TenantID, &x.UserID, &x.Name, &x.ColorHex, &x.SortOrder, &x.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		x.UpdatedAt = uat
		list = append(list, x)
	}
	if list == nil {
		list = []UserCalendar{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createCalendar(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		Name     string `json:"name"`
		ColorHex string `json:"color_hex"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	color := strings.TrimSpace(body.ColorHex)
	if color == "" || !strings.HasPrefix(color, "#") || len(color) != 7 {
		color = "#34a853"
	}
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	tenantID := 1
	if t := c.GetHeader("X-Tenant-ID"); t != "" {
		if tid, err := strconv.Atoi(t); err == nil && tid > 0 {
			tenantID = tid
		}
	}
	var maxSort int
	_ = h.db.QueryRow(`SELECT COALESCE(MAX(sort_order), -1) + 1 FROM user_calendars WHERE user_id = $1`, userID).Scan(&maxSort)
	var id int
	err := h.db.QueryRow(`
		INSERT INTO user_calendars (tenant_id, user_id, name, color_hex, sort_order)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, tenantID, userID, name, color, maxSort).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": name, "color_hex": color})
}

func (h *Handler) listEvents(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Event{})
		return
	}
	calQ := strings.TrimSpace(c.Query("calendar_id"))
	base := `
		SELECT id, tenant_id, user_id, calendar_id, title, start_at::text, end_at::text, all_day, location, description, created_at::text, COALESCE(updated_at::text, '')
		FROM calendar_events WHERE user_id = current_setting('app.current_user_id', true)::INTEGER`
	var rows *sql.Rows
	var err error
	if calQ != "" {
		cid, convErr := strconv.Atoi(calQ)
		if convErr != nil || cid <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid calendar_id"})
			return
		}
		rows, err = h.db.Query(base+` AND calendar_id = $1 ORDER BY start_at`, cid)
	} else {
		rows, err = h.db.Query(base + ` ORDER BY start_at`)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Event
	for rows.Next() {
		var e Event
		var loc, desc sql.NullString
		var cal sql.NullInt64
		var uat string
		if err := rows.Scan(&e.ID, &e.TenantID, &e.UserID, &cal, &e.Title, &e.StartAt, &e.EndAt, &e.AllDay, &loc, &desc, &e.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if cal.Valid {
			v := int(cal.Int64)
			e.CalendarID = &v
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
		CalendarID  *int    `json:"calendar_id"`
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
	calID := 0
	if body.CalendarID != nil && *body.CalendarID > 0 {
		var ok bool
		_ = h.db.QueryRow(`
			SELECT true FROM user_calendars
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		`, *body.CalendarID).Scan(&ok)
		if ok {
			calID = *body.CalendarID
		}
	}
	if calID == 0 {
		var err error
		calID, err = h.ensureDefaultCalendar(userID, tenantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	var id int
	err := h.db.QueryRow(`
		INSERT INTO calendar_events (tenant_id, user_id, calendar_id, title, start_at, end_at, all_day, location, description)
		VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9) RETURNING id
	`, tenantID, userID, calID, body.Title, body.StartAt, body.EndAt, body.AllDay, body.Location, body.Description).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "title": body.Title, "calendar_id": calID})
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
		Title        *string `json:"title"`
		StartAt      *string `json:"start_at"`
		EndAt        *string `json:"end_at"`
		AllDay       *bool   `json:"all_day"`
		Location     *string `json:"location"`
		Description  *string `json:"description"`
		CalendarID   *int    `json:"calendar_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.CalendarID != nil && *body.CalendarID > 0 {
		var ok bool
		_ = h.db.QueryRow(`
			SELECT true FROM user_calendars
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		`, *body.CalendarID).Scan(&ok)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "calendar not found"})
			return
		}
	}
	res, err := h.db.Exec(`
		UPDATE calendar_events SET
			title = COALESCE($1, title),
			start_at = COALESCE($2::timestamptz, start_at),
			end_at = COALESCE($3::timestamptz, end_at),
			all_day = COALESCE($4, all_day),
			location = $5,
			description = $6,
			calendar_id = COALESCE($7, calendar_id),
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $8 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.Title, body.StartAt, body.EndAt, body.AllDay, body.Location, body.Description, body.CalendarID, id)
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
