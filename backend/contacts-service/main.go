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
	r.POST("/contacts/import", h.importContacts)
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

type Contact struct {
	ID              int     `json:"id"`
	TenantID        int     `json:"tenant_id"`
	UserID          int     `json:"user_id"`
	Name            string  `json:"name"`
	Email           string  `json:"email"`
	Phone           string  `json:"phone,omitempty"`
	VaultEncrypted  bool    `json:"vault_encrypted,omitempty"`
	VaultCiphertext *string `json:"vault_ciphertext,omitempty"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func (h *Handler) listContacts(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, []Contact{})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT id, tenant_id, user_id, name, email, phone, vault_encrypted, vault_ciphertext, created_at::text, COALESCE(updated_at::text, '')
		FROM contacts
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
		ORDER BY name ASC, email ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Contact, 0)
	for rows.Next() {
		var x Contact
		var phone sql.NullString
		var vaultCipher sql.NullString
		var uat string
		if err := rows.Scan(&x.ID, &x.TenantID, &x.UserID, &x.Name, &x.Email, &phone, &x.VaultEncrypted, &vaultCipher, &x.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if phone.Valid {
			x.Phone = phone.String
		}
		if vaultCipher.Valid {
			x.VaultCiphertext = &vaultCipher.String
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
	ctx := c.Request.Context()
	var x Contact
	var phone sql.NullString
	var uat string
	err := h.dbex(ctx).QueryRow(`
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
		Name            string  `json:"name"`
		Email           string  `json:"email"`
		Phone           string  `json:"phone"`
		VaultEncrypted  bool    `json:"vault_encrypted"`
		VaultCiphertext *string `json:"vault_ciphertext"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	email := strings.TrimSpace(strings.ToLower(body.Email))
	name := strings.TrimSpace(body.Name)
	phone := strings.TrimSpace(body.Phone)
	if body.VaultEncrypted {
		if body.VaultCiphertext == nil || strings.TrimSpace(*body.VaultCiphertext) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "vault_ciphertext requis"})
			return
		}
		email = "locked@vault.local"
		name = "🔒 Contact chiffré"
		phone = ""
	} else {
		if email == "" || !strings.Contains(email, "@") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email requis et invalide"})
			return
		}
		if name == "" {
			name = email
		}
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
	err := h.dbex(ctx).QueryRow(`
		INSERT INTO contacts (tenant_id, user_id, name, email, phone, vault_encrypted, vault_ciphertext)
		VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7)
		RETURNING id
	`, tenantID, userID, name, email, phone, body.VaultEncrypted, body.VaultCiphertext).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": name, "email": email})
}

// importContacts : import en masse (export Google CSV, JSON, autre outil).
// Body : { "contacts": [{ "name", "email", "phone" }], "on_duplicate": "skip" | "update" }
func (h *Handler) importContacts(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		Contacts []struct {
			Name  string `json:"name"`
			Email string `json:"email"`
			Phone string `json:"phone"`
		} `json:"contacts"`
		OnDuplicate string `json:"on_duplicate"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if len(body.Contacts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "liste vide"})
		return
	}
	if len(body.Contacts) > 5000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "maximum 5000 contacts par import"})
		return
	}
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	tenantID := 1
	if t := c.GetHeader("X-Tenant-ID"); t != "" {
		if tid, err := strconv.Atoi(t); err == nil && tid > 0 {
			tenantID = tid
		}
	}
	mode := strings.ToLower(strings.TrimSpace(body.OnDuplicate))
	if mode != "update" {
		mode = "skip"
	}

	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`SELECT id, email FROM contacts WHERE user_id = $1`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	emailToID := make(map[string]int)
	for rows.Next() {
		var id int
		var em string
		if err := rows.Scan(&id, &em); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		emailToID[strings.ToLower(strings.TrimSpace(em))] = id
	}
	rows.Close()

	imported := 0
	updated := 0
	skipped := 0
	invalid := 0
	batchSeen := make(map[string]bool)

	for _, row := range body.Contacts {
		email := strings.TrimSpace(strings.ToLower(row.Email))
		if email == "" || !strings.Contains(email, "@") {
			invalid++
			continue
		}
		if batchSeen[email] {
			skipped++
			continue
		}
		batchSeen[email] = true

		name := strings.TrimSpace(row.Name)
		if name == "" {
			name = email
		}
		phone := strings.TrimSpace(row.Phone)

		if id, ok := emailToID[email]; ok {
			if mode == "update" {
				_, err := h.dbex(ctx).Exec(`
					UPDATE contacts SET name = $1, phone = NULLIF($2, ''), updated_at = CURRENT_TIMESTAMP
					WHERE id = $3 AND user_id = $4
				`, name, phone, id, userID)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				updated++
			} else {
				skipped++
			}
			continue
		}

		var newID int
		err := h.dbex(ctx).QueryRow(`
			INSERT INTO contacts (tenant_id, user_id, name, email, phone)
			VALUES ($1, $2, $3, $4, NULLIF($5, ''))
			RETURNING id
		`, tenantID, userID, name, email, phone).Scan(&newID)
		if err != nil {
			skipped++
			continue
		}
		imported++
		emailToID[email] = newID
	}

	c.JSON(http.StatusOK, gin.H{
		"imported": imported,
		"updated":  updated,
		"skipped":  skipped,
		"invalid":  invalid,
	})
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
		Name            *string `json:"name"`
		Email           *string `json:"email"`
		Phone           *string `json:"phone"`
		VaultEncrypted  *bool   `json:"vault_encrypted"`
		VaultCiphertext *string `json:"vault_ciphertext"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	// Build dynamic update (only provided fields)
	updates := []string{}
	args := []interface{}{}
	pos := 1
	if body.VaultEncrypted != nil && *body.VaultEncrypted {
		updates = append(updates, "vault_encrypted = $"+strconv.Itoa(pos))
		args = append(args, true)
		pos++
		updates = append(updates, "vault_ciphertext = $"+strconv.Itoa(pos))
		if body.VaultCiphertext != nil {
			args = append(args, *body.VaultCiphertext)
		} else {
			args = append(args, nil)
		}
		pos++
		updates = append(updates, "name = $"+strconv.Itoa(pos))
		args = append(args, "🔒 Contact chiffré")
		pos++
		updates = append(updates, "email = $"+strconv.Itoa(pos))
		args = append(args, "locked@vault.local")
		pos++
		updates = append(updates, "phone = NULL")
	} else {
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
	}
	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}
	updates = append(updates, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)
	q := `UPDATE contacts SET ` + strings.Join(updates, ", ") + ` WHERE id = $` + strconv.Itoa(pos) + ` AND user_id = current_setting('app.current_user_id', true)::INTEGER`
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
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`DELETE FROM contacts WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
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
