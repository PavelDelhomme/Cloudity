package main

import (
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
		mail.DELETE("/me/accounts/:id", h.deleteUserAccount)
		mail.GET("/me/accounts/:id/messages", h.listAccountMessages)
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
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func (h *Handler) listUserAccounts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id, user_id, tenant_id, email, label, created_at::text, COALESCE(updated_at::text, '')
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
		var uat string
		if err := rows.Scan(&a.ID, &a.UserID, &a.TenantID, &a.Email, &label, &a.CreatedAt, &uat); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if label.Valid {
			a.Label = label.String
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

type MailMessage struct {
	ID        int    `json:"id"`
	AccountID int    `json:"account_id"`
	Folder    string `json:"folder"`
	FromAddr  string `json:"from"`
	ToAddrs   string `json:"to"`
	Subject   string `json:"subject"`
	DateAt    string `json:"date_at,omitempty"`
	CreatedAt string `json:"created_at"`
}

func (h *Handler) listAccountMessages(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	folder := c.DefaultQuery("folder", "inbox")
	rows, err := h.db.Query(`
		SELECT id, account_id, folder, from_addr, to_addrs, subject, date_at::text, created_at::text
		FROM mail_messages
		WHERE account_id = $1 AND folder = $2
		ORDER BY date_at DESC NULLS LAST, id DESC
		LIMIT 100
	`, accountID, folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var msgList []MailMessage
	for rows.Next() {
		var m MailMessage
		var dateAt sql.NullString
		if err := rows.Scan(&m.ID, &m.AccountID, &m.Folder, &m.FromAddr, &m.ToAddrs, &m.Subject, &dateAt, &m.CreatedAt); err != nil {
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
	c.JSON(http.StatusOK, msgList)
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

// imapHostPort returns (host, port) for common providers; default imap.gmail.com:993 for Gmail.
func imapHostPort(email string) (host string, port int, useTLS bool) {
	host = "imap.gmail.com"
	port = 993
	useTLS = true
	lower := strings.ToLower(email)
	if strings.Contains(lower, "@outlook.") || strings.Contains(lower, "@hotmail.") || strings.Contains(lower, "@live.") {
		host = "outlook.office365.com"
		port = 993
	} else if strings.Contains(lower, "@yahoo.") || strings.Contains(lower, "@ymail.") {
		host = "imap.mail.yahoo.com"
		port = 993
	} else if strings.Contains(lower, "@icloud.") {
		host = "imap.mail.me.com"
		port = 993
	}
	return host, port, useTLS
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
	err = h.db.QueryRow(`
		SELECT email, password_encrypted, oauth_refresh_token_encrypted FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&email, &enc, &oauthRefreshEnc)
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
		if err := imapClient.Login(email, password); err != nil {
			log.Printf("[mail] IMAP login %s: %v", email, err)
			msg := "identifiants invalides ou accès refusé"
			if strings.Contains(strings.ToLower(email), "@gmail.") || strings.Contains(strings.ToLower(email), "@googlemail.") {
				msg = "Comme Thunderbird ou BlueMail : utilisez un mot de passe d'application Gmail (Paramètres Google > Sécurité > Mots de passe des applications)."
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": msg})
			return
		}
	}
	mbox, err := imapClient.Select("INBOX", false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "sélection INBOX: " + err.Error()})
		return
	}
	if mbox.Messages == 0 {
		c.JSON(http.StatusOK, gin.H{"synced": 0, "message": "aucun message"})
		return
	}
	seqset := new(imap.SeqSet)
	from := uint32(1)
	to := mbox.Messages
	if mbox.Messages > 200 {
		from = mbox.Messages - 199
	}
	seqset.AddRange(from, to)
	messages := make(chan *imap.Message, 20)
	go func() {
		if err := imapClient.Fetch(seqset, []imap.FetchItem{imap.FetchEnvelope, imap.FetchUid}, messages); err != nil {
			log.Printf("[mail] Fetch: %v", err)
		}
	}()
	var synced int
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
		_, err := h.db.Exec(`
			INSERT INTO mail_messages (account_id, folder, message_uid, from_addr, to_addrs, subject, date_at)
			VALUES ($1, 'inbox', $2, $3, $4, $5, $6)
			ON CONFLICT (account_id, folder, message_uid) DO NOTHING
		`, accountID, msg.Uid, fromAddr, toAddrs, subject, dateAt)
		if err != nil {
			log.Printf("[mail] insert message: %v", err)
			continue
		}
		synced++
	}
	c.JSON(http.StatusOK, gin.H{"synced": synced, "message": "synchronisation terminée"})
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
	host = "smtp.gmail.com"
	port = 587
	lower := strings.ToLower(email)
	if strings.Contains(lower, "@outlook.") || strings.Contains(lower, "@hotmail.") || strings.Contains(lower, "@live.") {
		host = "smtp.office365.com"
		port = 587
	} else if strings.Contains(lower, "@yahoo.") || strings.Contains(lower, "@ymail.") {
		host = "smtp.mail.yahoo.com"
		port = 587
	} else if strings.Contains(lower, "@icloud.") {
		host = "smtp.mail.me.com"
		port = 587
	}
	return host, port
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
	var oauthRefreshEnc sql.NullString
	err := h.db.QueryRow(`
		SELECT email, oauth_refresh_token_encrypted FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.AccountID).Scan(&email, &oauthRefreshEnc)
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
		if password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mot de passe requis pour l'envoi (ou connectez la boîte avec Google)"})
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
