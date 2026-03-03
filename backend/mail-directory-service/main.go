package main

import (
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
	r.Use(h.requireTenantAndUser)

	mail := r.Group("/mail")
	{
		mail.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
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
	var enc sql.NullString
	err = h.db.QueryRow(`
		SELECT email, password_encrypted FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&email, &enc)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
	if err := imapClient.Login(email, password); err != nil {
		log.Printf("[mail] IMAP login %s: %v", email, err)
		msg := "identifiants invalides ou accès refusé"
		if strings.Contains(strings.ToLower(email), "@gmail.") || strings.Contains(strings.ToLower(email), "@googlemail.") {
			msg = "Identifiants refusés. Gmail avec 2FA : utilisez un mot de passe d'application (Paramètres Google > Sécurité > Mots de passe des applications)."
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": msg})
		return
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
		Password  string `json:"password" binding:"required"`
		To        string `json:"to" binding:"required"`
		Subject   string `json:"subject"`
		Body      string `json:"body"`
		SmtpHost  string `json:"smtp_host"`
		SmtpPort  int    `json:"smtp_port"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "account_id, password et to requis"})
		return
	}
	to := strings.TrimSpace(strings.ToLower(body.To))
	if to == "" || !strings.Contains(to, "@") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "destinataire invalide"})
		return
	}
	var email string
	err := h.db.QueryRow(`
		SELECT email FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, body.AccountID).Scan(&email)
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
	auth := smtp.PlainAuth("", email, body.Password, host)
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
