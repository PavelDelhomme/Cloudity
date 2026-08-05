package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
)

const defaultPort = "8053"

func setupRouter(db *sql.DB) *gin.Engine {
	h := &Handler{db: db}
	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "notes"}) })
	r.GET("/notes/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "notes"}) })
	r.Use(h.requireUserID)
	r.GET("/notes", h.listNotes)
	r.POST("/notes", h.createNote)
	r.PUT("/notes/:id", h.updateNote)
	r.DELETE("/notes/:id", h.deleteNote)
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
	log.Println("Notes service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/notes/health" {
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

type NoteExtras struct {
	Checklist []NoteChecklistItem `json:"checklist,omitempty"`
	Images    []NoteImage         `json:"images,omitempty"`
	Drawing   *string             `json:"drawing,omitempty"`
}

type NoteChecklistItem struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type NoteImage struct {
	ID      string `json:"id"`
	DataURL string `json:"dataUrl"`
}

type Note struct {
	ID              int        `json:"id"`
	TenantID        int        `json:"tenant_id"`
	UserID          int        `json:"user_id"`
	Title           string     `json:"title"`
	Content         string     `json:"content"`
	Color           string     `json:"color"`
	Pinned          bool       `json:"pinned"`
	Archived        bool       `json:"archived"`
	Labels          []string   `json:"labels"`
	RemindAt        *string    `json:"remind_at,omitempty"`
	Extras          NoteExtras `json:"extras"`
	VaultEncrypted  bool       `json:"vault_encrypted,omitempty"`
	VaultCiphertext *string    `json:"vault_ciphertext,omitempty"`
	CreatedAt       string     `json:"created_at"`
	UpdatedAt       string     `json:"updated_at"`
}

const noteSelectCols = `id, tenant_id, user_id, title, content, COALESCE(color, 'default'), pinned, archived, COALESCE(labels, '{}'), remind_at::text, COALESCE(extras, '{}'::jsonb), vault_encrypted, vault_ciphertext, created_at::text, COALESCE(updated_at::text, '')`

func normalizeColor(c string) string {
	c = strings.TrimSpace(strings.ToLower(c))
	switch c {
	case "default", "yellow", "green", "blue", "pink", "purple", "orange", "gray", "teal", "red":
		return c
	default:
		return "default"
	}
}

func normalizeLabels(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, raw := range in {
		l := strings.TrimSpace(raw)
		if l == "" {
			continue
		}
		if len(l) > 64 {
			l = l[:64]
		}
		key := strings.ToLower(l)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, l)
		if len(out) >= 20 {
			break
		}
	}
	return out
}

func normalizeExtras(in NoteExtras) NoteExtras {
	out := NoteExtras{}
	for i, it := range in.Checklist {
		if i >= 50 {
			break
		}
		text := strings.TrimSpace(it.Text)
		if text == "" {
			continue
		}
		if len(text) > 500 {
			text = text[:500]
		}
		id := strings.TrimSpace(it.ID)
		if id == "" {
			id = fmt.Sprintf("c%d", i+1)
		}
		out.Checklist = append(out.Checklist, NoteChecklistItem{ID: id, Text: text, Done: it.Done})
	}
	for i, img := range in.Images {
		if i >= 8 {
			break
		}
		if !strings.HasPrefix(img.DataURL, "data:image/") {
			continue
		}
		if len(img.DataURL) > 900_000 {
			continue
		}
		id := strings.TrimSpace(img.ID)
		if id == "" {
			id = fmt.Sprintf("i%d", i+1)
		}
		out.Images = append(out.Images, NoteImage{ID: id, DataURL: img.DataURL})
	}
	if in.Drawing != nil {
		d := strings.TrimSpace(*in.Drawing)
		if strings.HasPrefix(d, "data:image/") && len(d) <= 900_000 {
			out.Drawing = &d
		}
	}
	return out
}

func extrasJSON(e NoteExtras) ([]byte, error) {
	e = normalizeExtras(e)
	b, err := json.Marshal(e)
	if err != nil {
		return []byte("{}"), err
	}
	if len(b) > 4_000_000 {
		return nil, fmt.Errorf("extras too large")
	}
	return b, nil
}

func scanNote(scanner interface{ Scan(dest ...any) error }) (Note, error) {
	var n Note
	var uat string
	var vaultCipher sql.NullString
	var labels pq.StringArray
	var remind sql.NullString
	var extrasRaw []byte
	err := scanner.Scan(
		&n.ID, &n.TenantID, &n.UserID, &n.Title, &n.Content, &n.Color, &n.Pinned, &n.Archived, &labels,
		&remind, &extrasRaw, &n.VaultEncrypted, &vaultCipher, &n.CreatedAt, &uat,
	)
	if err != nil {
		return n, err
	}
	n.Labels = []string(labels)
	if n.Labels == nil {
		n.Labels = []string{}
	}
	if remind.Valid && remind.String != "" {
		n.RemindAt = &remind.String
	}
	if len(extrasRaw) > 0 {
		_ = json.Unmarshal(extrasRaw, &n.Extras)
	}
	if n.Extras.Checklist == nil {
		n.Extras.Checklist = []NoteChecklistItem{}
	}
	if n.Extras.Images == nil {
		n.Extras.Images = []NoteImage{}
	}
	n.UpdatedAt = uat
	if vaultCipher.Valid {
		s := vaultCipher.String
		n.VaultCiphertext = &s
	}
	return n, nil
}

func (h *Handler) listNotes(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Note{})
		return
	}
	ctx := c.Request.Context()
	archivedOnly := c.Query("archived") == "1" || strings.EqualFold(c.Query("archived"), "true")
	var rows *sql.Rows
	var err error
	if archivedOnly {
		rows, err = h.dbex(ctx).Query(`
			SELECT ` + noteSelectCols + `
			FROM notes WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND archived = true
			ORDER BY updated_at DESC NULLS LAST, created_at DESC
		`)
	} else {
		rows, err = h.dbex(ctx).Query(`
			SELECT ` + noteSelectCols + `
			FROM notes WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND archived = false
			ORDER BY pinned DESC, updated_at DESC NULLS LAST, created_at DESC
		`)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Note, 0)
	for rows.Next() {
		n, err := scanNote(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, n)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createNote(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		Title           string     `json:"title"`
		Content         string     `json:"content"`
		Color           string     `json:"color"`
		Pinned          bool       `json:"pinned"`
		Archived        bool       `json:"archived"`
		Labels          []string   `json:"labels"`
		RemindAt        *string    `json:"remind_at"`
		Extras          NoteExtras `json:"extras"`
		VaultEncrypted  bool       `json:"vault_encrypted"`
		VaultCiphertext *string    `json:"vault_ciphertext"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	title := body.Title
	content := body.Content
	if body.VaultEncrypted {
		title = "🔒 Note chiffrée"
		content = ""
	}
	color := normalizeColor(body.Color)
	labels := normalizeLabels(body.Labels)
	extrasBytes, err := extrasJSON(body.Extras)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	err = h.dbex(ctx).QueryRow(`
		INSERT INTO notes (tenant_id, user_id, title, content, color, pinned, archived, labels, remind_at, extras, vault_encrypted, vault_ciphertext)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::jsonb, $11, $12) RETURNING id`,
		tenantID, userID, title, content, color, body.Pinned, body.Archived, pq.Array(labels), body.RemindAt, extrasBytes, body.VaultEncrypted, body.VaultCiphertext,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "title": body.Title})
}

func (h *Handler) updateNote(c *gin.Context) {
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
		Title           *string     `json:"title"`
		Content         *string     `json:"content"`
		Color           *string     `json:"color"`
		Pinned          *bool       `json:"pinned"`
		Archived        *bool       `json:"archived"`
		Labels          *[]string   `json:"labels"`
		RemindAt        *string     `json:"remind_at"`
		Extras          *NoteExtras `json:"extras"`
		VaultEncrypted  *bool       `json:"vault_encrypted"`
		VaultCiphertext *string     `json:"vault_ciphertext"`
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
	if body.Content != nil {
		parts = append(parts, fmt.Sprintf("content = $%d", argN))
		args = append(args, *body.Content)
		argN++
	}
	if body.Color != nil {
		parts = append(parts, fmt.Sprintf("color = $%d", argN))
		args = append(args, normalizeColor(*body.Color))
		argN++
	}
	if body.Pinned != nil {
		parts = append(parts, fmt.Sprintf("pinned = $%d", argN))
		args = append(args, *body.Pinned)
		argN++
	}
	if body.Archived != nil {
		parts = append(parts, fmt.Sprintf("archived = $%d", argN))
		args = append(args, *body.Archived)
		argN++
	}
	if body.Labels != nil {
		parts = append(parts, fmt.Sprintf("labels = $%d", argN))
		args = append(args, pq.Array(normalizeLabels(*body.Labels)))
		argN++
	}
	if body.RemindAt != nil {
		if *body.RemindAt == "" {
			parts = append(parts, "remind_at = NULL")
		} else {
			parts = append(parts, fmt.Sprintf("remind_at = $%d::timestamptz", argN))
			args = append(args, *body.RemindAt)
			argN++
		}
	}
	if body.Extras != nil {
		b, err := extrasJSON(*body.Extras)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		parts = append(parts, fmt.Sprintf("extras = $%d::jsonb", argN))
		args = append(args, b)
		argN++
	}
	if body.VaultEncrypted != nil {
		parts = append(parts, fmt.Sprintf("vault_encrypted = $%d", argN))
		args = append(args, *body.VaultEncrypted)
		argN++
		if *body.VaultEncrypted {
			parts = append(parts, "title = '🔒 Note chiffrée'", "content = ''")
		}
	}
	if body.VaultCiphertext != nil {
		parts = append(parts, fmt.Sprintf("vault_ciphertext = $%d", argN))
		args = append(args, *body.VaultCiphertext)
		argN++
	}
	if len(parts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}
	parts = append(parts, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)
	q := fmt.Sprintf(
		"UPDATE notes SET %s WHERE id = $%d AND user_id = current_setting('app.current_user_id', true)::INTEGER",
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

func (h *Handler) deleteNote(c *gin.Context) {
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
	res, err := h.dbex(ctx).Exec(`DELETE FROM notes WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
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
