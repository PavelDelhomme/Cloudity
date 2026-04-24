package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"

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

// from_addr est VARCHAR(512) : on tronque pour éviter une erreur SQL sur les noms très longs.
const maxFromAddrLen = 508

// formatImapAddress produit une chaîne type RFC5322 « Nom affiché » <email@domaine>
// (comme les clients type BlueMail), au lieu de l’adresse seule via Address().
func formatImapAddress(a *imap.Address) string {
	if a == nil {
		return ""
	}
	addr := strings.TrimSpace(a.Address())
	if addr == "" || addr == "@" {
		return ""
	}
	name := strings.TrimSpace(a.PersonalName)
	if name == "" {
		return truncateMailField(addr, maxFromAddrLen)
	}
	needQuote := strings.ContainsAny(name, `",;<>()`) || strings.Contains(name, "\n") || strings.Contains(name, "\\")
	if needQuote {
		name = strings.ReplaceAll(name, `\`, `\\`)
		name = strings.ReplaceAll(name, `"`, `\"`)
		name = `"` + name + `"`
	}
	s := name + " <" + addr + ">"
	return truncateMailField(s, maxFromAddrLen)
}

func formatImapAddressList(addrs []*imap.Address) string {
	var parts []string
	for _, a := range addrs {
		if s := formatImapAddress(a); s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, ", ")
}

func truncateMailField(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// spamHeuristicScore score 0–100 (heuristique locale, sans ML) pour signaler le spam probable.
func spamHeuristicScore(subject, fromAddr string) int {
	sl := strings.ToLower(strings.TrimSpace(subject))
	fl := strings.ToLower(fromAddr)
	s := sl + " " + fl
	score := 0
	for _, w := range []string{
		"viagra", "cialis", "crypto", "bitcoin", "lottery", "you won", "winner", "you've won",
		"click here", "click now", "act now", "limited time", "congratulations",
		"urgent:", "invoice attached", "wire transfer", "verify your account",
		"account suspended", "free gift", "100% free", "no obligation",
		// FR + phishing courant
		"gagnez", "gagner", "remboursement", "remboursez", "sécurité", "securite",
		"validez votre", "confirmez votre compte", "mise à jour obligatoire", "mise a jour obligatoire",
		"compte bloqué", "compte bloque", "paiement refusé", "paiement refuse",
		"facture impayée", "facture impayee", "colis en attente", "livraison échouée", "livraison echouee",
		"heriter", "héritage", "heritage", "western union", "moneygram",
		"prince nigeria", "bitcoin wallet", "seed phrase", "private key",
		"référencement google", "referencement google", "backlink",
	} {
		if strings.Contains(s, w) {
			score += 12
		}
	}
	if len(subject) > 14 && subject == strings.ToUpper(subject) && strings.ContainsAny(subject, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
		score += 18
	}
	if strings.Count(sl, "!") >= 3 {
		score += 10
	}
	if strings.Count(sl, "?") >= 3 {
		score += 6
	}
	if sl == "" && fl != "" {
		score += 8
	}
	if strings.Contains(fl, "mailer-daemon@") || strings.Contains(fl, "postmaster@") {
		score += 8
	}
	// Domaines souvent abusifs (heuristique légère, pas un blocage)
	if dom := spamExtractEmailDomain(fl); dom != "" {
		for _, suf := range []string{".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".work", ".click", ".loan", ".zip"} {
			if strings.HasSuffix(dom, suf) {
				score += 22
				break
			}
		}
		if strings.Count(dom, ".") >= 3 {
			score += 6
		}
	}
	if score > 100 {
		return 100
	}
	return score
}

func spamExtractEmailDomain(fromLower string) string {
	fromLower = strings.TrimSpace(fromLower)
	if fromLower == "" {
		return ""
	}
	if i := strings.LastIndex(fromLower, "@"); i >= 0 && i < len(fromLower)-1 {
		return strings.TrimSpace(fromLower[i+1:])
	}
	if strings.Contains(fromLower, "<") {
		start := strings.LastIndex(fromLower, "<")
		end := strings.LastIndex(fromLower, ">")
		if start >= 0 && end > start {
			inner := strings.TrimSpace(fromLower[start+1 : end])
			if i := strings.LastIndex(inner, "@"); i >= 0 && i < len(inner)-1 {
				return strings.TrimSpace(inner[i+1:])
			}
		}
	}
	return ""
}

func safeLikeContains(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.ReplaceAll(s, "%", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, "\\", "")
	if s == "" {
		return ""
	}
	return "%" + s + "%"
}

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
		mail.GET("/me/accounts/:id/aliases", h.listAccountAliases)
		mail.POST("/me/accounts/:id/aliases", h.createAccountAlias)
		mail.PATCH("/me/accounts/:id/aliases/:aliasId", h.patchAccountAlias)
		mail.DELETE("/me/accounts/:id/aliases/:aliasId", h.deleteAccountAlias)
		mail.GET("/me/accounts/:id/folders/summary", h.accountFolderSummary)
		mail.GET("/me/accounts/:id/imap-folders", h.listImapFoldersHTTP)
		mail.POST("/me/accounts/:id/imap-folders/rename", h.renameImapFolderHTTP)
		mail.POST("/me/accounts/:id/imap-folders/delete", h.deleteImapFolderHTTP)
		mail.POST("/me/accounts/:id/imap-folders", h.createImapFolderHTTP)
		mail.GET("/me/accounts/:id/tags", h.listMailTagsHTTP)
		mail.POST("/me/accounts/:id/tags", h.createMailTagHTTP)
		mail.PUT("/me/accounts/:id/messages/:msgId/tags", h.putMessageTagsHTTP)
		mail.GET("/me/messages/unified", h.listUnifiedUserMessages)
		mail.GET("/me/accounts/:id/messages", h.listAccountMessages)
		mail.GET("/me/accounts/:id/messages/:msgId/attachments/:attId", h.downloadMailAttachmentHTTP)
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
	var accountEmail string
	if err := h.db.QueryRow(`
		SELECT LOWER(TRIM(email)) FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, id).Scan(&accountEmail); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var loginEmail sql.NullString
	if err := h.db.QueryRow(`
		SELECT LOWER(TRIM(email)) FROM users WHERE id = current_setting('app.current_user_id', true)::INTEGER
	`).Scan(&loginEmail); err != nil || !loginEmail.Valid || strings.TrimSpace(loginEmail.String) == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "profil utilisateur introuvable"})
		return
	}
	if accountEmail == strings.TrimSpace(loginEmail.String) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Impossible de retirer la boîte dont l’adresse est identique à votre compte Cloudity : vous perdriez l’accès à l’application. Utilisez une autre adresse pour vos tests.",
		})
		return
	}
	// CASCADE : messages, pièces jointes, dossiers IMAP, étiquettes, alias — tout ce qui référence account_id.
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

type MailAlias struct {
	ID                 int     `json:"id"`
	AccountID          int     `json:"account_id"`
	AliasEmail         string  `json:"alias_email"`
	Label              *string `json:"label,omitempty"`
	DeliverTargetEmail *string `json:"deliver_target_email,omitempty"`
	CreatedAt          string  `json:"created_at"`
}

func (h *Handler) listAccountAliases(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	rows, err := h.db.Query(`
		SELECT a.id, a.account_id, a.alias_email, a.label, a.deliver_target_email, a.created_at::text
		FROM user_email_aliases a
		INNER JOIN user_email_accounts u ON u.id = a.account_id
		WHERE a.account_id = $1 AND u.user_id = current_setting('app.current_user_id', true)::INTEGER
		ORDER BY a.alias_email
	`, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []MailAlias
	for rows.Next() {
		var x MailAlias
		var lab, dte sql.NullString
		if err := rows.Scan(&x.ID, &x.AccountID, &x.AliasEmail, &lab, &dte, &x.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if lab.Valid && strings.TrimSpace(lab.String) != "" {
			s := lab.String
			x.Label = &s
		}
		if dte.Valid && strings.TrimSpace(dte.String) != "" {
			s := strings.TrimSpace(dte.String)
			x.DeliverTargetEmail = &s
		}
		list = append(list, x)
	}
	if list == nil {
		list = []MailAlias{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createAccountAlias(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		AliasEmail         string `json:"alias_email"`
		Label              string `json:"label"`
		DeliverTargetEmail string `json:"deliver_target_email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	em := strings.TrimSpace(strings.ToLower(body.AliasEmail))
	if em == "" || !strings.Contains(em, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "alias_email invalide"})
		return
	}
	dt := strings.TrimSpace(body.DeliverTargetEmail)
	var dtArg interface{}
	if dt != "" {
		dtArg = dt
	} else {
		dtArg = nil
	}
	var n int
	if err := h.db.QueryRow(`
		SELECT COUNT(*) FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&n); err != nil || n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "compte introuvable"})
		return
	}
	var newID int
	err = h.db.QueryRow(`
		INSERT INTO user_email_aliases (account_id, alias_email, label, deliver_target_email)
		VALUES ($1, $2, NULLIF(TRIM($3), ''), $4)
		ON CONFLICT (account_id, alias_email) DO UPDATE SET
			label = COALESCE(NULLIF(EXCLUDED.label, ''), user_email_aliases.label),
			deliver_target_email = COALESCE(EXCLUDED.deliver_target_email, user_email_aliases.deliver_target_email)
		RETURNING id
	`, accountID, em, body.Label, dtArg).Scan(&newID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": newID, "alias_email": em})
}

func (h *Handler) deleteAccountAlias(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	aliasID, err := strconv.Atoi(c.Param("aliasId"))
	if err != nil || aliasID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alias id"})
		return
	}
	res, err := h.db.Exec(`
		DELETE FROM user_email_aliases a USING user_email_accounts u
		WHERE a.id = $1 AND a.account_id = $2 AND u.id = a.account_id
		AND u.user_id = current_setting('app.current_user_id', true)::INTEGER
	`, aliasID, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "alias introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) patchAccountAlias(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	aliasID, err := strconv.Atoi(c.Param("aliasId"))
	if err != nil || aliasID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alias id"})
		return
	}
	var body struct {
		Label              *string `json:"label"`
		DeliverTargetEmail *string `json:"deliver_target_email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	if body.Label == nil && body.DeliverTargetEmail == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à modifier (label ou deliver_target_email)"})
		return
	}
	var sets []string
	var args []interface{}
	p := 1
	if body.Label != nil {
		t := strings.TrimSpace(*body.Label)
		if t == "" {
			sets = append(sets, "label = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("label = $%d", p))
			args = append(args, t)
			p++
		}
	}
	if body.DeliverTargetEmail != nil {
		t := strings.TrimSpace(*body.DeliverTargetEmail)
		if t == "" {
			sets = append(sets, "deliver_target_email = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("deliver_target_email = $%d", p))
			args = append(args, t)
			p++
		}
	}
	args = append(args, aliasID, accountID)
	q := fmt.Sprintf(`
		UPDATE user_email_aliases a SET %s
		FROM user_email_accounts u
		WHERE a.id = $%d AND a.account_id = $%d AND a.account_id = u.id
		AND u.user_id = current_setting('app.current_user_id', true)::INTEGER
	`, strings.Join(sets, ", "), p, p+1)
	res, execErr := h.db.Exec(q, args...)
	if execErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": execErr.Error()})
		return
	}
	naff, _ := res.RowsAffected()
	if naff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "alias introuvable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /mail/me/accounts/:id/folders/summary — totaux et non-lus par dossier (badges UI).
func (h *Handler) accountFolderSummary(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var dummy int
	err = h.db.QueryRow(`
		SELECT 1 FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&dummy)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "compte introuvable"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type folderStat struct {
		Total  int `json:"total"`
		Unread int `json:"unread"`
	}
	type extraFolderStat struct {
		Folder string `json:"folder"`
		Total  int    `json:"total"`
		Unread int    `json:"unread"`
	}
	out := gin.H{
		"inbox":   folderStat{},
		"sent":    folderStat{},
		"drafts":  folderStat{},
		"archive": folderStat{},
		"spam":    folderStat{},
		"trash":   folderStat{},
		"extra":   []extraFolderStat{},
	}
	rows, qerr := h.db.Query(`
		SELECT folder,
			COUNT(*)::int,
			COALESCE(SUM(CASE WHEN NOT COALESCE(is_read, false) THEN 1 ELSE 0 END), 0)::int
		FROM mail_messages
		WHERE account_id = $1
		GROUP BY folder
	`, accountID)
	if qerr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": qerr.Error()})
		return
	}
	defer rows.Close()
	var extra []extraFolderStat
	for rows.Next() {
		var f string
		var total, unread int
		if err := rows.Scan(&f, &total, &unread); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if isStandardMailFolder(f) {
			out[strings.ToLower(strings.TrimSpace(f))] = folderStat{Total: total, Unread: unread}
		} else {
			extra = append(extra, extraFolderStat{Folder: f, Total: total, Unread: unread})
		}
	}
	if extra == nil {
		extra = []extraFolderStat{}
	}
	out["extra"] = extra
	c.JSON(http.StatusOK, out)
}

type MailMessage struct {
	ID              int    `json:"id"`
	AccountID       int    `json:"account_id"`
	Folder          string `json:"folder"`
	FromAddr        string `json:"from"`
	ToAddrs         string `json:"to"`
	Subject         string `json:"subject"`
	DateAt          string `json:"date_at,omitempty"`
	CreatedAt       string `json:"created_at"`
	IsRead          bool   `json:"is_read"`
	SpamScore       int    `json:"spam_score"`
	ThreadKey       string `json:"thread_key,omitempty"`
	AttachmentCount int    `json:"attachment_count"`
	TagIDs          []int  `json:"tag_ids,omitempty"`
}

type MailAttachmentInfo struct {
	ID           int    `json:"id"`
	Filename     string `json:"filename"`
	ContentType  string `json:"content_type"`
	SizeBytes    int    `json:"size_bytes"`
	StoredInline bool   `json:"stored_inline"`
}

type MailMessageDetail struct {
	MailMessage
	BodyPlain   string               `json:"body_plain,omitempty"`
	BodyHTML    string               `json:"body_html,omitempty"`
	RawHeaders  string               `json:"raw_headers,omitempty"`
	Attachments []MailAttachmentInfo `json:"attachments,omitempty"`
}

func parseMessageTagCSV(s string) []int {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var out []int
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err == nil && n > 0 {
			out = append(out, n)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func (h *Handler) listAccountMessages(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	folder := normalizeMailFolderQuery(c.DefaultQuery("folder", "inbox"))
	tagID, _ := strconv.Atoi(c.Query("tag_id"))
	threadKey := strings.TrimSpace(c.Query("thread_key"))
	if !h.folderAllowed(accountID, folder) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dossier inconnu ou non autorisé"})
		return
	}
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
	rcp := safeLikeContains(c.Query("recipient"))
	dlv := safeLikeContains(c.Query("delivered_to"))
	tagJoin := ""
	if tagID > 0 {
		tagJoin = fmt.Sprintf(" INNER JOIN mail_message_tags mt ON mt.message_id = m.id AND mt.tag_id = %d", tagID)
	}
	isAll := strings.EqualFold(folder, "all")
	var args []interface{}
	p := 2
	folderSQL := ""
	// Vue « all » : agrégat « courrier utile » — pas corbeille / spam / brouillons (dossiers dédiés dans la barre latérale).
	allFolderExclude := ""
	if isAll {
		args = []interface{}{accountID}
		allFolderExclude = " AND LOWER(TRIM(m.folder)) NOT IN ('trash', 'spam', 'drafts')"
	} else {
		args = []interface{}{accountID, folder}
		folderSQL = " AND m.folder = $2"
		p = 3
	}
	extraWhere := ""
	if threadKey != "" {
		extraWhere += fmt.Sprintf(" AND m.thread_key = $%d", p)
		args = append(args, threadKey)
		p++
	}
	if dlv != "" {
		extraWhere += fmt.Sprintf(" AND LOWER(m.to_addrs) LIKE $%d", p)
		args = append(args, dlv)
		p++
	} else if rcp != "" {
		extraWhere += fmt.Sprintf(" AND (LOWER(m.to_addrs) LIKE $%d OR LOWER(m.from_addr) LIKE $%d OR LOWER(m.subject) LIKE $%d)", p, p, p)
		args = append(args, rcp)
		p++
	}
	countSQL := fmt.Sprintf(`SELECT COUNT(*) FROM mail_messages m%s WHERE m.account_id = $1%s%s%s`, tagJoin, folderSQL, allFolderExclude, extraWhere)
	var total int
	if countErr := h.db.QueryRow(countSQL, args...).Scan(&total); countErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": countErr.Error()})
		return
	}
	limitPh := fmt.Sprintf("$%d", p)
	offsetPh := fmt.Sprintf("$%d", p+1)
	argsSel := append(args, limit, offset)
	selectSQL := fmt.Sprintf(`
			SELECT m.id, m.account_id, m.folder, m.from_addr, m.to_addrs, m.subject, m.date_at::text, m.created_at::text, COALESCE(m.is_read, false),
				COALESCE(m.thread_key, ''), COALESCE(m.attachment_count, 0),
				COALESCE((SELECT string_agg(mt.tag_id::text, ',' ORDER BY mt.tag_id) FROM mail_message_tags mt WHERE mt.message_id = m.id), '')
			FROM mail_messages m%s
			WHERE m.account_id = $1%s%s%s
			ORDER BY m.date_at DESC NULLS LAST, m.id DESC
			LIMIT %s OFFSET %s
		`, tagJoin, folderSQL, allFolderExclude, extraWhere, limitPh, offsetPh)
	rows, err := h.db.Query(selectSQL, argsSel...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var msgList []MailMessage
	for rows.Next() {
		var m MailMessage
		var dateAt sql.NullString
		var tagCSV string
		if err := rows.Scan(&m.ID, &m.AccountID, &m.Folder, &m.FromAddr, &m.ToAddrs, &m.Subject, &dateAt, &m.CreatedAt, &m.IsRead, &m.ThreadKey, &m.AttachmentCount, &tagCSV); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if dateAt.Valid {
			m.DateAt = dateAt.String
		}
		m.TagIDs = parseMessageTagCSV(tagCSV)
		m.SpamScore = spamHeuristicScore(m.Subject, m.FromAddr)
		msgList = append(msgList, m)
	}
	if msgList == nil {
		msgList = []MailMessage{}
	}
	c.JSON(http.StatusOK, gin.H{"messages": msgList, "total": total})
}

// listUnifiedUserMessages liste le courrier « utile » agrégé sur toutes les boîtes du
// utilisateur (même exclusion que folder=all : pas corbeille / spam / brouillons).
// Les filtres tag_id ne s’appliquent pas ici (étiquettes par compte).
func (h *Handler) listUnifiedUserMessages(c *gin.Context) {
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
	rcp := safeLikeContains(c.Query("recipient"))
	dlv := safeLikeContains(c.Query("delivered_to"))
	threadKey := strings.TrimSpace(c.Query("thread_key"))

	baseAcct := `m.account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)`
	allFolderExclude := " AND LOWER(TRIM(m.folder)) NOT IN ('trash', 'spam', 'drafts')"
	extraWhere := ""
	args := []interface{}{}
	p := 1
	if threadKey != "" {
		extraWhere += fmt.Sprintf(" AND m.thread_key = $%d", p)
		args = append(args, threadKey)
		p++
	}
	if dlv != "" {
		extraWhere += fmt.Sprintf(" AND LOWER(m.to_addrs) LIKE $%d", p)
		args = append(args, dlv)
		p++
	} else if rcp != "" {
		extraWhere += fmt.Sprintf(" AND (LOWER(m.to_addrs) LIKE $%d OR LOWER(m.from_addr) LIKE $%d OR LOWER(m.subject) LIKE $%d)", p, p, p)
		args = append(args, rcp)
		p++
	}
	whereClause := baseAcct + allFolderExclude + extraWhere
	countSQL := fmt.Sprintf(`SELECT COUNT(*) FROM mail_messages m WHERE %s`, whereClause)
	var total int
	if countErr := h.db.QueryRow(countSQL, args...).Scan(&total); countErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": countErr.Error()})
		return
	}
	limitPh := fmt.Sprintf("$%d", p)
	offsetPh := fmt.Sprintf("$%d", p+1)
	argsSel := append(args, limit, offset)
	selectSQL := fmt.Sprintf(`
			SELECT m.id, m.account_id, m.folder, m.from_addr, m.to_addrs, m.subject, m.date_at::text, m.created_at::text, COALESCE(m.is_read, false),
				COALESCE(m.thread_key, ''), COALESCE(m.attachment_count, 0),
				COALESCE((SELECT string_agg(mt.tag_id::text, ',' ORDER BY mt.tag_id) FROM mail_message_tags mt WHERE mt.message_id = m.id), '')
			FROM mail_messages m
			WHERE %s
			ORDER BY m.date_at DESC NULLS LAST, m.account_id DESC, m.id DESC
			LIMIT %s OFFSET %s
		`, whereClause, limitPh, offsetPh)
	rows, err := h.db.Query(selectSQL, argsSel...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var msgList []MailMessage
	for rows.Next() {
		var m MailMessage
		var dateAt sql.NullString
		var tagCSV string
		if err := rows.Scan(&m.ID, &m.AccountID, &m.Folder, &m.FromAddr, &m.ToAddrs, &m.Subject, &dateAt, &m.CreatedAt, &m.IsRead, &m.ThreadKey, &m.AttachmentCount, &tagCSV); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if dateAt.Valid {
			m.DateAt = dateAt.String
		}
		m.TagIDs = parseMessageTagCSV(tagCSV)
		m.SpamScore = spamHeuristicScore(m.Subject, m.FromAddr)
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
	var bodyPlain, bodyHTML, rawHeadersDB sql.NullString
	var isRead bool
	var messageUID int64
	err = h.db.QueryRow(`
		SELECT id, account_id, folder, message_uid, from_addr, to_addrs, subject, date_at::text, created_at::text, COALESCE(is_read, false), body_plain, body_html,
			raw_headers,
			COALESCE(thread_key, ''), COALESCE(attachment_count, 0)
		FROM mail_messages
		WHERE id = $1 AND account_id = $2
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, msgID, accountID).Scan(&m.ID, &m.AccountID, &m.Folder, &messageUID, &m.FromAddr, &m.ToAddrs, &m.Subject, &dateAt, &m.CreatedAt, &isRead, &bodyPlain, &bodyHTML, &rawHeadersDB, &m.ThreadKey, &m.AttachmentCount)
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
	if rawHeadersDB.Valid {
		m.RawHeaders = rawHeadersDB.String
	}
	// Anciens messages : corps en base mais pas encore d’en-têtes bruts — compléter une fois depuis l’IMAP.
	if strings.TrimSpace(m.RawHeaders) == "" && messageUID > 0 && (bodyPlain.Valid || bodyHTML.Valid) {
		rawBackfill, fetchErr := h.fetchRawRFC822FromIMAP(c, accountID, messageUID, m.Folder)
		if fetchErr != nil {
			log.Printf("[mail] backfill raw_headers id=%d uid=%d folder=%q: %v", msgID, messageUID, m.Folder, fetchErr)
		} else if len(rawBackfill) > 0 {
			hdr := extractRawMIMEHeaders(rawBackfill)
			if strings.TrimSpace(hdr) != "" {
				if len(hdr) > maxRawHeadersBytes {
					hdr = hdr[:maxRawHeadersBytes]
				}
				if _, updErr := h.db.Exec(`
					UPDATE mail_messages SET raw_headers = $1
					WHERE id = $2 AND account_id = $3
					AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
				`, nullStr(hdr), msgID, accountID); updErr == nil {
					m.RawHeaders = hdr
				} else {
					log.Printf("[mail] backfill UPDATE raw_headers id=%d: %v", msgID, updErr)
				}
			}
		}
	}
	// Si le corps n'est pas en base, récupérer le RFC822 depuis IMAP : corps + pièces jointes + fil de discussion.
	if !bodyPlain.Valid && !bodyHTML.Valid {
		raw, fetchErr := h.fetchRawRFC822FromIMAP(c, accountID, messageUID, m.Folder)
		if fetchErr != nil {
			log.Printf("[mail] corps IMAP message id=%d uid=%d: %v", msgID, messageUID, fetchErr)
		} else if len(raw) > 0 {
			parsed, perr := parseRFC822Mail(raw)
			if perr != nil {
				log.Printf("[mail] parse MIME id=%d: %v", msgID, perr)
			} else {
				if saveErr := h.persistParsedMail(c, accountID, msgID, parsed); saveErr != nil {
					log.Printf("[mail] persistance parse id=%d: %v", msgID, saveErr)
				}
				m.BodyPlain = parsed.Plain
				m.BodyHTML = parsed.HTML
				m.RawHeaders = parsed.RawHeaders
				if parsed.Meta.ThreadKey != "" {
					m.ThreadKey = parsed.Meta.ThreadKey
				}
				m.AttachmentCount = parsed.Meta.AttachmentCount
			}
		}
	}
	m.Attachments = h.loadMessageAttachmentInfo(msgID)
	m.SpamScore = spamHeuristicScore(m.Subject, m.FromAddr)
	c.JSON(http.StatusOK, m)
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func (h *Handler) persistParsedMail(c *gin.Context, accountID, msgID int, parsed *mailParsedResult) error {
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		return fmt.Errorf("X-User-ID required")
	}
	if _, err := h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", userID); err != nil {
		return err
	}
	tx, err := h.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	ref := sql.NullString{String: parsed.Meta.ReferencesHeader, Valid: parsed.Meta.ReferencesHeader != ""}
	rh := parsed.RawHeaders
	if len(rh) > maxRawHeadersBytes {
		rh = rh[:maxRawHeadersBytes]
	}
	_, err = tx.Exec(`
		UPDATE mail_messages SET
			body_plain = $1, body_html = $2,
			internet_msg_id = CASE WHEN $3 <> '' THEN $3 ELSE internet_msg_id END,
			in_reply_to = CASE WHEN $4 <> '' THEN $4 ELSE in_reply_to END,
			references_header = COALESCE($5, references_header),
			thread_key = CASE WHEN $6 <> '' THEN $6 ELSE thread_key END,
			attachment_count = $7,
			raw_headers = COALESCE(NULLIF(BTRIM($8::text), ''), raw_headers)
		WHERE id = $9 AND account_id = $10
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, nullStr(parsed.Plain), nullStr(parsed.HTML), nullStr(parsed.Meta.InternetMsgID), nullStr(parsed.Meta.InReplyTo), ref, nullStr(parsed.Meta.ThreadKey), parsed.Meta.AttachmentCount, nullStr(rh), msgID, accountID)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM mail_message_attachments WHERE message_id = $1`, msgID); err != nil {
		return err
	}
	for _, a := range parsed.Attachments {
		if _, err := tx.Exec(`
			INSERT INTO mail_message_attachments (message_id, part_ordinal, filename, content_type, size_bytes, content)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, msgID, a.Ordinal, a.Filename, a.ContentType, a.SizeBytes, nullBytes(a.Content)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func nullBytes(b []byte) interface{} {
	if len(b) == 0 {
		return nil
	}
	return b
}

func (h *Handler) loadMessageAttachmentInfo(msgID int) []MailAttachmentInfo {
	rows, err := h.db.Query(`
		SELECT id, filename, content_type, size_bytes, (content IS NOT NULL)
		FROM mail_message_attachments WHERE message_id = $1 ORDER BY part_ordinal
	`, msgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var list []MailAttachmentInfo
	for rows.Next() {
		var a MailAttachmentInfo
		if err := rows.Scan(&a.ID, &a.Filename, &a.ContentType, &a.SizeBytes, &a.StoredInline); err != nil {
			return list
		}
		list = append(list, a)
	}
	return list
}

// fetchRawRFC822FromIMAP télécharge le message complet (BODY.PEEK[]) depuis IMAP.
func (h *Handler) fetchRawRFC822FromIMAP(c *gin.Context, accountID int, messageUID int64, folder string) (raw []byte, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("IMAP (RFC822): %v", r)
		}
	}()
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		return nil, fmt.Errorf("X-User-ID required")
	}
	if _, err := h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", userID); err != nil {
		return nil, err
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
		return nil, err
	}
	password := ""
	useOAuth := oauthRefreshEnc.Valid && oauthRefreshEnc.String != ""
	if !useOAuth {
		if enc.Valid && enc.String != "" {
			password, _ = decryptPassword(enc.String)
		}
		if password == "" {
			return nil, fmt.Errorf("mot de passe non disponible pour récupérer le corps du message")
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
		return nil, err
	}
	defer imapClient.Logout()
	if useOAuth {
		refreshTok, _ := decryptPassword(oauthRefreshEnc.String)
		if refreshTok == "" {
			return nil, fmt.Errorf("OAuth refresh token non disponible")
		}
		accessToken, tokErr := getGoogleAccessToken(refreshTok)
		if tokErr != nil {
			return nil, tokErr
		}
		ir := xoauth2InitialResponse(email, accessToken)
		if err := imapClient.Authenticate(&xoauth2SASL{ir: ir}); err != nil {
			return nil, err
		}
	} else {
		if err := imapClient.Login(email, password); err != nil {
			return nil, err
		}
	}
	candidates := h.imapCandidatesForAccountFolder(accountID, folder)
	if len(candidates) == 0 {
		return nil, fmt.Errorf("dossier IMAP introuvable pour %q", folder)
	}
	var lastErr error
	for _, mailbox := range candidates {
		if _, selErr := imapClient.Select(mailbox, false); selErr != nil {
			lastErr = selErr
			continue
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
			lastErr = fetchErr
			continue
		}
		if msg == nil {
			continue
		}
		for _, lit := range msg.Body {
			if lit == nil {
				continue
			}
			b, readErr := io.ReadAll(lit)
			if readErr != nil {
				lastErr = readErr
				continue
			}
			if len(b) > 0 {
				return b, nil
			}
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("message UID %d introuvable (BODY[]) pour le dossier %q sur les boîtes IMAP essayées", messageUID, folder)
}

func (h *Handler) downloadMailAttachmentHTTP(c *gin.Context) {
	accStr, msgStr, attStr := c.Param("id"), c.Param("msgId"), c.Param("attId")
	accountID, _ := strconv.Atoi(accStr)
	msgID, _ := strconv.Atoi(msgStr)
	attID, _ := strconv.Atoi(attStr)
	if accountID <= 0 || msgID <= 0 || attID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	userID := c.GetHeader("X-User-ID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID required"})
		return
	}
	if _, err := h.db.Exec("SELECT set_config('app.current_user_id', $1, false)", userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var partOrd int
	var fn, ct string
	var content []byte
	var messageUID int64
	var folder string
	err := h.db.QueryRow(`
		SELECT a.part_ordinal, a.filename, a.content_type, a.content, m.message_uid, m.folder
		FROM mail_message_attachments a
		INNER JOIN mail_messages m ON m.id = a.message_id
		WHERE a.id = $1 AND m.id = $2 AND m.account_id = $3
		AND m.account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, attID, msgID, accountID).Scan(&partOrd, &fn, &ct, &content, &messageUID, &folder)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "pièce jointe introuvable"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(content) == 0 {
		raw, ferr := h.fetchRawRFC822FromIMAP(c, accountID, messageUID, folder)
		if ferr != nil || len(raw) == 0 {
			c.JSON(http.StatusBadGateway, gin.H{"error": "impossible de récupérer la pièce jointe depuis le serveur mail"})
			return
		}
		var xerr error
		fn2, ct2, data, xerr := extractAttachmentOrdinal(raw, partOrd)
		if xerr != nil || len(data) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "contenu de pièce jointe introuvable"})
			return
		}
		if fn2 != "" {
			fn = fn2
		}
		if ct2 != "" {
			ct = ct2
		}
		content = data
	}
	if ct == "" {
		ct = "application/octet-stream"
	}
	c.Header("Content-Type", ct)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, fn))
	c.Data(http.StatusOK, ct, content)
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must contain \"folder\" (dossier standard ou chemin IMAP connu)"})
		return
	}
	raw := strings.TrimSpace(*body.Folder)
	if raw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "folder vide"})
		return
	}
	folder := raw
	if isStandardMailFolder(raw) {
		folder = strings.ToLower(raw)
	}
	if !h.folderAllowed(accountID, folder) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dossier inconnu ou non autorisé pour cette boîte"})
		return
	}
	if err := h.imapMoveMessage(accountID, msgID, folder); err != nil {
		if errors.Is(err, errMailMessageNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		log.Printf("[mail] move IMAP account=%d msg=%d -> %q: %v", accountID, msgID, folder, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
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
		Password         string   `json:"password"`
		ImapHost         string   `json:"imap_host"`
		ImapPort         int      `json:"imap_port"`
		ExtraImapFolders []string `json:"extra_imap_folders"`
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
		{imapMailboxCandidatesForDbFolder("inbox"), "inbox"},
		{imapMailboxCandidatesForDbFolder("sent"), "sent"},
		{imapMailboxCandidatesForDbFolder("drafts"), "drafts"},
		{imapMailboxCandidatesForDbFolder("archive"), "archive"},
		{imapMailboxCandidatesForDbFolder("spam"), "spam"},
		{imapMailboxCandidatesForDbFolder("trash"), "trash"},
	}
	// LIST d’abord : SPECIAL-USE + heuristique → mail_imap_folders.imap_special_use (chemins OVH FR, Exchange, etc.)
	h.refreshImapFolderList(accountID, imapClient)
	var totalSynced int
	for _, ft := range foldersToSync {
		candidates := h.mergeImapFolderCandidates(accountID, ft.dbFolder, ft.imapNames)
		for _, imapName := range candidates {
			n, ok := h.syncImapMailboxMessages(accountID, imapClient, imapName, ft.dbFolder)
			if ok {
				totalSynced += n
				break
			}
		}
	}
	totalSynced += h.syncListedImapFoldersExtra(accountID, imapClient)
	for _, p := range body.ExtraImapFolders {
		path := strings.TrimSpace(p)
		if path == "" {
			continue
		}
		n, _ := h.syncImapMailboxMessages(accountID, imapClient, path, path)
		totalSynced += n
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
		// Adresse d’affichage « De » : compte principal ou alias enregistré pour ce compte.
		FromEmail string `json:"from_email"`
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
	displayFrom := strings.TrimSpace(body.FromEmail)
	if displayFrom == "" {
		displayFrom = email
	} else {
		dfLower := strings.ToLower(displayFrom)
		if dfLower != strings.ToLower(strings.TrimSpace(email)) {
			var canon string
			aerr := h.db.QueryRow(`
				SELECT a.alias_email FROM user_email_aliases a
				INNER JOIN user_email_accounts u ON u.id = a.account_id
				WHERE a.account_id = $1 AND LOWER(a.alias_email) = $2
				AND u.user_id = current_setting('app.current_user_id', true)::INTEGER
			`, body.AccountID, dfLower).Scan(&canon)
			if aerr == sql.ErrNoRows || strings.TrimSpace(canon) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "from_email doit être l’adresse du compte ou un alias enregistré pour cette boîte"})
				return
			}
			if aerr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": aerr.Error()})
				return
			}
			displayFrom = strings.TrimSpace(canon)
		} else {
			displayFrom = email
		}
	}
	subject := body.Subject
	if subject == "" {
		subject = "(sans objet)"
	}
	msg := []byte("From: " + displayFrom + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" + body.Body)
	// Enveloppe SMTP : compte authentifié (évite les rejets si l’alias n’est pas autorisé comme MAIL FROM).
	if err := smtp.SendMail(addr, auth, email, []string{to}, msg); err != nil {
		log.Printf("[mail] SMTP send: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "envoi SMTP échoué: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "message envoyé"})
}
