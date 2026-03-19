package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/emersion/go-message/mail"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	googleapi "google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"
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
	r.SetTrustedProxies(nil)
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
	// Callback OAuth Google : pas d'auth (redirection navigateur depuis Google)
	r.GET("/mail/me/oauth/google/callback", h.oauthGoogleCallback)
	r.Use(h.requireTenantAndUser)

	mail := r.Group("/mail")
	{
		mail.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
		mail.GET("/me/oauth/google/authorize", h.oauthGoogleAuthorize)
		// Routes /me/* en premier pour ne pas être capturées par /domains/:id
		mail.GET("/me/accounts", h.listUserAccounts)
		mail.POST("/me/accounts", h.createUserAccount)
		mail.PATCH("/me/accounts/:id", h.patchUserAccount)
		mail.DELETE("/me/accounts/:id", h.deleteUserAccount)
		mail.GET("/me/accounts/:id/messages", h.listAccountMessages)
		mail.GET("/me/accounts/:id/messages/:msgId", h.getAccountMessage)
		mail.PATCH("/me/accounts/:id/messages/:msgId/read", h.markMessageRead)
		mail.PATCH("/me/accounts/:id/messages/:msgId/folder", h.moveMessageToFolder)
		mail.POST("/me/accounts/:id/sync", h.syncAccountIMAP)
		mail.POST("/me/send", h.sendMessageSMTP)
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

func encryptPassword(plain string) (string, error) {
	keyHex := os.Getenv("MAIL_PASSWORD_ENCRYPTION_KEY")
	if keyHex == "" {
		return "", nil
	}
	key, err := hex.DecodeString(strings.TrimSpace(keyHex))
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("MAIL_PASSWORD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decryptPassword(encrypted string) (string, error) {
	if encrypted == "" {
		return "", nil
	}
	keyHex := os.Getenv("MAIL_PASSWORD_ENCRYPTION_KEY")
	if keyHex == "" {
		return "", nil
	}
	key, err := hex.DecodeString(strings.TrimSpace(keyHex))
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("MAIL_PASSWORD_ENCRYPTION_KEY invalid")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil || len(raw) < gcm.NonceSize() {
		return "", err
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
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
		_, err = h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to set user context"})
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

type UserEmailAccount struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	TenantID  int    `json:"tenant_id"`
	Email     string `json:"email"`
	Label     string `json:"label,omitempty"`
	// IMAP/SMTP options override des valeurs déduites du domaine.
	// Valeurs null => détection automatique côté backend.
	ImapHost *string `json:"imap_host,omitempty"`
	ImapPort *int    `json:"imap_port,omitempty"`
	SmtpHost *string `json:"smtp_host,omitempty"`
	SmtpPort *int    `json:"smtp_port,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (h *Handler) listUserAccounts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id, user_id, tenant_id, email, label, imap_host, imap_port, smtp_host, smtp_port, created_at::text, COALESCE(updated_at::text, '')
		FROM user_email_accounts ORDER BY created_at DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var accList []UserEmailAccount
	for rows.Next() {
		var a UserEmailAccount
		var label sql.NullString
		var imapHost sql.NullString
		var smtpHost sql.NullString
		var imapPort sql.NullInt32
		var smtpPort sql.NullInt32
		var uat string
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.TenantID, &a.Email, &label,
			&imapHost, &imapPort, &smtpHost, &smtpPort,
			&a.CreatedAt, &uat,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if label.Valid {
			a.Label = label.String
		}
		if imapHost.Valid {
			s := imapHost.String
			a.ImapHost = &s
		}
		if imapPort.Valid {
			p := int(imapPort.Int32)
			a.ImapPort = &p
		}
		if smtpHost.Valid {
			s := smtpHost.String
			a.SmtpHost = &s
		}
		if smtpPort.Valid {
			p := int(smtpPort.Int32)
			a.SmtpPort = &p
		}
		a.UpdatedAt = uat
		accList = append(accList, a)
	}
	if accList == nil {
		accList = []UserEmailAccount{}
	}
	c.JSON(http.StatusOK, accList)
}

func (h *Handler) createUserAccount(c *gin.Context) {
	var body struct {
		Email    string `json:"email" binding:"required"`
		Label    string `json:"label"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email required"})
		return
	}
	email := strings.TrimSpace(strings.ToLower(body.Email))
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
		return
	}
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.GetHeader("X-User-ID")
	tid, _ := strconv.Atoi(tenantID)
	uid, _ := strconv.Atoi(userID)
	if tid <= 0 || uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "X-Tenant-ID and X-User-ID required"})
		return
	}
	var passwordEnc *string
	if body.Password != "" {
		enc, err := encryptPassword(body.Password)
		if err != nil {
			log.Printf("[mail] encrypt password: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "impossible de stocker le mot de passe (clé de chiffrement manquante ou invalide)"})
			return
		}
		if enc != "" {
			passwordEnc = &enc
		}
	}
	var id int
	err := h.db.QueryRow(`
		INSERT INTO user_email_accounts (user_id, tenant_id, email, label, password_encrypted)
		VALUES ($1, $2, $3, NULLIF(TRIM($4), ''), $5)
		RETURNING id
	`, uid, tid, email, body.Label, passwordEnc).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "cette adresse est déjà reliée"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "email": email, "label": body.Label})
}

// oauthGoogleAuthorize renvoie l'URL de redirection vers Google (connexion OAuth sans mot de passe d'application).
func (h *Handler) oauthGoogleAuthorize(c *gin.Context) {
	clientID := os.Getenv("GOOGLE_OAUTH_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET")
	redirectURI := os.Getenv("GOOGLE_OAUTH_REDIRECT_URI")
	if clientID == "" || clientSecret == "" || redirectURI == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "OAuth Google non configuré (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI)"})
		return
	}
	tenantID := c.GetHeader("X-Tenant-ID")
	userID := c.GetHeader("X-User-ID")
	tid, _ := strconv.Atoi(tenantID)
	uid, _ := strconv.Atoi(userID)
	if tid <= 0 || uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "utilisateur non identifié"})
		return
	}
	stateBytes := make([]byte, 24)
	if _, err := rand.Read(stateBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "génération state"})
		return
	}
	state := base64.URLEncoding.EncodeToString(stateBytes)[:32]
	_, err := h.db.Exec(`
		INSERT INTO mail_oauth_state (state, user_id, tenant_id) VALUES ($1, $2, $3)
	`, state, uid, tid)
	if err != nil {
		log.Printf("[mail] oauth state insert: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "erreur interne"})
		return
	}
	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURI,
		Scopes:       []string{"https://mail.google.com/", "openid", "email"},
		Endpoint:     google.Endpoint,
	}
	url := conf.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"))
	c.JSON(http.StatusOK, gin.H{"redirect_url": url})
}

// oauthGoogleCallback traite le retour Google, récupère les tokens et crée/met à jour le compte mail.
func (h *Handler) oauthGoogleCallback(c *gin.Context) {
	state := c.Query("state")
	code := c.Query("code")
	frontendURL := os.Getenv("MAIL_OAUTH_FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:6001"
	}
	redirectFail := frontendURL + "/app/mail?oauth=google&status=error"
	if state == "" || code == "" {
		redirectFail += "&reason=missing"
		c.Redirect(http.StatusFound, redirectFail)
		return
	}
	var uid, tid int
	err := h.db.QueryRow(`
		SELECT user_id, tenant_id FROM mail_oauth_state WHERE state = $1
	`, state).Scan(&uid, &tid)
	if err == sql.ErrNoRows || err != nil {
		redirectFail += "&reason=invalid_state"
		c.Redirect(http.StatusFound, redirectFail)
		return
	}
	_, _ = h.db.Exec(`DELETE FROM mail_oauth_state WHERE state = $1`, state)

	clientID := os.Getenv("GOOGLE_OAUTH_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET")
	redirectURI := os.Getenv("GOOGLE_OAUTH_REDIRECT_URI")
	if clientID == "" || clientSecret == "" || redirectURI == "" {
		c.Redirect(http.StatusFound, frontendURL+"/app/mail?oauth=google&status=error&reason=config")
		return
	}
	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURI,
		Scopes:       []string{"https://mail.google.com/", "openid", "email"},
		Endpoint:     google.Endpoint,
	}
	tok, err := conf.Exchange(c.Request.Context(), code)
	if err != nil {
		log.Printf("[mail] oauth exchange: %v", err)
		c.Redirect(http.StatusFound, redirectFail+"&reason=exchange")
		return
	}
	if tok.RefreshToken == "" {
		log.Printf("[mail] oauth: no refresh_token (prompt=consent may be needed)")
	}
	// Récupérer l'email via Gmail API (profil) ou token ID
	ctx := c.Request.Context()
	client := conf.Client(ctx, tok)
	svc, err := googleapi.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		log.Printf("[mail] gmail api: %v", err)
		c.Redirect(http.StatusFound, redirectFail+"&reason=api")
		return
	}
	profile, err := svc.Users.GetProfile("me").Do()
	if err != nil {
		log.Printf("[mail] gmail getProfile: %v", err)
		c.Redirect(http.StatusFound, redirectFail+"&reason=profile")
		return
	}
	email := strings.TrimSpace(strings.ToLower(profile.EmailAddress))
	if email == "" {
		c.Redirect(http.StatusFound, redirectFail+"&reason=no_email")
		return
	}
	refreshEnc, err := encryptPassword(tok.RefreshToken)
	if err != nil || refreshEnc == "" {
		log.Printf("[mail] encrypt refresh_token: %v", err)
		c.Redirect(http.StatusFound, redirectFail+"&reason=encrypt")
		return
	}
	provider := "google"
	_, err = h.db.Exec(`
		INSERT INTO user_email_accounts (user_id, tenant_id, email, label, oauth_provider, oauth_refresh_token_encrypted)
		VALUES ($1, $2, $3, NULL, $4, $5)
		ON CONFLICT (user_id, email) DO UPDATE SET
			oauth_provider = EXCLUDED.oauth_provider,
			oauth_refresh_token_encrypted = EXCLUDED.oauth_refresh_token_encrypted,
			updated_at = NOW()
	`, uid, tid, email, provider, refreshEnc)
	if err != nil {
		log.Printf("[mail] oauth upsert account: %v", err)
		c.Redirect(http.StatusFound, redirectFail+"&reason=db")
		return
	}
	c.Redirect(http.StatusFound, frontendURL+"/app/mail?oauth=google&status=ok")
}

func (h *Handler) deleteUserAccount(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM user_email_accounts WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
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

// patchUserAccount met à jour libellé, mot de passe chiffré, hôtes IMAP/SMTP (synchronisation et envoi).
func (h *Handler) patchUserAccount(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		Label    *string `json:"label"`
		Password *string `json:"password"`
		ImapHost *string `json:"imap_host"`
		ImapPort *int    `json:"imap_port"`
		SmtpHost *string `json:"smtp_host"`
		SmtpPort *int    `json:"smtp_port"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON invalide"})
		return
	}
	if body.Label == nil && body.Password == nil && body.ImapHost == nil && body.ImapPort == nil && body.SmtpHost == nil && body.SmtpPort == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à mettre à jour"})
		return
	}
	var exists int
	checkErr := h.db.QueryRow(`
		SELECT 1 FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&exists)
	if checkErr == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "compte introuvable"})
		return
	}
	if checkErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": checkErr.Error()})
		return
	}
	sets := []string{}
	args := []interface{}{}
	i := 1
	if body.Label != nil {
		sets = append(sets, fmt.Sprintf("label = NULLIF(TRIM($%d), '')", i))
		args = append(args, *body.Label)
		i++
	}
	if body.Password != nil {
		pw := strings.TrimSpace(*body.Password)
		if pw != "" {
			encStr, encErr := encryptPassword(pw)
			if encErr != nil || encStr == "" {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "impossible de chiffrer le mot de passe (clé MAIL_PASSWORD_ENCRYPTION_KEY ?)"})
				return
			}
			sets = append(sets, fmt.Sprintf("password_encrypted = $%d", i))
			args = append(args, encStr)
			i++
		}
	}
	if body.ImapHost != nil {
		hh := strings.TrimSpace(*body.ImapHost)
		if hh == "" {
			sets = append(sets, "imap_host = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("imap_host = $%d", i))
			args = append(args, hh)
			i++
		}
	}
	if body.ImapPort != nil {
		if *body.ImapPort <= 0 {
			sets = append(sets, "imap_port = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("imap_port = $%d", i))
			args = append(args, *body.ImapPort)
			i++
		}
	}
	if body.SmtpHost != nil {
		sh := strings.TrimSpace(*body.SmtpHost)
		if sh == "" {
			sets = append(sets, "smtp_host = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("smtp_host = $%d", i))
			args = append(args, sh)
			i++
		}
	}
	if body.SmtpPort != nil {
		if *body.SmtpPort <= 0 {
			sets = append(sets, "smtp_port = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("smtp_port = $%d", i))
			args = append(args, *body.SmtpPort)
			i++
		}
	}
	if len(sets) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucune modification applicable"})
		return
	}
	args = append(args, accountID)
	q := "UPDATE user_email_accounts SET " + strings.Join(sets, ", ") + fmt.Sprintf(" WHERE id = $%d AND user_id = current_setting('app.current_user_id', true)::INTEGER", i)
	res, execErr := h.db.Exec(q, args...)
	if execErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": execErr.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "compte introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type MailMessage struct {
	ID        int    `json:"id"`
	AccountID int    `json:"account_id"`
	Folder    string `json:"folder"`
	FromAddr  string `json:"from"`
	ToAddrs   string `json:"to"`
	Subject   string `json:"subject"`
	DateAt    string `json:"date_at,omitempty"`
	CreatedAt string `json:"created_at"`
	IsRead    bool   `json:"is_read"`
}

type MailMessageDetail struct {
	MailMessage
	BodyPlain string `json:"body_plain,omitempty"`
	BodyHTML  string `json:"body_html,omitempty"`
}

func (h *Handler) listAccountMessages(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	folder := c.DefaultQuery("folder", "inbox")
	limit := 25
	if l := c.Query("limit"); l != "" {
		if n, _ := strconv.Atoi(l); n > 0 && n <= 100 {
			limit = n
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if n, _ := strconv.Atoi(o); n >= 0 {
			offset = n
		}
	}
	var total int
	if err := h.db.QueryRow(`
		SELECT COUNT(*) FROM mail_messages WHERE account_id = $1 AND folder = $2
	`, accountID, folder).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rows, err := h.db.Query(`
		SELECT id, account_id, folder, from_addr, to_addrs, subject, date_at::text, created_at::text, COALESCE(is_read, false)
		FROM mail_messages
		WHERE account_id = $1 AND folder = $2
		ORDER BY date_at DESC NULLS LAST, id DESC
		LIMIT $3 OFFSET $4
	`, accountID, folder, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var msgList []MailMessage
	for rows.Next() {
		var m MailMessage
		var dateAt sql.NullString
		if err := rows.Scan(&m.ID, &m.AccountID, &m.Folder, &m.FromAddr, &m.ToAddrs, &m.Subject, &dateAt, &m.CreatedAt, &m.IsRead); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if dateAt.Valid {
			m.DateAt = dateAt.String
		}
		msgList = append(msgList, m)
	}
	if msgList == nil {
		msgList = []MailMessage{}
	}
	c.JSON(http.StatusOK, gin.H{"messages": msgList, "total": total})
}

func (h *Handler) getAccountMessage(c *gin.Context) {
	idStr := c.Param("id")
	msgIdStr := c.Param("msgId")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	msgID, err := strconv.Atoi(msgIdStr)
	if err != nil || msgID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}
	var m MailMessageDetail
	var dateAt sql.NullString
	var bodyPlain, bodyHTML sql.NullString
	var isRead bool
	var messageUID int64
	err = h.db.QueryRow(`
		SELECT id, account_id, folder, message_uid, from_addr, to_addrs, subject, date_at::text, created_at::text, COALESCE(is_read, false), body_plain, body_html
		FROM mail_messages
		WHERE id = $1 AND account_id = $2
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, msgID, accountID).Scan(&m.ID, &m.AccountID, &m.Folder, &messageUID, &m.FromAddr, &m.ToAddrs, &m.Subject, &dateAt, &m.CreatedAt, &isRead, &bodyPlain, &bodyHTML)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if dateAt.Valid {
		m.DateAt = dateAt.String
	}
	m.IsRead = isRead
	if bodyPlain.Valid {
		m.BodyPlain = bodyPlain.String
	}
	if bodyHTML.Valid {
		m.BodyHTML = bodyHTML.String
	}
	// Si le corps n'est pas en base, le récupérer depuis IMAP et le stocker (échec → 200 avec en-têtes seuls, pas 500)
	if !bodyPlain.Valid && !bodyHTML.Valid {
		plain, html, fetchErr := h.fetchMessageBodyFromIMAP(c, accountID, messageUID, m.Folder)
		if fetchErr != nil {
			log.Printf("[mail] corps IMAP message id=%d uid=%d: %v", msgID, messageUID, fetchErr)
		} else if plain != "" || html != "" {
			if _, upErr := h.db.Exec(`
				UPDATE mail_messages SET body_plain = $1, body_html = $2
				WHERE id = $3 AND account_id = $4
				AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
			`, nullStr(plain), nullStr(html), msgID, accountID); upErr != nil {
				log.Printf("[mail] sauvegarde corps message id=%d: %v", msgID, upErr)
			}
			m.BodyPlain = plain
			m.BodyHTML = html
		}
	}
	c.JSON(http.StatusOK, m)
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// fetchMessageBodyFromIMAP récupère le corps (plain + html) d'un message depuis IMAP et le retourne. Utilisé quand le corps n'est pas en base.
func (h *Handler) fetchMessageBodyFromIMAP(c *gin.Context, accountID int, messageUID int64, folder string) (plain, html string, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("IMAP (corps message): %v", r)
		}
	}()
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		return "", "", fmt.Errorf("X-User-ID required")
	}
	if _, err := h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", userID); err != nil {
		return "", "", err
	}
	var email string
	var enc, oauthRefreshEnc sql.NullString
	var dbImapHost sql.NullString
	var dbImapPort sql.NullInt32
	if err := h.db.QueryRow(`
		SELECT email, password_encrypted, oauth_refresh_token_encrypted, imap_host, imap_port
		FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&email, &enc, &oauthRefreshEnc, &dbImapHost, &dbImapPort); err == sql.ErrNoRows || err != nil {
		return "", "", err
	}
	password := ""
	useOAuth := oauthRefreshEnc.Valid && oauthRefreshEnc.String != ""
	if !useOAuth {
		if enc.Valid && enc.String != "" {
			password, _ = decryptPassword(enc.String)
		}
		if password == "" {
			return "", "", fmt.Errorf("mot de passe non disponible pour récupérer le corps du message")
		}
	}
	host, port, _ := imapHostPort(email)
	if dbImapHost.Valid && strings.TrimSpace(dbImapHost.String) != "" {
		host = strings.TrimSpace(dbImapHost.String)
	}
	if dbImapPort.Valid && dbImapPort.Int32 > 0 {
		port = int(dbImapPort.Int32)
	}
	addr := host + ":" + strconv.Itoa(port)
	var imapClient *client.Client
	if port == 993 {
		imapClient, err = client.DialTLS(addr, nil)
	} else {
		imapClient, err = client.Dial(addr)
	}
	if err != nil {
		return "", "", err
	}
	defer imapClient.Logout()
	if useOAuth {
		refreshTok, _ := decryptPassword(oauthRefreshEnc.String)
		if refreshTok == "" {
			return "", "", fmt.Errorf("OAuth refresh token non disponible")
		}
		accessToken, tokErr := getGoogleAccessToken(refreshTok)
		if tokErr != nil {
			return "", "", tokErr
		}
		ir := xoauth2InitialResponse(email, accessToken)
		if err := imapClient.Authenticate(&xoauth2SASL{ir: ir}); err != nil {
			return "", "", err
		}
	} else {
		if err := imapClient.Login(email, password); err != nil {
			return "", "", err
		}
	}
	mailbox := "INBOX"
	if folder != "inbox" {
		switch folder {
		case "sent":
			mailbox = "Sent"
		case "drafts":
			mailbox = "Drafts"
		case "spam":
			mailbox = "Spam"
		default:
			mailbox = "INBOX"
		}
	}
	if _, err := imapClient.Select(mailbox, false); err != nil {
		return "", "", err
	}
	seqset := new(imap.SeqSet)
	seqset.AddNum(uint32(messageUID))
	messages := make(chan *imap.Message, 24)
	done := make(chan error, 1)
	go func() {
		done <- imapClient.UidFetch(seqset, []imap.FetchItem{imap.FetchItem("BODY.PEEK[]")}, messages)
	}()
	var msg *imap.Message
	for m := range messages {
		if msg == nil && m != nil {
			msg = m
		}
	}
	if fetchErr := <-done; fetchErr != nil {
		return "", "", fetchErr
	}
	if msg == nil {
		return "", "", nil
	}
	var raw []byte
	for _, lit := range msg.Body {
		if lit != nil {
			raw, _ = io.ReadAll(lit)
			break
		}
	}
	if len(raw) == 0 {
		return "", "", nil
	}
	// Parser le MIME avec go-message
	mr, err := mail.CreateReader(bytes.NewReader(raw))
	if err != nil {
		return "", "", err
	}
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		ct := strings.ToLower(strings.TrimSpace(p.Header.Get("Content-Type")))
		if strings.HasPrefix(ct, "text/plain") && plain == "" {
			b, _ := io.ReadAll(p.Body)
			plain = strings.TrimSpace(string(b))
		} else if strings.HasPrefix(ct, "text/html") && html == "" {
			b, _ := io.ReadAll(p.Body)
			html = strings.TrimSpace(string(b))
		}
	}
	return plain, html, nil
}

func (h *Handler) markMessageRead(c *gin.Context) {
	idStr := c.Param("id")
	msgIdStr := c.Param("msgId")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	msgID, err := strconv.Atoi(msgIdStr)
	if err != nil || msgID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}
	var body struct {
		Read *bool `json:"read"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Read == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must contain \"read\": true|false"})
		return
	}
	res, err := h.db.Exec(`
		UPDATE mail_messages SET is_read = $1
		WHERE id = $2 AND account_id = $3
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, *body.Read, msgID, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "read": *body.Read})
}

var allowedFolders = map[string]bool{"inbox": true, "sent": true, "drafts": true, "spam": true, "trash": true}

func (h *Handler) moveMessageToFolder(c *gin.Context) {
	idStr := c.Param("id")
	msgIdStr := c.Param("msgId")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	msgID, err := strconv.Atoi(msgIdStr)
	if err != nil || msgID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message id"})
		return
	}
	var body struct {
		Folder *string `json:"folder"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Folder == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must contain \"folder\": \"inbox\"|\"sent\"|\"drafts\"|\"spam\"|\"trash\""})
		return
	}
	folder := strings.TrimSpace(strings.ToLower(*body.Folder))
	if !allowedFolders[folder] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "folder must be one of: inbox, sent, drafts, spam, trash"})
		return
	}
	res, err := h.db.Exec(`
		UPDATE mail_messages SET folder = $1
		WHERE id = $2 AND account_id = $3
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, folder, msgID, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "folder": folder})
}

// xoauth2RawBytes contenu brut XOAUTH2 (sans base64). SMTP fera le base64.
func xoauth2RawBytes(email, accessToken string) []byte {
	return []byte("user=" + email + "\x01auth=Bearer " + accessToken + "\x01\x01")
}

// xoauth2InitialResponse pour IMAP : base64 du contenu XOAUTH2 (le client n’encode pas une 2e fois).
func xoauth2InitialResponse(email, accessToken string) []byte {
	return []byte(base64.StdEncoding.EncodeToString(xoauth2RawBytes(email, accessToken)))
}

// xoauth2SASL implémente sasl.Client pour XOAUTH2 (Gmail).
type xoauth2SASL struct{ ir []byte }

func (x *xoauth2SASL) Start() (string, []byte, error) { return "XOAUTH2", x.ir, nil }
func (x *xoauth2SASL) Next([]byte) ([]byte, error)   { return nil, nil }

// getGoogleAccessToken échange le refresh_token contre un access_token.
func getGoogleAccessToken(refreshToken string) (string, error) {
	conf := &oauth2.Config{
		ClientID:     os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
		Endpoint:     google.Endpoint,
	}
	tok := &oauth2.Token{RefreshToken: refreshToken}
	ctx := context.Background()
	ts := conf.TokenSource(ctx, tok)
	newTok, err := ts.Token()
	if err != nil {
		return "", err
	}
	return newTok.AccessToken, nil
}

// imapHostPort returns (host, port) for known providers; otherwise derives imap.<domain> from the email.
func imapHostPort(email string) (host string, port int, useTLS bool) {
	port = 993
	useTLS = true
	lower := strings.TrimSpace(strings.ToLower(email))
	// Fournisseurs connus (hosts spécifiques)
	if strings.Contains(lower, "@outlook.") || strings.Contains(lower, "@hotmail.") || strings.Contains(lower, "@live.") {
		return "outlook.office365.com", port, useTLS
	}
	if strings.Contains(lower, "@yahoo.") || strings.Contains(lower, "@ymail.") {
		return "imap.mail.yahoo.com", port, useTLS
	}
	if strings.Contains(lower, "@icloud.") {
		return "imap.mail.me.com", port, useTLS
	}
	if strings.Contains(lower, "@ovh.") || strings.Contains(lower, ".ovh") {
		return "ssl0.ovh.net", port, useTLS
	}
	if strings.Contains(lower, "@gmail.") || strings.Contains(lower, "@googlemail.") {
		return "imap.gmail.com", port, useTLS
	}
	// Toute autre adresse : déduction automatique à partir du domaine (imap.<domaine>)
	if at := strings.LastIndex(lower, "@"); at >= 0 && at < len(lower)-1 {
		domain := strings.TrimSpace(lower[at+1:])
		if domain != "" && strings.Contains(domain, ".") && !strings.ContainsAny(domain, " \t") {
			return "imap." + domain, port, useTLS
		}
	}
	return "imap.gmail.com", port, useTLS
}

func (h *Handler) syncAccountIMAP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		Password  string `json:"password"`
		ImapHost  string `json:"imap_host"`
		ImapPort  int    `json:"imap_port"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body JSON invalide"})
		return
	}
	password := strings.TrimSpace(body.Password)
	var email string
	var enc, oauthRefreshEnc sql.NullString
	var dbImapHost sql.NullString
	var dbImapPort sql.NullInt32
	err = h.db.QueryRow(`
		SELECT email, password_encrypted, oauth_refresh_token_encrypted, imap_host, imap_port
		FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&email, &enc, &oauthRefreshEnc, &dbImapHost, &dbImapPort)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	useOAuth := oauthRefreshEnc.Valid && oauthRefreshEnc.String != ""
	if !useOAuth {
		if password == "" && enc.Valid && enc.String != "" {
			password, err = decryptPassword(enc.String)
			if err != nil {
				log.Printf("[mail] decrypt stored password: %v", err)
			}
		}
		if password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mot de passe requis pour la synchronisation (saisissez-le à l'ajout de la boîte ou ici)"})
			return
		}
	}
	host := strings.TrimSpace(body.ImapHost)
	port := body.ImapPort
	if host == "" && dbImapHost.Valid && strings.TrimSpace(dbImapHost.String) != "" {
		host = strings.TrimSpace(dbImapHost.String)
	}
	if port <= 0 && dbImapPort.Valid && dbImapPort.Int32 > 0 {
		port = int(dbImapPort.Int32)
	}
	if host == "" || port <= 0 {
		host, port, _ = imapHostPort(email)
	}
	addr := host
	if port > 0 {
		addr = host + ":" + strconv.Itoa(port)
	} else {
		addr = host + ":993"
	}
	var imapClient *client.Client
	if port == 993 || port == 0 {
		imapClient, err = client.DialTLS(addr, nil)
	} else {
		imapClient, err = client.Dial(addr)
	}
	if err != nil {
		log.Printf("[mail] IMAP dial %s: %v", addr, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "impossible de se connecter au serveur IMAP: " + err.Error()})
		return
	}
	defer imapClient.Logout()
	if useOAuth {
		refreshTok, decErr := decryptPassword(oauthRefreshEnc.String)
		if decErr != nil || refreshTok == "" {
			log.Printf("[mail] OAuth decrypt refresh: %v", decErr)
			c.JSON(http.StatusBadRequest, gin.H{"error": "compte OAuth : impossible de lire le jeton. Reconnectez la boîte avec Google."})
			return
		}
		accessToken, tokErr := getGoogleAccessToken(refreshTok)
		if tokErr != nil {
			log.Printf("[mail] OAuth token: %v", tokErr)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "OAuth Google expiré ou révoqué. Reconnectez la boîte avec « Se connecter avec Google »."})
			return
		}
		ir := xoauth2InitialResponse(email, accessToken)
		if err := imapClient.Authenticate(&xoauth2SASL{ir: ir}); err != nil {
			log.Printf("[mail] IMAP XOAUTH2 %s: %v", email, err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "connexion IMAP OAuth échouée. Reconnectez avec Google."})
			return
		}
	} else {
		log.Printf("[mail] IMAP connexion %s → %s", email, addr)
		if err := imapClient.Login(email, password); err != nil {
			log.Printf("[mail] IMAP login %s: %v", email, err)
			msg := "Identifiants refusés par le serveur mail. Vérifiez le mot de passe (attention aux caractères spéciaux : &, @, etc.) et que l'accès IMAP est activé pour cette boîte dans les paramètres de votre hébergeur."
			if strings.Contains(strings.ToLower(email), "@gmail.") || strings.Contains(strings.ToLower(email), "@googlemail.") {
				msg = "Comme Thunderbird ou BlueMail : utilisez un mot de passe d'application Gmail (Paramètres Google > Sécurité > Mots de passe des applications)."
			} else if strings.Contains(strings.ToLower(email), ".ovh") || strings.Contains(strings.ToLower(email), "@ovh.") {
				msg = "Identifiants refusés par OVH. Vérifiez le mot de passe dans l'espace client OVH (Manager > Emails) et que l'accès IMAP est autorisé pour cette boîte."
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": msg})
			return
		}
	}
	// Dossiers à synchroniser : (nom IMAP à essayer, nom en base). Pour Gmail vs autres fournisseurs.
	type folderTry struct {
		imapNames []string
		dbFolder  string
	}
	foldersToSync := []folderTry{
		{[]string{"INBOX"}, "inbox"},
		{[]string{"Sent", "[Gmail]/Sent Mail", "INBOX.Sent"}, "sent"},
		{[]string{"Drafts", "[Gmail]/Drafts", "INBOX.Drafts"}, "drafts"},
		{[]string{"Spam", "Junk", "[Gmail]/Spam", "INBOX.Spam"}, "spam"},
	}
	var totalSynced int
	for _, ft := range foldersToSync {
		var mbox *imap.MailboxStatus
		var selected bool
		for _, imapName := range ft.imapNames {
			m, err := imapClient.Select(imapName, false)
			if err != nil {
				continue
			}
			mbox = m
			selected = true
			break
		}
		if !selected || mbox == nil || mbox.Messages == 0 {
			continue
		}
		seqset := new(imap.SeqSet)
		from := uint32(1)
		to := mbox.Messages
		if mbox.Messages > 300 {
			from = mbox.Messages - 299
		}
		seqset.AddRange(from, to)
		messages := make(chan *imap.Message, 20)
		go func() {
			if err := imapClient.Fetch(seqset, []imap.FetchItem{imap.FetchEnvelope, imap.FetchUid}, messages); err != nil {
				log.Printf("[mail] Fetch %s: %v", ft.dbFolder, err)
			}
		}()
		for msg := range messages {
			if msg.Envelope == nil {
				continue
			}
			fromAddr := ""
			if len(msg.Envelope.From) > 0 {
				fromAddr = msg.Envelope.From[0].Address()
			}
			toAddrs := ""
			for i, a := range msg.Envelope.To {
				if i > 0 {
					toAddrs += ", "
				}
				toAddrs += a.Address()
			}
			subject := msg.Envelope.Subject
			dateAt := msg.Envelope.Date
			if dateAt.IsZero() {
				dateAt = time.Now()
			}
			res, err := h.db.Exec(`
				INSERT INTO mail_messages (account_id, folder, message_uid, from_addr, to_addrs, subject, date_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (account_id, folder, message_uid) DO NOTHING
			`, accountID, ft.dbFolder, msg.Uid, fromAddr, toAddrs, subject, dateAt)
			if err != nil {
				log.Printf("[mail] insert message: %v", err)
				continue
			}
			n, _ := res.RowsAffected()
			totalSynced += int(n)
		}
	}
	c.JSON(http.StatusOK, gin.H{"synced": totalSynced, "message": "synchronisation terminée"})
}

// smtpXOAUTH2Auth implémente smtp.Auth pour Gmail SMTP avec OAuth2.
type smtpXOAUTH2Auth struct {
	email, accessToken string
}

func (a *smtpXOAUTH2Auth) Start(server *smtp.ServerInfo) (string, []byte, error) {
	return "XOAUTH2", xoauth2RawBytes(a.email, a.accessToken), nil
}
func (a *smtpXOAUTH2Auth) Next(fromServer []byte, more bool) ([]byte, error) {
	if more {
		return []byte(""), nil // Gmail peut envoyer un challenge vide
	}
	return nil, nil
}

func smtpHostPort(email string) (host string, port int) {
	port = 587
	lower := strings.TrimSpace(strings.ToLower(email))
	if strings.Contains(lower, "@outlook.") || strings.Contains(lower, "@hotmail.") || strings.Contains(lower, "@live.") {
		return "smtp.office365.com", port
	}
	if strings.Contains(lower, "@yahoo.") || strings.Contains(lower, "@ymail.") {
		return "smtp.mail.yahoo.com", port
	}
	if strings.Contains(lower, "@icloud.") {
		return "smtp.mail.me.com", port
	}
	if strings.Contains(lower, "@ovh.") || strings.Contains(lower, ".ovh") {
		return "ssl0.ovh.net", port
	}
	if strings.Contains(lower, "@gmail.") || strings.Contains(lower, "@googlemail.") {
		return "smtp.gmail.com", port
	}
	// Toute autre adresse : déduction automatique smtp.<domaine>
	if at := strings.LastIndex(lower, "@"); at >= 0 && at < len(lower)-1 {
		domain := strings.TrimSpace(lower[at+1:])
		if domain != "" && strings.Contains(domain, ".") && !strings.ContainsAny(domain, " \t") {
			return "smtp." + domain, port
		}
	}
	return "smtp.gmail.com", port
}

func (h *Handler) sendMessageSMTP(c *gin.Context) {
	var body struct {
		AccountID int    `json:"account_id" binding:"required"`
		Password  string `json:"password"`
		To        string `json:"to" binding:"required"`
		Subject   string `json:"subject"`
		Body      string `json:"body"`
		SmtpHost  string `json:"smtp_host"`
		SmtpPort  int    `json:"smtp_port"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_id et to requis"})
		return
	}
	to := strings.TrimSpace(strings.ToLower(body.To))
	if to == "" || !strings.Contains(to, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "destinataire invalide"})
		return
	}
	var email string
	var passwordEnc, oauthRefreshEnc sql.NullString
	var dbSmtpHost sql.NullString
	var dbSmtpPort sql.NullInt32
	err := h.db.QueryRow(`
		SELECT email, password_encrypted, oauth_refresh_token_encrypted, smtp_host, smtp_port
		FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.AccountID).Scan(&email, &passwordEnc, &oauthRefreshEnc, &dbSmtpHost, &dbSmtpPort)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "compte non trouvé"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	host := strings.TrimSpace(body.SmtpHost)
	port := body.SmtpPort
	if host == "" && dbSmtpHost.Valid && strings.TrimSpace(dbSmtpHost.String) != "" {
		host = strings.TrimSpace(dbSmtpHost.String)
	}
	if port <= 0 && dbSmtpPort.Valid && dbSmtpPort.Int32 > 0 {
		port = int(dbSmtpPort.Int32)
	}
	if host == "" || port <= 0 {
		host, port = smtpHostPort(email)
	}
	addr := fmt.Sprintf("%s:%d", host, port)
	var auth smtp.Auth
	useOAuth := oauthRefreshEnc.Valid && oauthRefreshEnc.String != ""
	if useOAuth {
		refreshTok, decErr := decryptPassword(oauthRefreshEnc.String)
		if decErr != nil || refreshTok == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "compte OAuth : reconnectez avec Google pour envoyer."})
			return
		}
		accessToken, tokErr := getGoogleAccessToken(refreshTok)
		if tokErr != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "OAuth expiré. Reconnectez la boîte avec Google."})
			return
		}
		auth = &smtpXOAUTH2Auth{email: email, accessToken: accessToken}
	} else {
		password := strings.TrimSpace(body.Password)
		if password == "" && passwordEnc.Valid && passwordEnc.String != "" {
			password, _ = decryptPassword(passwordEnc.String)
		}
		if password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mot de passe requis pour l'envoi (saisissez-le dans le formulaire ou reconnectez la boîte en le renseignant)"})
			return
		}
		auth = smtp.PlainAuth("", email, password, host)
	}
	subject := body.Subject
	if subject == "" {
		subject = "(sans objet)"
	}
	msg := []byte("From: " + email + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body.Body)
	if err := smtp.SendMail(addr, auth, email, []string{to}, msg); err != nil {
		log.Printf("[mail] SMTP send: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "envoi SMTP échoué: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "message envoyé"})
}
