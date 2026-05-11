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

const defaultPort = "8051"

func main() {
	godotenv.Load()

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	h := &Handler{db: db}

	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "passwords-service"}) })

	// Routes admin-only sous /pass/admin/* : la gateway garantit le rôle admin
	// (cf. backend/api-gateway/main.go isAdminOnlyPassRoute) et propage X-User-ID.
	// On exige X-Admin-Role: admin en défense en profondeur.
	adminPass := r.Group("/pass/admin")
	adminPass.Use(h.requireAdminRole)
	{
		adminPass.GET("/format-versions", h.adminFormatVersions)
	}

	r.Use(h.requireUserID)

	pass := r.Group("/pass")
	{
		pass.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "passwords-service"}) })
		pass.GET("/vaults", h.listVaults)
		pass.POST("/vaults", h.createVault)
		pass.GET("/vaults/:id/items", h.listItems)
		pass.POST("/vaults/:id/items", h.addItem)
		pass.PUT("/items/:id", h.updateItem)
		pass.DELETE("/items/:id", h.deleteItem)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	log.Println("Password manager listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireUserID(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/pass/health" {
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
	c.Next()
}

// requireAdminRole protège les routes /pass/admin/*. Le contrôle autoritatif
// est côté gateway (rôle JWT admin) ; ici on exige explicitement la propagation
// de l'en-tête X-Admin-Role: admin en défense en profondeur.
func (h *Handler) requireAdminRole(c *gin.Context) {
	if !strings.EqualFold(strings.TrimSpace(c.GetHeader("X-Admin-Role")), "admin") {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin role required"})
		return
	}
	c.Next()
}

type Vault struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	TenantID  int    `json:"tenant_id"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (h *Handler) listVaults(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT id, user_id, tenant_id, name, created_at::text, COALESCE(updated_at::text, '')
		FROM pass_vaults ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Vault, 0)
	for rows.Next() {
		var v Vault
		var uat string
		if err := rows.Scan(&v.ID, &v.UserID, &v.TenantID, &v.Name, &v.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if uat != "" {
			v.UpdatedAt = uat
		}
		list = append(list, v)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createVault(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name required"})
		return
	}
	name := body.Name
	if name == "" {
		name = "Default"
	}
	tenantID := c.GetHeader("X-Tenant-ID")
	tid, _ := strconv.Atoi(tenantID)
	if tid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID required"})
		return
	}
	ctx := c.Request.Context()
	var id int
	err := h.dbex(ctx).QueryRow(`
		INSERT INTO pass_vaults (user_id, tenant_id, name)
		VALUES (current_setting('app.current_user_id')::int, $1, $2)
		RETURNING id
	`, tid, name).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "name": name})
}

type Item struct {
	ID            int    `json:"id"`
	VaultID       int    `json:"vault_id"`
	Ciphertext    string `json:"ciphertext"`
	FormatVersion int    `json:"format_version"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

// currentFormatVersion est la version cible du format d'enveloppe Pass-Crypto
// (cf. docs/PASS-CRYPTO.md). Le serveur n'ouvre jamais le blob ciphertext,
// il étiquette uniquement la version déclarée par le client. 0 = legacy,
// 1 = EnvelopeV1 (Argon2id + XChaCha20-Poly1305 + KEM hybride X25519 ⊕ ML-KEM-768).
const currentFormatVersion = 1

// validateFormatVersion borne la valeur acceptée par le serveur (defense
// en profondeur — la migration SQL contraint déjà SMALLINT).
func validateFormatVersion(v int) (int, bool) {
	if v < 0 || v > 32767 {
		return 0, false
	}
	return v, true
}

func (h *Handler) listItems(c *gin.Context) {
	vaultID := c.Param("id")
	vid, err := strconv.Atoi(vaultID)
	if err != nil || vid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault id"})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT id, vault_id, ciphertext, COALESCE(format_version, 0), created_at::text, COALESCE(updated_at::text, '')
		FROM pass_items WHERE vault_id = $1 ORDER BY created_at DESC
	`, vid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]Item, 0)
	for rows.Next() {
		var it Item
		var uat string
		if err := rows.Scan(&it.ID, &it.VaultID, &it.Ciphertext, &it.FormatVersion, &it.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if uat != "" {
			it.UpdatedAt = uat
		}
		list = append(list, it)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) addItem(c *gin.Context) {
	vaultID := c.Param("id")
	vid, err := strconv.Atoi(vaultID)
	if err != nil || vid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault id"})
		return
	}
	var body struct {
		Ciphertext    string `json:"ciphertext"`
		FormatVersion *int   `json:"format_version,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Ciphertext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ciphertext required"})
		return
	}
	fv := currentFormatVersion
	if body.FormatVersion != nil {
		v, ok := validateFormatVersion(*body.FormatVersion)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid format_version"})
			return
		}
		fv = v
	}
	ctx := c.Request.Context()
	var id int
	err = h.dbex(ctx).QueryRow(`
		INSERT INTO pass_items (vault_id, ciphertext, format_version)
		SELECT $1, $2, $3 FROM pass_vaults WHERE id = $1 AND user_id = current_setting('app.current_user_id')::int
		RETURNING id
	`, vid, body.Ciphertext, fv).Scan(&id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "format_version": fv})
}

func (h *Handler) updateItem(c *gin.Context) {
	itemID := c.Param("id")
	iid, err := strconv.Atoi(itemID)
	if err != nil || iid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}
	var body struct {
		Ciphertext    string `json:"ciphertext"`
		FormatVersion *int   `json:"format_version,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Ciphertext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ciphertext required"})
		return
	}
	fv := currentFormatVersion
	if body.FormatVersion != nil {
		v, ok := validateFormatVersion(*body.FormatVersion)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid format_version"})
			return
		}
		fv = v
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		UPDATE pass_items SET ciphertext = $2, format_version = $3, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND vault_id IN (SELECT id FROM pass_vaults WHERE user_id = current_setting('app.current_user_id')::int)
	`, iid, body.Ciphertext, fv)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": iid, "format_version": fv})
}

// adminFormatVersions renvoie la distribution des items par version d'enveloppe
// Pass-Crypto pour piloter la migration côté client (cf. docs/PASS-CRYPTO.md
// § 9). Source : fonction Postgres pass_format_version_stats() (SECURITY
// DEFINER, contourne RLS pour count uniquement, jamais les ciphertext).
func (h *Handler) adminFormatVersions(c *gin.Context) {
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`SELECT format_version, item_count FROM pass_format_version_stats()`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type row struct {
		FormatVersion int   `json:"format_version"`
		ItemCount     int64 `json:"item_count"`
	}
	out := make([]row, 0, 8)
	var total int64
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.FormatVersion, &r.ItemCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		out = append(out, r)
		total += r.ItemCount
	}
	c.JSON(http.StatusOK, gin.H{
		"current_format_version": currentFormatVersion,
		"total_items":            total,
		"versions":               out,
	})
}

func (h *Handler) deleteItem(c *gin.Context) {
	itemID := c.Param("id")
	iid, err := strconv.Atoi(itemID)
	if err != nil || iid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		DELETE FROM pass_items
		WHERE id = $1 AND vault_id IN (SELECT id FROM pass_vaults WHERE user_id = current_setting('app.current_user_id')::int)
	`, iid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	c.Status(http.StatusNoContent)
}
