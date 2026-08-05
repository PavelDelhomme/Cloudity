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

const defaultPort = "8054"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.SetTrustedProxies(nil)
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
		ctx := c.Request.Context()
		conn, err := h.db.Conn(ctx)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to acquire DB connection"})
			return
		}
		defer conn.Close()
		if _, err := conn.ExecContext(ctx, "SELECT set_config('app.current_user_id', $1, false)", uid); err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set user context"})
			return
		}
		pin := &pinnedConn{conn: conn, ctx: ctx}
		c.Request = c.Request.WithContext(withPinnedConn(ctx, pin))
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
	ID         int     `json:"id"`
	TenantID   int     `json:"tenant_id"`
	UserID     int     `json:"user_id"`
	ListID     *int    `json:"list_id,omitempty"`
	ParentID   *int    `json:"parent_id,omitempty"`
	Title      string  `json:"title"`
	Notes      string  `json:"notes"`
	Completed  bool    `json:"completed"`
	Starred    bool    `json:"starred"`
	StartAt    *string `json:"start_at,omitempty"`
	DueAt      *string `json:"due_at,omitempty"`
	RepeatRule *string `json:"repeat_rule,omitempty"`
	CreatedAt  string  `json:"created_at"`
	UpdatedAt  string  `json:"updated_at"`
}

const taskSelectCols = `id, tenant_id, user_id, list_id, parent_id, title, COALESCE(notes, ''), completed, starred, start_at::text, due_at::text, repeat_rule, created_at::text, COALESCE(updated_at::text, '')`

func scanTask(rows interface {
	Scan(dest ...any) error
}) (Task, error) {
	var t Task
	var lid, pid sql.NullInt64
	var start, due, rr sql.NullString
	var uat string
	err := rows.Scan(&t.ID, &t.TenantID, &t.UserID, &lid, &pid, &t.Title, &t.Notes, &t.Completed, &t.Starred, &start, &due, &rr, &t.CreatedAt, &uat)
	if err != nil {
		return t, err
	}
	if lid.Valid {
		i := int(lid.Int64)
		t.ListID = &i
	}
	if pid.Valid {
		i := int(pid.Int64)
		t.ParentID = &i
	}
	if start.Valid {
		t.StartAt = &start.String
	}
	if due.Valid {
		t.DueAt = &due.String
	}
	if rr.Valid && rr.String != "" {
		s := rr.String
		t.RepeatRule = &s
	}
	t.UpdatedAt = uat
	return t, nil
}

func (h *Handler) listLists(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []TaskList{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`SELECT id, tenant_id, user_id, name, created_at::text, COALESCE(updated_at::text, '') FROM task_lists WHERE user_id = current_setting('app.current_user_id', true)::INTEGER ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]TaskList, 0)
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
	ctx := c.Request.Context()
	var id int
	if err := h.dbex(ctx).QueryRow(`INSERT INTO task_lists (tenant_id, user_id, name) VALUES ($1, $2, $3) RETURNING id`, tenantID, userID, body.Name).Scan(&id); err != nil {
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
	ctx := c.Request.Context()
	listID := c.Query("list_id")
	var rows *sql.Rows
	var err error
	order := `ORDER BY starred DESC, completed, due_at NULLS LAST, created_at`
	if listID == "" {
		rows, err = h.dbex(ctx).Query(`SELECT `+taskSelectCols+` FROM tasks WHERE user_id = current_setting('app.current_user_id', true)::INTEGER `+order)
	} else {
		lid, _ := strconv.Atoi(listID)
		rows, err = h.dbex(ctx).Query(`SELECT `+taskSelectCols+` FROM tasks WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND list_id = $1 `+order, lid)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Task, 0)
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
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
		ListID     *int    `json:"list_id"`
		ParentID   *int    `json:"parent_id"`
		Title      string  `json:"title"`
		Notes      *string `json:"notes"`
		StartAt    *string `json:"start_at"`
		DueAt      *string `json:"due_at"`
		RepeatRule *string `json:"repeat_rule"`
		Starred    *bool   `json:"starred"`
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
	var rr interface{}
	if body.RepeatRule != nil && *body.RepeatRule != "" {
		rr = *body.RepeatRule
	} else {
		rr = nil
	}
	notes := ""
	if body.Notes != nil {
		notes = *body.Notes
	}
	starred := false
	if body.Starred != nil {
		starred = *body.Starred
	}
	listID := body.ListID
	parentID := body.ParentID
	ctx := c.Request.Context()
	if parentID != nil {
		if *parentID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid parent_id"})
			return
		}
		var pList sql.NullInt64
		var pParent sql.NullInt64
		err := h.dbex(ctx).QueryRow(`
			SELECT list_id, parent_id FROM tasks
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		`, *parentID).Scan(&pList, &pParent)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "parent task not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if pParent.Valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "subtasks cannot have children (one level only)"})
			return
		}
		if listID == nil && pList.Valid {
			i := int(pList.Int64)
			listID = &i
		}
	}
	var id int
	err := h.dbex(ctx).QueryRow(`
		INSERT INTO tasks (tenant_id, user_id, list_id, parent_id, title, notes, start_at, due_at, repeat_rule, starred)
		VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10) RETURNING id`,
		tenantID, userID, listID, parentID, body.Title, notes, body.StartAt, body.DueAt, rr, starred).Scan(&id)
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
		Title      *string `json:"title"`
		Notes      *string `json:"notes"`
		Completed  *bool   `json:"completed"`
		Starred    *bool   `json:"starred"`
		StartAt    *string `json:"start_at"`
		DueAt      *string `json:"due_at"`
		RepeatRule *string `json:"repeat_rule"`
		ParentID   *int    `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	var parts []string
	var args []interface{}
	argN := 1
	if body.Title != nil {
		parts = append(parts, fmt.Sprintf("title = $%d", argN))
		args = append(args, *body.Title)
		argN++
	}
	if body.Notes != nil {
		parts = append(parts, fmt.Sprintf("notes = $%d", argN))
		args = append(args, *body.Notes)
		argN++
	}
	if body.Completed != nil {
		parts = append(parts, fmt.Sprintf("completed = $%d", argN))
		args = append(args, *body.Completed)
		argN++
	}
	if body.Starred != nil {
		parts = append(parts, fmt.Sprintf("starred = $%d", argN))
		args = append(args, *body.Starred)
		argN++
	}
	if body.StartAt != nil {
		if *body.StartAt == "" {
			parts = append(parts, "start_at = NULL")
		} else {
			parts = append(parts, fmt.Sprintf("start_at = $%d::timestamptz", argN))
			args = append(args, *body.StartAt)
			argN++
		}
	}
	if body.DueAt != nil {
		if *body.DueAt == "" {
			parts = append(parts, "due_at = NULL")
		} else {
			parts = append(parts, fmt.Sprintf("due_at = $%d::timestamptz", argN))
			args = append(args, *body.DueAt)
			argN++
		}
	}
	if body.RepeatRule != nil {
		if *body.RepeatRule == "" {
			parts = append(parts, "repeat_rule = NULL")
		} else {
			parts = append(parts, fmt.Sprintf("repeat_rule = $%d", argN))
			args = append(args, *body.RepeatRule)
			argN++
		}
	}
	if body.ParentID != nil {
		if *body.ParentID <= 0 {
			parts = append(parts, "parent_id = NULL")
		} else if *body.ParentID == id {
			c.JSON(http.StatusBadRequest, gin.H{"error": "task cannot be its own parent"})
			return
		} else {
			parts = append(parts, fmt.Sprintf("parent_id = $%d", argN))
			args = append(args, *body.ParentID)
			argN++
		}
	}
	if len(parts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}
	parts = append(parts, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)
	q := fmt.Sprintf(
		"UPDATE tasks SET %s WHERE id = $%d AND user_id = current_setting('app.current_user_id', true)::INTEGER",
		strings.Join(parts, ", "),
		argN,
	)
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(q, args...)
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
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`DELETE FROM tasks WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
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
