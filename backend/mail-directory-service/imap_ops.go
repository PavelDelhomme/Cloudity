package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/gin-gonic/gin"
)

// errMailMessageNotFound : aucune ligne mail_messages pour ce compte / id.
var errMailMessageNotFound = errors.New("message introuvable")

// imapDialAndLogin ouvre une session IMAP authentifiée (l’appelant doit Logout()).
func (h *Handler) imapDialAndLogin(accountID int, passwordOverride string) (email string, ic *client.Client, err error) {
	var enc, oauthRefreshEnc sql.NullString
	var dbImapHost sql.NullString
	var dbImapPort sql.NullInt32
	qerr := h.db.QueryRow(`
		SELECT email, password_encrypted, oauth_refresh_token_encrypted, imap_host, imap_port
		FROM user_email_accounts
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, accountID).Scan(&email, &enc, &oauthRefreshEnc, &dbImapHost, &dbImapPort)
	if qerr == sql.ErrNoRows {
		return "", nil, fmt.Errorf("compte introuvable")
	}
	if qerr != nil {
		return "", nil, qerr
	}
	useOAuth := oauthRefreshEnc.Valid && oauthRefreshEnc.String != ""
	password := strings.TrimSpace(passwordOverride)
	if !useOAuth {
		if password == "" && enc.Valid && enc.String != "" {
			password, err = decryptPassword(enc.String)
			if err != nil {
				log.Printf("[mail] decrypt password for IMAP op: %v", err)
			}
		}
		if password == "" {
			return "", nil, fmt.Errorf("mot de passe IMAP non disponible pour cette opération (OAuth ou mot de passe enregistré requis)")
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
	if port == 993 || port == 0 {
		ic, err = client.DialTLS(addr, nil)
	} else {
		ic, err = client.Dial(addr)
	}
	if err != nil {
		return email, nil, fmt.Errorf("connexion IMAP %s: %w", addr, err)
	}
	if useOAuth {
		refreshTok, decErr := decryptPassword(oauthRefreshEnc.String)
		if decErr != nil || refreshTok == "" {
			_ = ic.Logout()
			return email, nil, fmt.Errorf("jeton OAuth illisible")
		}
		accessToken, tokErr := getGoogleAccessToken(refreshTok)
		if tokErr != nil {
			_ = ic.Logout()
			return email, nil, fmt.Errorf("OAuth Google: %w", tokErr)
		}
		ir := xoauth2InitialResponse(email, accessToken)
		if err := ic.Authenticate(&xoauth2SASL{ir: ir}); err != nil {
			_ = ic.Logout()
			return email, nil, fmt.Errorf("authentification IMAP OAuth: %w", err)
		}
	} else {
		if err := ic.Login(email, password); err != nil {
			_ = ic.Logout()
			return email, nil, fmt.Errorf("login IMAP: %w", err)
		}
	}
	return email, ic, nil
}

func imapMailboxContainsUID(ic *client.Client, mailbox string, uid uint32) (bool, error) {
	if _, err := ic.Select(mailbox, false); err != nil {
		return false, err
	}
	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)
	ch := make(chan *imap.Message, 4)
	done := make(chan error, 1)
	go func() {
		done <- ic.UidFetch(seqset, []imap.FetchItem{imap.FetchUid}, ch)
	}()
	found := false
	for m := range ch {
		if m != nil && m.Uid == uid {
			found = true
		}
	}
	if err := <-done; err != nil {
		return false, err
	}
	return found, nil
}

// imapResolveSourceMailbox trouve le nom de boîte IMAP où se trouve réellement le message (UID).
func (h *Handler) imapResolveSourceMailbox(accountID int, ic *client.Client, dbFolder string, uid uint32) (string, error) {
	candidates := h.imapCandidatesForAccountFolder(accountID, dbFolder)
	var lastErr error
	for _, mb := range candidates {
		ok, err := imapMailboxContainsUID(ic, mb, uid)
		if err != nil {
			if !isBenignImapSelectErr(err) {
				lastErr = err
			}
			continue
		}
		if ok {
			return mb, nil
		}
	}
	if lastErr != nil {
		return "", fmt.Errorf("UID %d dossier %q: %w", uid, dbFolder, lastErr)
	}
	return "", fmt.Errorf("message UID %d introuvable sur le serveur pour le dossier %q", uid, dbFolder)
}

func imapUidMoveToFirstDest(ic *client.Client, srcMailbox string, uid uint32, destCandidates []string) error {
	if _, err := ic.Select(srcMailbox, false); err != nil {
		return err
	}
	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)
	var lastErr error
	for _, dest := range destCandidates {
		if strings.TrimSpace(dest) == "" {
			continue
		}
		if _, err := ic.Select(srcMailbox, false); err != nil {
			return fmt.Errorf("re-select source %q: %w", srcMailbox, err)
		}
		if err := ic.UidMove(seqset, dest); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	if lastErr != nil {
		return fmt.Errorf("aucune boîte destination valide parmi %v: %w", destCandidates, lastErr)
	}
	return fmt.Errorf("aucune destination IMAP")
}

func sanitizeImapChildSegment(label string) string {
	label = strings.TrimSpace(label)
	if label == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range label {
		if r == '/' || r == '\\' || r == '"' || r == 0 {
			continue
		}
		if unicode.IsControl(r) {
			continue
		}
		// Évite les segments vides ou ambigus avec le délimiteur hiérarchique
		if r == '.' {
			continue
		}
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

func imapSpecialRoleBlocksSubfolderCreation(role string) bool {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "drafts", "sent", "spam", "trash":
		return true
	default:
		return false
	}
}

func (h *Handler) imapFolderParentCreationForbidden(accountID int, parentIMAP string) (bool, string) {
	var sp sql.NullString
	qerr := h.db.QueryRow(`
		SELECT COALESCE(imap_special_use, '') FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(TRIM(imap_path)) = LOWER(TRIM($2))
	`, accountID, parentIMAP).Scan(&sp)
	if qerr != nil && qerr != sql.ErrNoRows {
		return false, ""
	}
	if qerr == nil && sp.Valid && imapSpecialRoleBlocksSubfolderCreation(sp.String) {
		return true, "création de dossier interdite sous Envoyés, Brouillons, Spam ou Corbeille"
	}
	return false, ""
}

func parseImapFolderPathInput(pathField, labelField string) []string {
	pathField = strings.TrimSpace(pathField)
	if pathField != "" {
		parts := strings.Split(pathField, "/")
		var out []string
		for _, p := range parts {
			s := sanitizeImapChildSegment(p)
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	}
	s := sanitizeImapChildSegment(labelField)
	if s == "" {
		return nil
	}
	return []string{s}
}

func (h *Handler) resolveParentImapPath(accountID int, parentRaw string) (canonical string, delimiter string, err error) {
	parentRaw = strings.TrimSpace(parentRaw)
	if parentRaw == "" {
		parentRaw = "INBOX"
	}
	var p, d sql.NullString
	qerr := h.db.QueryRow(`
		SELECT imap_path, delimiter FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(TRIM(imap_path)) = LOWER(TRIM($2))
	`, accountID, parentRaw).Scan(&p, &d)
	if qerr != nil && qerr != sql.ErrNoRows {
		return "", "", qerr
	}
	if qerr == nil && p.Valid && strings.TrimSpace(p.String) != "" {
		delim := "."
		if d.Valid && strings.TrimSpace(d.String) != "" {
			delim = d.String
		}
		return strings.TrimSpace(p.String), delim, nil
	}
	if strings.EqualFold(strings.TrimSpace(parentRaw), "inbox") {
		return "INBOX", ".", nil
	}
	return "", "", fmt.Errorf("dossier parent inconnu pour ce compte : synchronisez d’abord la boîte (LIST IMAP)")
}

func (h *Handler) createImapFolderHTTP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		ParentImapPath string `json:"parent_imap_path"`
		Label          string `json:"label"`
		Path           string `json:"path"`
		UiColor        string `json:"ui_color"`
		UiIcon         string `json:"ui_icon"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON invalide (parent_imap_path, label ou path)"})
		return
	}
	segments := parseImapFolderPathInput(body.Path, body.Label)
	if len(segments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nom ou chemin de dossier vide (ex. RH ou Candidatures/RH)"})
		return
	}
	parent, delim, err := h.resolveParentImapPath(accountID, body.ParentImapPath)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if forb, msg := h.imapFolderParentCreationForbidden(accountID, parent); forb {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	_, ic, err := h.imapDialAndLogin(accountID, "")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer func() { _ = ic.Logout() }()
	cur := parent
	var leaf string
	var createdThisRequest []string
	for _, seg := range segments {
		leaf = cur + delim + seg
		var n int
		_ = h.db.QueryRow(`
			SELECT COUNT(*) FROM mail_imap_folders
			WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
		`, accountID, leaf).Scan(&n)
		if n == 0 {
			if err := ic.Create(leaf); err != nil {
				log.Printf("[mail] IMAP CREATE %q account=%d: %v", leaf, accountID, err)
				c.JSON(http.StatusBadRequest, gin.H{"error": "CREATE IMAP: " + err.Error()})
				return
			}
			log.Printf("[mail] IMAP CREATE OK account=%d path=%q", accountID, leaf)
			createdThisRequest = append(createdThisRequest, leaf)
		}
		cur = leaf
	}
	h.refreshImapFolderList(accountID, ic)
	_, _ = h.syncImapMailboxMessages(accountID, ic, leaf, leaf)
	uiColor := strings.TrimSpace(body.UiColor)
	uiIcon := strings.TrimSpace(body.UiIcon)
	leafTrim := strings.TrimSpace(leaf)
	for _, p := range createdThisRequest {
		if strings.EqualFold(strings.TrimSpace(p), leafTrim) {
			continue
		}
		if _, err := h.db.Exec(`
			UPDATE mail_imap_folders SET user_created = true
			WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
		`, accountID, p); err != nil {
			log.Printf("[mail] mark user_created %q: %v", p, err)
		}
	}
	if len(createdThisRequest) > 0 {
		if _, err := h.db.Exec(`
			UPDATE mail_imap_folders SET user_created = true,
				ui_color = CASE WHEN $3 <> '' THEN $3 ELSE ui_color END,
				ui_icon = CASE WHEN $4 <> '' THEN $4 ELSE ui_icon END
			WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
		`, accountID, leaf, uiColor, uiIcon); err != nil {
			log.Printf("[mail] mark user_created leaf %q: %v", leaf, err)
		}
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "imap_path": leaf, "parent_imap_path": parent, "segments": segments})
}

func (h *Handler) renameImapFolderHTTP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		ImapPath string `json:"imap_path"`
		NewLabel string `json:"new_label"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.ImapPath) == "" || strings.TrimSpace(body.NewLabel) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "imap_path et new_label requis"})
		return
	}
	oldPath := strings.TrimSpace(body.ImapPath)
	newSeg := sanitizeImapChildSegment(body.NewLabel)
	if newSeg == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nouveau nom invalide"})
		return
	}
	var userCreated bool
	qerr := h.db.QueryRow(`
		SELECT COALESCE(user_created, false) FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, accountID, oldPath).Scan(&userCreated)
	if qerr == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "dossier introuvable"})
		return
	}
	if qerr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": qerr.Error()})
		return
	}
	if !userCreated {
		c.JSON(http.StatusForbidden, gin.H{"error": "renommage réservé aux dossiers créés dans Cloudity"})
		return
	}
	var dbParent, dbDelim string
	if err := h.db.QueryRow(`
		SELECT COALESCE(parent_imap_path, ''), COALESCE(NULLIF(TRIM(delimiter), ''), '.')
		FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
	`, accountID, oldPath).Scan(&dbParent, &dbDelim); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if dbDelim == "" {
		dbDelim = "."
	}
	newPath := newSeg
	if strings.TrimSpace(dbParent) != "" {
		newPath = dbParent + dbDelim + newSeg
	}
	delim := dbDelim
	if strings.EqualFold(oldPath, newPath) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "imap_path": oldPath})
		return
	}
	var clash int
	_ = h.db.QueryRow(`SELECT COUNT(*) FROM mail_imap_folders WHERE account_id=$1 AND LOWER(imap_path)=LOWER($2)`, accountID, newPath).Scan(&clash)
	if clash > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "un dossier porte déjà ce nom"})
		return
	}
	_, ic, err := h.imapDialAndLogin(accountID, "")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer func() { _ = ic.Logout() }()
	if err := ic.Rename(oldPath, newPath); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "RENAME IMAP: " + err.Error()})
		return
	}
	h.refreshImapFolderList(accountID, ic)
	if _, err := h.db.Exec(`
		UPDATE mail_messages SET folder = $2 || SUBSTRING(folder FROM LENGTH($1) + 1)
		WHERE account_id = $3 AND (folder = $1 OR folder LIKE $1 || $4 || '%')
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, oldPath, newPath, accountID, delim); err != nil {
		log.Printf("[mail] rename folder update messages: %v", err)
	}
	_, _ = h.db.Exec(`UPDATE mail_imap_folders SET user_created=true WHERE account_id=$1 AND LOWER(imap_path)=LOWER($2)`, accountID, newPath)
	c.JSON(http.StatusOK, gin.H{"ok": true, "imap_path": newPath})
}

func (h *Handler) deleteImapFolderHTTP(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := strconv.Atoi(idStr)
	if err != nil || accountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	var body struct {
		ImapPath string `json:"imap_path"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.ImapPath) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "imap_path requis"})
		return
	}
	root := strings.TrimSpace(body.ImapPath)
	var userCreated bool
	if err := h.db.QueryRow(`
		SELECT COALESCE(user_created, false) FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, accountID, root).Scan(&userCreated); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "dossier introuvable"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !userCreated {
		c.JSON(http.StatusForbidden, gin.H{"error": "suppression réservée aux dossiers créés dans Cloudity (dossiers fournisseur IMAP : pas de suppression)"})
		return
	}
	var delim string
	_ = h.db.QueryRow(`
		SELECT COALESCE(NULLIF(TRIM(delimiter), ''), '.') FROM mail_imap_folders
		WHERE account_id = $1 AND LOWER(imap_path) = LOWER($2)
	`, accountID, root).Scan(&delim)
	if delim == "" {
		delim = "."
	}
	rootLower := strings.ToLower(root)
	delimStr := delim
	allRows, err := h.db.Query(`
		SELECT imap_path, COALESCE(user_created, false)
		FROM mail_imap_folders
		WHERE account_id = $1
		ORDER BY LENGTH(imap_path) DESC
	`, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	prefixLower := strings.ToLower(root + delimStr)
	var paths []string
	for allRows.Next() {
		var p string
		var uc bool
		if err := allRows.Scan(&p, &uc); err != nil {
			continue
		}
		p = strings.TrimSpace(p)
		pl := strings.ToLower(p)
		if pl == rootLower {
			paths = append(paths, p)
			continue
		}
		if strings.HasPrefix(pl, prefixLower) && uc {
			paths = append(paths, p)
		}
	}
	_ = allRows.Close()
	if len(paths) == 0 {
		paths = []string{root}
	}
	_, ic, err := h.imapDialAndLogin(accountID, "")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer func() { _ = ic.Logout() }()
	for _, p := range paths {
		msgRows, qerr := h.db.Query(`
			SELECT id FROM mail_messages
			WHERE account_id = $1 AND folder = $2
			AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
		`, accountID, p)
		if qerr != nil {
			continue
		}
		var ids []int
		for msgRows.Next() {
			var mid int
			if err := msgRows.Scan(&mid); err != nil {
				continue
			}
			ids = append(ids, mid)
		}
		_ = msgRows.Close()
		for _, mid := range ids {
			if err := h.imapMoveMessage(accountID, mid, "trash"); err != nil {
				log.Printf("[mail] delete folder move msg %d: %v", mid, err)
			}
		}
		if err := ic.Delete(p); err != nil {
			log.Printf("[mail] IMAP DELETE %q: %v", p, err)
		}
	}
	h.refreshImapFolderList(accountID, ic)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// imapMoveMessage déplace le message sur le serveur IMAP puis met à jour mail_messages.folder.
func (h *Handler) imapMoveMessage(accountID, msgID int, destFolder string) error {
	var curFolder string
	var messageUID int64
	err := h.db.QueryRow(`
		SELECT folder, message_uid FROM mail_messages
		WHERE id = $1 AND account_id = $2
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, msgID, accountID).Scan(&curFolder, &messageUID)
	if err == sql.ErrNoRows {
		return errMailMessageNotFound
	}
	if err != nil {
		return err
	}
	if strings.EqualFold(strings.TrimSpace(curFolder), strings.TrimSpace(destFolder)) {
		return nil
	}
	if messageUID <= 0 {
		return fmt.Errorf("UID message invalide")
	}
	_, ic, err := h.imapDialAndLogin(accountID, "")
	if err != nil {
		return err
	}
	defer func() { _ = ic.Logout() }()
	srcMb, err := h.imapResolveSourceMailbox(accountID, ic, curFolder, uint32(messageUID))
	if err != nil {
		return fmt.Errorf("source IMAP: %w", err)
	}
	destCands := h.imapCandidatesForAccountFolder(accountID, destFolder)
	if len(destCands) == 0 {
		return fmt.Errorf("aucune boîte destination pour %q", destFolder)
	}
	if err := imapUidMoveToFirstDest(ic, srcMb, uint32(messageUID), destCands); err != nil {
		return fmt.Errorf("déplacement IMAP: %w", err)
	}
	res, err := h.db.Exec(`
		UPDATE mail_messages SET folder = $1
		WHERE id = $2 AND account_id = $3
		AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, destFolder, msgID, accountID)
	if err != nil {
		return fmt.Errorf("mise à jour base après IMAP: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("message introuvable en base après IMAP")
	}
	return nil
}
