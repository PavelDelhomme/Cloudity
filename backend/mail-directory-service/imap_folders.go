package main

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/gin-gonic/gin"
)

func isStandardMailFolder(f string) bool {
	switch strings.TrimSpace(strings.ToLower(f)) {
	case "inbox", "sent", "drafts", "spam", "trash", "archive":
		return true
	default:
		return false
	}
}

func normalizeMailFolderQuery(folder string) string {
	folder = strings.TrimSpace(folder)
	if folder == "" {
		return "inbox"
	}
	if isStandardMailFolder(strings.ToLower(folder)) {
		return strings.ToLower(folder)
	}
	return folder
}

// imapMailboxCandidatesForDbFolder retourne les noms de boîte IMAP à essayer pour lire un message
// (même ordre que syncAccountIMAP). Pour un dossier personnalisé, le chemin stocké en base est utilisé tel quel.
func imapMailboxCandidatesForDbFolder(dbFolder string) []string {
	sl := strings.TrimSpace(strings.ToLower(dbFolder))
	switch sl {
	case "inbox":
		return []string{"INBOX"}
	case "sent":
		return []string{"Sent", "[Gmail]/Sent Mail", "INBOX.Sent"}
	case "drafts":
		return []string{"Drafts", "[Gmail]/Drafts", "INBOX.Drafts"}
	case "spam":
		return []string{"Spam", "Junk", "[Gmail]/Spam", "INBOX.Spam"}
	case "trash":
		return []string{"Trash", "[Gmail]/Trash", "Deleted Messages", "Bin", "INBOX.Trash"}
	case "archive":
		return []string{"Archive", "[Gmail]/Archive", "INBOX.Archive", "Archives"}
	default:
		p := strings.TrimSpace(dbFolder)
		if p == "" {
			return nil
		}
		return []string{p}
	}
}

func (h *Handler) folderAllowed(accountID int, folder string) bool {
	folder = strings.TrimSpace(folder)
	if folder == "" {
		return false
	}
	if isStandardMailFolder(folder) {
		return true
	}
	var n int
	_ = h.db.QueryRow(`
		SELECT COUNT(*) FROM mail_imap_folders
		WHERE account_id = $1 AND imap_path = $2
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, accountID, folder).Scan(&n)
	return n > 0
}

// refreshImapFolderList exécute IMAP LIST et met à jour mail_imap_folders.
func (h *Handler) refreshImapFolderList(accountID int, ic *client.Client) {
	ch := make(chan *imap.MailboxInfo, 128)
	go func() {
		if err := ic.List("", "*", ch); err != nil {
			log.Printf("[mail] IMAP LIST: %v", err)
		}
	}()
	for info := range ch {
		if info == nil {
			continue
		}
		path := strings.TrimSpace(info.Name)
		if path == "" {
			continue
		}
		delim := info.Delimiter
		if delim == "" {
			delim = "/"
		}
		parent := ""
		if idx := strings.LastIndex(path, delim); idx > 0 {
			parent = path[:idx]
		}
		label := path
		if idx := strings.LastIndex(path, delim); idx >= 0 && idx < len(path)-1 {
			label = path[idx+len(delim):]
		}
		_, err := h.db.Exec(`
			INSERT INTO mail_imap_folders (account_id, imap_path, parent_imap_path, label, delimiter)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (account_id, imap_path) DO UPDATE SET
				parent_imap_path = EXCLUDED.parent_imap_path,
				label = EXCLUDED.label,
				delimiter = EXCLUDED.delimiter,
				updated_at = CURRENT_TIMESTAMP
		`, accountID, path, parent, label, delim)
		if err != nil {
			log.Printf("[mail] upsert mail_imap_folders %s: %v", path, err)
		}
	}
}

// syncImapMailboxMessages synchronise les en-têtes d’une boîte IMAP vers mail_messages (dbFolder = clé stockée en base).
func (h *Handler) syncImapMailboxMessages(accountID int, ic *client.Client, imapMailbox string, dbFolder string) (int, bool) {
	mbox, err := ic.Select(imapMailbox, false)
	if err != nil {
		log.Printf("[mail] sync select %q: %v", imapMailbox, err)
		return 0, false
	}
	if mbox == nil || mbox.Messages == 0 {
		return 0, true
	}
	n := 0
	seqset := new(imap.SeqSet)
	from := uint32(1)
	to := mbox.Messages
	if mbox.Messages > 300 {
		from = mbox.Messages - 299
	}
	seqset.AddRange(from, to)
	messages := make(chan *imap.Message, 24)
	go func() {
		if err := ic.Fetch(seqset, []imap.FetchItem{imap.FetchEnvelope, imap.FetchUid}, messages); err != nil {
			log.Printf("[mail] Fetch %s: %v", dbFolder, err)
		}
	}()
	for msg := range messages {
		if msg.Envelope == nil {
			continue
		}
		fromAddr := ""
		if len(msg.Envelope.From) > 0 {
			fromAddr = formatImapAddress(msg.Envelope.From[0])
		}
		toAddrs := formatImapAddressList(msg.Envelope.To)
		subject := msg.Envelope.Subject
		dateAt := msg.Envelope.Date
		if dateAt.IsZero() {
			dateAt = time.Now()
		}
		mid := normalizeMessageID(msg.Envelope.MessageId)
		irt := normalizeMessageID(msg.Envelope.InReplyTo)
		tk := mid
		var xmax int64
		upsertErr := h.db.QueryRow(`
			INSERT INTO mail_messages (account_id, folder, message_uid, from_addr, to_addrs, subject, date_at, internet_msg_id, in_reply_to, thread_key)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (account_id, folder, message_uid) DO UPDATE SET
				from_addr = EXCLUDED.from_addr,
				to_addrs = EXCLUDED.to_addrs,
				subject = EXCLUDED.subject,
				date_at = EXCLUDED.date_at,
				internet_msg_id = CASE WHEN EXCLUDED.internet_msg_id <> '' THEN EXCLUDED.internet_msg_id ELSE mail_messages.internet_msg_id END,
				in_reply_to = CASE WHEN EXCLUDED.in_reply_to <> '' THEN EXCLUDED.in_reply_to ELSE mail_messages.in_reply_to END,
				thread_key = CASE
					WHEN mail_messages.thread_key <> '' THEN mail_messages.thread_key
					WHEN EXCLUDED.thread_key <> '' THEN EXCLUDED.thread_key
					ELSE mail_messages.thread_key
				END
			RETURNING xmax
		`, accountID, dbFolder, msg.Uid, fromAddr, toAddrs, subject, dateAt, mid, irt, tk).Scan(&xmax)
		if upsertErr != nil {
			log.Printf("[mail] upsert message: %v", upsertErr)
			continue
		}
		if xmax == 0 {
			n++
		}
	}
	return n, true
}

func (h *Handler) listImapFoldersHTTP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var dummy int
	if err := h.db.QueryRow(`
		SELECT 1 FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&dummy); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "compte introuvable"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rows, err := h.db.Query(`
		SELECT imap_path, parent_imap_path, label, delimiter
		FROM mail_imap_folders
		WHERE account_id = $1
		ORDER BY imap_path
	`, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type row struct {
		ImapPath       string `json:"imap_path"`
		ParentImapPath string `json:"parent_imap_path"`
		Label          string `json:"label"`
		Delimiter      string `json:"delimiter"`
	}
	var list []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ImapPath, &r.ParentImapPath, &r.Label, &r.Delimiter); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, r)
	}
	if list == nil {
		list = []row{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) listMailTagsHTTP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	rows, err := h.db.Query(`
		SELECT t.id, t.account_id, t.name, t.color, t.created_at::text
		FROM mail_tags t
		INNER JOIN user_email_accounts u ON u.id = t.account_id
		WHERE t.account_id = $1 AND u.user_id = current_setting('app.current_user_id', true)::INTEGER
		ORDER BY LOWER(t.name)
	`, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var id, acc int
		var name, color, created string
		if err := rows.Scan(&id, &acc, &name, &color, &created); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		list = append(list, gin.H{"id": id, "account_id": acc, "name": name, "color": color, "created_at": created})
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) createMailTagHTTP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		Name  string `json:"name" binding:"required"`
		Color string `json:"color"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name requis"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name vide"})
		return
	}
	color := strings.TrimSpace(body.Color)
	if color == "" {
		color = "slate"
	}
	var newID int
	err = h.db.QueryRow(`
		INSERT INTO mail_tags (account_id, name, color)
		VALUES ($1, $2, $3)
		RETURNING id
	`, accountID, name, color).Scan(&newID)
	if err != nil {
		var existing int
		if err2 := h.db.QueryRow(`
			SELECT id FROM mail_tags WHERE account_id = $1 AND LOWER(name) = LOWER($2)
		`, accountID, name).Scan(&existing); err2 == nil {
			c.JSON(http.StatusOK, gin.H{"id": existing, "name": name, "existed": true})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": newID, "name": name})
}

func (h *Handler) putMessageTagsHTTP(c *gin.Context) {
	accStr, msgStr := c.Param("id"), c.Param("msgId")
	accountID, _ := strconv.Atoi(accStr)
	msgID, _ := strconv.Atoi(msgStr)
	if accountID <= 0 || msgID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		TagIDs []int `json:"tag_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	var owner int
	if err := h.db.QueryRow(`
		SELECT m.id FROM mail_messages m
		WHERE m.id = $1 AND m.account_id = $2
		AND m.account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, msgID, accountID).Scan(&owner); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "message introuvable"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM mail_message_tags WHERE message_id = $1`, msgID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for _, tid := range body.TagIDs {
		if tid <= 0 {
			continue
		}
		_, err := tx.Exec(`
			INSERT INTO mail_message_tags (message_id, tag_id)
			SELECT $1, t.id FROM mail_tags t
			WHERE t.id = $2 AND t.account_id = $3
		`, msgID, tid, accountID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
