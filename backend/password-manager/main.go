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
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "password-manager"}) })
	r.Use(h.requireUserID)

	pass := r.Group("/pass")
	{
		pass.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "password-manager"}) })
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
	_, err = h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", uid)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set user context"})
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
	rows, err := h.db.Query(`
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
	var id int
	err := h.db.QueryRow(`
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
	ID         int    `json:"id"`
	VaultID    int    `json:"vault_id"`
	Ciphertext string `json:"ciphertext"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

func (h *Handler) listItems(c *gin.Context) {
	vaultID := c.Param("id")
	vid, err := strconv.Atoi(vaultID)
	if err != nil || vid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid vault id"})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, vault_id, ciphertext, created_at::text, COALESCE(updated_at::text, '')
		FROM pass_items WHERE vault_id = $1 ORDER BY created_at DESC
	`, vid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Item
	for rows.Next() {
		var it Item
		var uat string
		if err := rows.Scan(&it.ID, &it.VaultID, &it.Ciphertext, &it.CreatedAt, &uat); err != nil {
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
		Ciphertext string `json:"ciphertext"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Ciphertext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ciphertext required"})
		return
	}
	var id int
	err = h.db.QueryRow(`
		INSERT INTO pass_items (vault_id, ciphertext)
		SELECT $1, $2 FROM pass_vaults WHERE id = $1 AND user_id = current_setting('app.current_user_id')::int
		RETURNING id
	`, vid, body.Ciphertext).Scan(&id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "vault not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *Handler) updateItem(c *gin.Context) {
	itemID := c.Param("id")
	iid, err := strconv.Atoi(itemID)
	if err != nil || iid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}
	var body struct {
		Ciphertext string `json:"ciphertext"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Ciphertext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ciphertext required"})
		return
	}
	res, err := h.db.Exec(`
		UPDATE pass_items SET ciphertext = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND vault_id IN (SELECT id FROM pass_vaults WHERE user_id = current_setting('app.current_user_id')::int)
	`, iid, body.Ciphertext)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": iid})
}

func (h *Handler) deleteItem(c *gin.Context) {
	itemID := c.Param("id")
	iid, err := strconv.Atoi(itemID)
	if err != nil || iid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return
	}
	res, err := h.db.Exec(`
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
