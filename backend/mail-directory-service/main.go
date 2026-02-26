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

const defaultPort = "8050"

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
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
	r.Use(h.requireTenantAndUser)

	mail := r.Group("/mail")
	{
		mail.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
		mail.GET("/domains", h.listDomains)
		mail.POST("/domains", h.createDomain)
		mail.GET("/domains/:id/mailboxes", h.listMailboxes)
		mail.GET("/domains/:id/aliases", h.listAliases)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	log.Println("Mail directory service listening on", port)
	r.Run(":" + port)
}

type Handler struct {
	db *sql.DB
}

func (h *Handler) requireTenantAndUser(c *gin.Context) {
	if c.FullPath() == "/health" || c.FullPath() == "/mail/health" {
		c.Next()
		return
	}
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "X-Tenant-ID required"})
		return
	}
	tid, err := strconv.Atoi(tenantID)
	if err != nil || tid <= 0 {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid X-Tenant-ID"})
		return
	}
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID required"})
		return
	}
	if _, err := strconv.Atoi(userID); err != nil || userID == "0" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid X-User-ID"})
		return
	}
	if h.db != nil {
		_, err = h.db.Exec("SELECT set_current_tenant($1)", tid)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set tenant context"})
			return
		}
	}
	c.Next()
}

type Domain struct {
	ID        int    `json:"id"`
	TenantID  int    `json:"tenant_id"`
	Domain    string `json:"domain"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (h *Handler) listDomains(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id, tenant_id, domain, is_active, created_at::text, COALESCE(updated_at::text, '')
		FROM mail_domains ORDER BY domain
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Domain
	for rows.Next() {
		var d Domain
		var uat string
		if err := rows.Scan(&d.ID, &d.TenantID, &d.Domain, &d.IsActive, &d.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if uat != "" {
			d.UpdatedAt = uat
		}
		list = append(list, d)
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createDomain(c *gin.Context) {
	var body struct {
		Domain string `json:"domain" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain required"})
		return
	}
	tenantID := c.GetHeader("X-Tenant-ID")
	tid, _ := strconv.Atoi(tenantID)
	if tid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID required"})
		return
	}
	var id int
	err := h.db.QueryRow(`
		INSERT INTO mail_domains (tenant_id, domain)
		VALUES ($1, $2)
		RETURNING id
	`, tid, body.Domain).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "domain already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "domain": body.Domain})
}

type Mailbox struct {
	ID        int    `json:"id"`
	DomainID  int    `json:"domain_id"`
	LocalPart string `json:"local_part"`
	QuotaMb   int    `json:"quota_mb"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (h *Handler) listMailboxes(c *gin.Context) {
	id := c.Param("id")
	domainID, err := strconv.Atoi(id)
	if err != nil || domainID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid domain id"})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, domain_id, local_part, quota_mb, is_active, created_at::text, COALESCE(updated_at::text, '')
		FROM mail_mailboxes WHERE domain_id = $1 ORDER BY local_part
	`, domainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Mailbox
	for rows.Next() {
		var m Mailbox
		var uat string
		if err := rows.Scan(&m.ID, &m.DomainID, &m.LocalPart, &m.QuotaMb, &m.IsActive, &m.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if uat != "" {
			m.UpdatedAt = uat
		}
		list = append(list, m)
	}
	c.JSON(http.StatusOK, list)
}

type Alias struct {
	ID          int    `json:"id"`
	DomainID    int    `json:"domain_id"`
	SourceLocal string `json:"source_local"`
	Destination string `json:"destination"`
	ExpiresAt   string `json:"expires_at,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

func (h *Handler) listAliases(c *gin.Context) {
	id := c.Param("id")
	domainID, err := strconv.Atoi(id)
	if err != nil || domainID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid domain id"})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, domain_id, source_local, destination, expires_at::text, created_at::text, COALESCE(updated_at::text, '')
		FROM mail_aliases WHERE domain_id = $1 ORDER BY source_local
	`, domainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []Alias
	for rows.Next() {
		var a Alias
		var expAt sql.NullString
		var uat string
		if err := rows.Scan(&a.ID, &a.DomainID, &a.SourceLocal, &a.Destination, &expAt, &a.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if expAt.Valid && expAt.String != "" {
			a.ExpiresAt = expAt.String
		}
		if uat != "" {
			a.UpdatedAt = uat
		}
		list = append(list, a)
	}
	c.JSON(http.StatusOK, list)
}
