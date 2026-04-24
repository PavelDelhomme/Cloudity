package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

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
	lf := strings.ToLower(folder)
	if lf == "all" {
		return "all"
	}
	if isStandardMailFolder(lf) {
		return lf
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
		return []string{
			"Sent", "[Gmail]/Sent Mail", "INBOX.Sent", "Sent Items", "INBOX.Sent Items",
			"Envoyés", "INBOX.Envoyés", "Éléments envoyés", "INBOX.Éléments envoyés",
		}
	case "drafts":
		return []string{"Drafts", "[Gmail]/Drafts", "INBOX.Drafts", "Brouillons", "INBOX.Brouillons"}
	case "spam":
		return []string{
			"Spam", "Junk", "[Gmail]/Spam", "INBOX.Spam", "Junk E-mail", "INBOX.Junk E-mail",
			"Courrier indésirable", "INBOX.Courrier indésirable", "Bulk Mail", "INBOX.Bulk Mail",
		}
	case "trash":
		return []string{
			"Trash", "[Gmail]/Trash", "[Gmail]/Bin", "Deleted Messages", "Deleted Items",
			"INBOX.Trash", "INBOX.Deleted Items", "Bin", "Corbeille", "INBOX.Corbeille",
			"Papierkorb", "INBOX.Papierkorb",
		}
	case "archive":
		// Essayer les noms « génériques » d’abord ; chemins [Gmail]/… en dernier (délimiteur « . » OVH → erreur « / » invalide).
		return []string{"Archive", "INBOX.Archive", "Archives", "[Gmail]/Archive"}
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
	if strings.EqualFold(folder, "all") {
		var dummy int
		err := h.db.QueryRow(`
			SELECT 1 FROM user_email_accounts
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		`, accountID).Scan(&dummy)
		return err == nil
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

func specialUseFromIMAPAttributes(attrs []string) string {
	for _, raw := range attrs {
		switch strings.TrimSpace(raw) {
		case imap.TrashAttr:
			return "trash"
		case imap.SentAttr:
			return "sent"
		case imap.DraftsAttr:
			return "drafts"
		case imap.JunkAttr:
			return "spam"
		case imap.ArchiveAttr:
			return "archive"
		}
	}
	return ""
}

// inferSpecialUseFromPathAndLabel complète SPECIAL-USE (OVH FR, Exchange, etc.) sans écraser l’INBOX.
func inferSpecialUseFromPathAndLabel(path, label string) string {
	pl := strings.ToLower(strings.TrimSpace(path))
	ll := strings.ToLower(strings.TrimSpace(label))
	if pl == "inbox" && (ll == "inbox" || ll == "") {
		return ""
	}
	trashHints := []string{"trash", "corbeille", "deleted items", "deleted messages", "papierkorb", "gelöscht", "[gmail]/trash", "[gmail]/bin"}
	if containsAnySubstring(pl, trashHints) || containsAnySubstring(ll, trashHints) {
		return "trash"
	}
	if strings.Contains(pl, "outbox") && !strings.Contains(pl, "sent") {
		// Boîte d’envoi / Outbox ≠ Envoyés
	} else if strings.HasSuffix(pl, ".sent") || strings.HasSuffix(pl, "/sent") || ll == "sent" ||
		strings.Contains(ll, "éléments envoy") || strings.Contains(ll, "elements envoy") ||
		strings.Contains(pl, "sent items") || strings.Contains(ll, "sent items") ||
		strings.Contains(pl, "sent mail") || strings.Contains(pl, "[gmail]/sent") ||
		strings.Contains(pl, "envoyé") || strings.Contains(ll, "envoyé") {
		// OVH / FR : dossier « INBOX.Envoyés » (accents) après strings.ToLower
		return "sent"
	}
	draftHints := []string{"draft", "brouillon", "[gmail]/draft"}
	if containsAnySubstring(pl, draftHints) || containsAnySubstring(ll, draftHints) {
		return "drafts"
	}
	spamHints := []string{"spam", "junk", "indésirable", "bulk mail", "courrier indésirable", "pourriel", "[gmail]/spam"}
	if containsAnySubstring(pl, spamHints) || containsAnySubstring(ll, spamHints) {
		return "spam"
	}
	archHints := []string{"[gmail]/archive", "inbox.archive", ".archive"}
	if containsAnySubstring(pl, archHints) || ll == "archive" || ll == "archives" {
		return "archive"
	}
	return ""
}

func containsAnySubstring(s string, keys []string) bool {
	for _, k := range keys {
		if k != "" && strings.Contains(s, k) {
			return true
		}
	}
	return false
}

func mergeUniqueImapPaths(first, second []string) []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(list []string) {
		for _, raw := range list {
			s := strings.TrimSpace(raw)
			if s == "" {
				continue
			}
			k := strings.ToLower(s)
			if _, ok := seen[k]; ok {
				continue
			}
			seen[k] = struct{}{}
			out = append(out, s)
		}
	}
	add(first)
	add(second)
	return out
}

// mergeImapFolderCandidates : chemins découverts (SPECIAL-USE / heuristique) en tête, puis liste statique.
func (h *Handler) mergeImapFolderCandidates(accountID int, dbFolder string, static []string) []string {
	role := strings.TrimSpace(strings.ToLower(dbFolder))
	if role == "inbox" {
		return static
	}
	if !isStandardMailFolder(role) {
		if len(static) > 0 {
			return static
		}
		p := strings.TrimSpace(dbFolder)
		if p == "" {
			return nil
		}
		return []string{p}
	}
	rows, err := h.db.Query(`
		SELECT imap_path FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(TRIM(imap_special_use)) = $2
		ORDER BY LENGTH(imap_path), imap_path
	`, accountID, role)
	if err != nil {
		log.Printf("[mail] mergeImapFolderCandidates query: %v", err)
		return static
	}
	defer rows.Close()
	var fromDB []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			continue
		}
		p = strings.TrimSpace(p)
		if p != "" {
			fromDB = append(fromDB, p)
		}
	}
	return mergeUniqueImapPaths(fromDB, static)
}

func (h *Handler) imapCandidatesForAccountFolder(accountID int, dbFolder string) []string {
	static := imapMailboxCandidatesForDbFolder(dbFolder)
	return h.mergeImapFolderCandidates(accountID, dbFolder, static)
}

// refreshImapFolderList exécute IMAP LIST et met à jour mail_imap_folders (+ rôle SPECIAL-USE / heuristique).
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
		special := specialUseFromIMAPAttributes(info.Attributes)
		if special == "" {
			special = inferSpecialUseFromPathAndLabel(path, label)
		}
		// NOT NULL sur imap_special_use : une chaîne vide « pas de rôle » doit rester '' (NULLIF('', '') = NULL en SQL).
		_, err := h.db.Exec(`
			INSERT INTO mail_imap_folders (account_id, imap_path, parent_imap_path, label, delimiter, imap_special_use)
			VALUES ($1, $2, $3, $4, $5, COALESCE(NULLIF($6, ''), ''))
			ON CONFLICT (account_id, imap_path) DO UPDATE SET
				parent_imap_path = EXCLUDED.parent_imap_path,
				label = EXCLUDED.label,
				delimiter = EXCLUDED.delimiter,
				imap_special_use = COALESCE(NULLIF(EXCLUDED.imap_special_use, ''), mail_imap_folders.imap_special_use),
				updated_at = CURRENT_TIMESTAMP
			-- Ne pas écraser user_created / ui_color / ui_icon (création Cloudity ou prefs utilisateur)
		`, accountID, path, parent, label, delim, special)
		if err != nil {
			log.Printf("[mail] upsert mail_imap_folders %s: %v", path, err)
		}
	}
}

// isBenignImapSelectErr indique une tentative de SELECT sur un nom de boîte absent ou incompatible (probe multi-fournisseur).
func isBenignImapSelectErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) {
		return true
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "doesn't exist") ||
		strings.Contains(s, "does not exist") ||
		strings.Contains(s, "mailbox doesn't exist") ||
		strings.Contains(s, "trycreate") ||
		strings.Contains(s, "invalid mailbox name") ||
		strings.Contains(s, "nonexistent mailbox")
}

// syncImapMailboxMessages synchronise les en-têtes d’une boîte IMAP vers mail_messages (dbFolder = clé stockée en base).
func (h *Handler) syncImapMailboxMessages(accountID int, ic *client.Client, imapMailbox string, dbFolder string) (int, bool) {
	mbox, err := ic.Select(imapMailbox, false)
	if err != nil {
		if !isBenignImapSelectErr(err) {
			log.Printf("[mail] sync select %q: %v", imapMailbox, err)
		}
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
		// Ne pas utiliser time.Now() : une enveloppe sans date (souvent dossiers Trash / copies)
		// faisait apparaître « reçu à l'instant » côté web (liste utilise date_at puis created_at).
		var dateAt interface{}
		if !msg.Envelope.Date.IsZero() {
			dateAt = msg.Envelope.Date
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
				date_at = COALESCE(EXCLUDED.date_at, mail_messages.date_at),
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

// standardImapPathsAlreadySyncedAsStandard recense les chemins de boîte déjà couverts par syncAccountIMAP (clés standard inbox, sent, …).
func standardImapPathsAlreadySyncedAsStandard() map[string]struct{} {
	m := make(map[string]struct{})
	for _, role := range []string{"inbox", "sent", "drafts", "archive", "spam", "trash"} {
		for _, p := range imapMailboxCandidatesForDbFolder(role) {
			m[strings.ToLower(strings.TrimSpace(p))] = struct{}{}
		}
	}
	return m
}

// syncListedImapFoldersExtra synchronise les en-têtes pour chaque dossier listé en mail_imap_folders hors boîtes standard.
func (h *Handler) syncListedImapFoldersExtra(accountID int, ic *client.Client) int {
	skip := standardImapPathsAlreadySyncedAsStandard()
	rows, err := h.db.Query(`
		SELECT imap_path FROM mail_imap_folders
		WHERE account_id = $1 AND COALESCE(imap_special_use, '') = ''
	`, accountID)
	if err != nil {
		log.Printf("[mail] imap folders list for extra sync: %v", err)
		return 0
	}
	defer rows.Close()
	total := 0
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			continue
		}
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if _, ok := skip[strings.ToLower(path)]; ok {
			continue
		}
		n, _ := h.syncImapMailboxMessages(accountID, ic, path, path)
		total += n
	}
	return total
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
		SELECT imap_path, parent_imap_path, label, delimiter, COALESCE(imap_special_use, ''),
		       COALESCE(user_created, false), COALESCE(ui_color, ''), COALESCE(ui_icon, '')
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
		ImapSpecialUse string `json:"imap_special_use,omitempty"`
		UserCreated    bool   `json:"user_created"`
		UiColor        string `json:"ui_color,omitempty"`
		UiIcon         string `json:"ui_icon,omitempty"`
	}
	var list []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ImapPath, &r.ParentImapPath, &r.Label, &r.Delimiter, &r.ImapSpecialUse, &r.UserCreated, &r.UiColor, &r.UiIcon); err != nil {
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
