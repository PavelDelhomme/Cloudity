package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/gin-gonic/gin"
)

type MailFilterRule struct {
	ID                int    `json:"id"`
	AccountID         int    `json:"account_id"`
	Name              string `json:"name"`
	FromPattern       string `json:"from_pattern"`
	FromDomainPattern string `json:"from_domain_pattern,omitempty"`
	RecipientPattern  string `json:"recipient_pattern,omitempty"`
	HasTagID          *int   `json:"has_tag_id,omitempty"`
	AddTagID          *int   `json:"add_tag_id,omitempty"`
	SubjectPattern    string `json:"subject_pattern"`
	HasAttachments    *bool  `json:"has_attachments,omitempty"`
	ActionFolder      string `json:"action_folder"`
	MarkRead          *bool  `json:"mark_read,omitempty"`
	Enabled           bool   `json:"enabled"`
	RuleOrder         int    `json:"rule_order"`
	CriteriaJSON      string `json:"criteria_json,omitempty"`
	ActionsJSON       string `json:"actions_json,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

func (h *Handler) listMailFilterRules(c *gin.Context) {
	accountID, ok := parsePositiveParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	ctx := c.Request.Context()
	rows, err := h.dbex(ctx).Query(`
		SELECT id, account_id, name, from_pattern, from_domain_pattern, recipient_pattern, has_tag_id, add_tag_id, subject_pattern, has_attachments, action_folder, mark_read, enabled, rule_order, criteria_json::text, actions_json::text, created_at::text, updated_at::text
		FROM mail_filter_rules
		WHERE account_id = $1
		  AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
		ORDER BY rule_order ASC, id DESC
	`, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	var out []MailFilterRule
	for rows.Next() {
		var r MailFilterRule
		var hasAtt sql.NullBool
		var markRead sql.NullBool
		var hasTag sql.NullInt64
		var addTag sql.NullInt64
		if err := rows.Scan(&r.ID, &r.AccountID, &r.Name, &r.FromPattern, &r.FromDomainPattern, &r.RecipientPattern, &hasTag, &addTag, &r.SubjectPattern, &hasAtt, &r.ActionFolder, &markRead, &r.Enabled, &r.RuleOrder, &r.CriteriaJSON, &r.ActionsJSON, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		if hasAtt.Valid {
			v := hasAtt.Bool
			r.HasAttachments = &v
		}
		if markRead.Valid {
			v := markRead.Bool
			r.MarkRead = &v
		}
		if hasTag.Valid {
			v := int(hasTag.Int64)
			r.HasTagID = &v
		}
		if addTag.Valid {
			v := int(addTag.Int64)
			r.AddTagID = &v
		}
		out = append(out, r)
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) createMailFilterRule(c *gin.Context) {
	accountID, ok := parsePositiveParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	ctx := c.Request.Context()
	var body struct {
		Name              string `json:"name"`
		FromPattern       string `json:"from_pattern"`
		FromDomainPattern string `json:"from_domain_pattern"`
		RecipientPattern  string `json:"recipient_pattern"`
		HasTagID          *int   `json:"has_tag_id"`
		AddTagID          *int   `json:"add_tag_id"`
		SubjectPattern    string `json:"subject_pattern"`
		HasAttachments    *bool  `json:"has_attachments"`
		ActionFolder      string `json:"action_folder"`
		MarkRead          *bool  `json:"mark_read"`
		Enabled           *bool  `json:"enabled"`
		RuleOrder         *int   `json:"rule_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body JSON invalide"})
		return
	}
	actionFolder := strings.TrimSpace(body.ActionFolder)
	if actionFolder == "" {
		actionFolder = "inbox"
	}
	if isStandardMailFolder(actionFolder) {
		actionFolder = strings.ToLower(actionFolder)
	}
	if !h.folderAllowed(ctx, accountID, actionFolder) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dossier d'action invalide"})
		return
	}
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Règle automatique"
	}
	fromPat := strings.TrimSpace(body.FromPattern)
	subPat := strings.TrimSpace(body.SubjectPattern)
	domPat := normalizeFromDomainPattern(body.FromDomainPattern)
	rcpPat := strings.TrimSpace(strings.ToLower(body.RecipientPattern))
	if fromPat == "" && subPat == "" && domPat == "" && rcpPat == "" && body.HasAttachments == nil && body.HasTagID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "au moins une condition : expéditeur, domaine, destinataire, sujet, étiquette ou pièces jointes"})
		return
	}
	if body.HasTagID != nil && *body.HasTagID > 0 {
		var okTag int
		if err := h.dbex(ctx).QueryRow(`SELECT id FROM mail_tags WHERE id=$1 AND account_id=$2`, *body.HasTagID, accountID).Scan(&okTag); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "étiquette critère invalide"})
			return
		}
	}
	if body.AddTagID != nil && *body.AddTagID > 0 {
		var okTag int
		if err := h.dbex(ctx).QueryRow(`SELECT id FROM mail_tags WHERE id=$1 AND account_id=$2`, *body.AddTagID, accountID).Scan(&okTag); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "étiquette action invalide"})
			return
		}
	}
	ruleOrder := 1000
	if body.RuleOrder != nil {
		ruleOrder = *body.RuleOrder
	}
	if ruleOrder < 0 {
		ruleOrder = 0
	}
	criteriaMap := map[string]interface{}{
		"from_pattern":        fromPat,
		"from_domain_pattern": domPat,
		"recipient_pattern":   rcpPat,
		"subject_pattern":     subPat,
		"has_attachments":     body.HasAttachments,
		"has_tag_id":          body.HasTagID,
	}
	actionsMap := map[string]interface{}{
		"action_folder": actionFolder,
		"mark_read":     body.MarkRead,
		"add_tag_id":    body.AddTagID,
	}
	criteriaJSON, _ := json.Marshal(criteriaMap)
	actionsJSON, _ := json.Marshal(actionsMap)
	var id int
	err := h.dbex(ctx).QueryRow(`
		INSERT INTO mail_filter_rules(account_id, name, from_pattern, from_domain_pattern, recipient_pattern, has_tag_id, add_tag_id, subject_pattern, has_attachments, action_folder, mark_read, enabled, rule_order, criteria_json, actions_json)
		SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb
		WHERE EXISTS (
			SELECT 1 FROM user_email_accounts
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		)
		RETURNING id
	`, accountID, name, fromPat, domPat, rcpPat, body.HasTagID, body.AddTagID, subPat, body.HasAttachments, actionFolder, body.MarkRead, enabled, ruleOrder, string(criteriaJSON), string(actionsJSON)).Scan(&id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "account not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

func (h *Handler) patchMailFilterRule(c *gin.Context) {
	accountID, ok := parsePositiveParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	ruleID, ok := parsePositiveParam(c, "ruleId")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}
	ctx := c.Request.Context()
	var body struct {
		Name              *string `json:"name"`
		FromPattern       *string `json:"from_pattern"`
		FromDomainPattern *string `json:"from_domain_pattern"`
		RecipientPattern  *string `json:"recipient_pattern"`
		HasTagID          *int    `json:"has_tag_id"`
		AddTagID          *int    `json:"add_tag_id"`
		SubjectPattern    *string `json:"subject_pattern"`
		HasAttachments    *bool   `json:"has_attachments"`
		ActionFolder      *string `json:"action_folder"`
		MarkRead          *bool   `json:"mark_read"`
		Enabled           *bool   `json:"enabled"`
		RuleOrder         *int    `json:"rule_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body JSON invalide"})
		return
	}
	if body.HasTagID != nil && *body.HasTagID > 0 {
		var okTag int
		if err := h.dbex(ctx).QueryRow(`SELECT id FROM mail_tags WHERE id=$1 AND account_id=$2`, *body.HasTagID, accountID).Scan(&okTag); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "étiquette critère invalide"})
			return
		}
	}
	if body.AddTagID != nil && *body.AddTagID > 0 {
		var okTag int
		if err := h.dbex(ctx).QueryRow(`SELECT id FROM mail_tags WHERE id=$1 AND account_id=$2`, *body.AddTagID, accountID).Scan(&okTag); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "étiquette action invalide"})
			return
		}
	}
	set := []string{}
	args := []interface{}{}
	idx := 1
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			name = "Règle automatique"
		}
		set = append(set, "name = $"+strconv.Itoa(idx))
		args = append(args, name)
		idx++
	}
	if body.FromPattern != nil {
		v := strings.TrimSpace(*body.FromPattern)
		set = append(set, "from_pattern = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if body.FromDomainPattern != nil {
		v := normalizeFromDomainPattern(*body.FromDomainPattern)
		set = append(set, "from_domain_pattern = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if body.RecipientPattern != nil {
		v := strings.TrimSpace(strings.ToLower(*body.RecipientPattern))
		set = append(set, "recipient_pattern = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if body.HasTagID != nil {
		set = append(set, "has_tag_id = $"+strconv.Itoa(idx))
		if *body.HasTagID > 0 {
			args = append(args, *body.HasTagID)
		} else {
			args = append(args, nil)
		}
		idx++
	}
	if body.AddTagID != nil {
		set = append(set, "add_tag_id = $"+strconv.Itoa(idx))
		if *body.AddTagID > 0 {
			args = append(args, *body.AddTagID)
		} else {
			args = append(args, nil)
		}
		idx++
	}
	if body.SubjectPattern != nil {
		v := strings.TrimSpace(*body.SubjectPattern)
		set = append(set, "subject_pattern = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if body.HasAttachments != nil {
		set = append(set, "has_attachments = $"+strconv.Itoa(idx))
		args = append(args, *body.HasAttachments)
		idx++
	}
	if body.ActionFolder != nil {
		folder := strings.TrimSpace(*body.ActionFolder)
		if folder == "" {
			folder = "inbox"
		}
		if isStandardMailFolder(folder) {
			folder = strings.ToLower(folder)
		}
		if !h.folderAllowed(ctx, accountID, folder) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dossier d'action invalide"})
			return
		}
		set = append(set, "action_folder = $"+strconv.Itoa(idx))
		args = append(args, folder)
		idx++
	}
	if body.MarkRead != nil {
		set = append(set, "mark_read = $"+strconv.Itoa(idx))
		args = append(args, *body.MarkRead)
		idx++
	}
	if body.Enabled != nil {
		set = append(set, "enabled = $"+strconv.Itoa(idx))
		args = append(args, *body.Enabled)
		idx++
	}
	if body.RuleOrder != nil {
		ord := *body.RuleOrder
		if ord < 0 {
			ord = 0
		}
		set = append(set, "rule_order = $"+strconv.Itoa(idx))
		args = append(args, ord)
		idx++
	}
	if len(set) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "aucun champ à modifier"})
		return
	}
	set = append(set, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, ruleID, accountID)
	res, err := h.dbex(ctx).Exec(`
		UPDATE mail_filter_rules
		SET `+strings.Join(set, ", ")+`
		WHERE id = $`+strconv.Itoa(idx)+` AND account_id = $`+strconv.Itoa(idx+1)+`
		  AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) deleteMailFilterRule(c *gin.Context) {
	accountID, ok := parsePositiveParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	ruleID, ok := parsePositiveParam(c, "ruleId")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rule id"})
		return
	}
	ctx := c.Request.Context()
	res, err := h.dbex(ctx).Exec(`
		DELETE FROM mail_filter_rules
		WHERE id = $1 AND account_id = $2
		  AND account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
	`, ruleID, accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "rule not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) applyMailFilterRulesNow(c *gin.Context) {
	accountID, ok := parsePositiveParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid account id"})
		return
	}
	affected, err := h.applyMailRulesForAccount(c.Request.Context(), accountID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "affected": affected})
}

func parsePositiveParam(c *gin.Context, name string) (int, bool) {
	v, err := strconv.Atoi(c.Param(name))
	if err != nil || v <= 0 {
		return 0, false
	}
	return v, true
}

func normalizeFromDomainPattern(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.TrimPrefix(s, "@")
	return strings.TrimSpace(s)
}

func ruleFromDomainMatches(fromHeader, patternNorm string) bool {
	if patternNorm == "" {
		return true
	}
	dom := strings.TrimSpace(strings.ToLower(spamExtractEmailDomain(strings.ToLower(fromHeader))))
	// `spamExtractEmailDomain` peut laisser un `>` ou des espaces collés quand le from
	// est au format `Display <addr@dom>` ; on nettoie ici pour le matching de règles.
	dom = strings.TrimRight(dom, " \t>")
	if dom == "" {
		return false
	}
	if dom == patternNorm {
		return true
	}
	return strings.HasSuffix(dom, "."+patternNorm)
}

// ruleMatchCriteria — conditions pures d'une règle de tri Mail, testables sans DB.
//
// Utilisé par `applyMailRulesForAccount` au moment de décider si une règle s'applique à un
// message donné, et exposé pour les tests (`mail_rules_test.go`). Toutes les chaînes patterns
// sont attendues telles qu'enregistrées (le helper applique lui-même la mise en minuscule
// nécessaire). Les pointeurs représentent des conditions optionnelles : `nil` = ignoré.
type ruleMatchCriteria struct {
	FromPattern      string
	FromDomainNorm   string // résultat de normalizeFromDomainPattern
	RecipientPattern string
	SubjectPattern   string
	HasAttachments   *bool
	HasTagID         *int
}

type messageForRules struct {
	FromAddr        string
	ToAddrs         string
	Subject         string
	AttachmentCount int
	TagIDs          map[int]struct{}
}

func ruleMatches(rule ruleMatchCriteria, msg messageForRules) bool {
	fromLower := strings.ToLower(msg.FromAddr)
	toLower := strings.ToLower(msg.ToAddrs)
	subjLower := strings.ToLower(msg.Subject)
	if rule.FromPattern != "" && !strings.Contains(fromLower, strings.ToLower(rule.FromPattern)) {
		return false
	}
	if !ruleFromDomainMatches(msg.FromAddr, rule.FromDomainNorm) {
		return false
	}
	if rule.RecipientPattern != "" && !strings.Contains(toLower, strings.ToLower(rule.RecipientPattern)) {
		return false
	}
	if rule.SubjectPattern != "" && !strings.Contains(subjLower, strings.ToLower(rule.SubjectPattern)) {
		return false
	}
	if rule.HasAttachments != nil {
		if (msg.AttachmentCount > 0) != *rule.HasAttachments {
			return false
		}
	}
	if rule.HasTagID != nil {
		if msg.TagIDs == nil {
			return false
		}
		if _, ok := msg.TagIDs[*rule.HasTagID]; !ok {
			return false
		}
	}
	return true
}

func (h *Handler) applyMailRulesForAccount(ctx context.Context, accountID int) (int, error) {
	rows, err := h.dbex(ctx).Query(`
		SELECT id, from_pattern, from_domain_pattern, recipient_pattern, has_tag_id, add_tag_id, subject_pattern, has_attachments, action_folder, mark_read
		FROM mail_filter_rules
		WHERE account_id = $1 AND enabled = TRUE
		ORDER BY rule_order ASC, id ASC
	`, accountID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	type dbRule struct {
		id               int
		fromPattern      string
		fromDomainNorm   string
		recipientPattern string
		hasTagID         sql.NullInt64
		addTagID         sql.NullInt64
		subjectPattern   string
		hasAttachments   sql.NullBool
		actionFolder     string
		markRead         sql.NullBool
	}
	var rules []dbRule
	for rows.Next() {
		var r dbRule
		var domRaw string
		if err := rows.Scan(&r.id, &r.fromPattern, &domRaw, &r.recipientPattern, &r.hasTagID, &r.addTagID, &r.subjectPattern, &r.hasAttachments, &r.actionFolder, &r.markRead); err != nil {
			continue
		}
		r.fromDomainNorm = normalizeFromDomainPattern(domRaw)
		rules = append(rules, r)
	}
	if len(rules) == 0 {
		return 0, nil
	}
	msgRows, err := h.dbex(ctx).Query(`
		SELECT id, COALESCE(from_addr, ''), COALESCE(to_addrs, ''), COALESCE(subject, ''), COALESCE(attachment_count, 0), COALESCE(folder, ''), COALESCE(is_read, FALSE), COALESCE(message_uid, 0)
		FROM mail_messages
		WHERE account_id = $1
	`, accountID)
	if err != nil {
		return 0, err
	}
	defer msgRows.Close()
	tagRows, err := h.dbex(ctx).Query(`
		SELECT mt.message_id, mt.tag_id
		FROM mail_message_tags mt
		INNER JOIN mail_messages m ON m.id = mt.message_id
		WHERE m.account_id = $1
	`, accountID)
	if err != nil {
		return 0, err
	}
	msgTagSet := map[int]map[int]struct{}{}
	for tagRows.Next() {
		var mid, tid int
		if err := tagRows.Scan(&mid, &tid); err != nil {
			continue
		}
		if _, ok := msgTagSet[mid]; !ok {
			msgTagSet[mid] = map[int]struct{}{}
		}
		msgTagSet[mid][tid] = struct{}{}
	}
	tagRows.Close()

	affected := 0
	var imapClientConn *client.Client
	imapAvailable := true
	defer func() {
		if imapClientConn != nil {
			_ = imapClientConn.Logout()
		}
	}()
	for msgRows.Next() {
		var msgID int
		var fromAddr, toAddrs, subject, folder string
		var attachmentCount int
		var isRead bool
		var messageUID int64
		if err := msgRows.Scan(&msgID, &fromAddr, &toAddrs, &subject, &attachmentCount, &folder, &isRead, &messageUID); err != nil {
			continue
		}
		for _, rule := range rules {
			crit := ruleMatchCriteria{
				FromPattern:      rule.fromPattern,
				FromDomainNorm:   rule.fromDomainNorm,
				RecipientPattern: rule.recipientPattern,
				SubjectPattern:   rule.subjectPattern,
			}
			if rule.hasAttachments.Valid {
				v := rule.hasAttachments.Bool
				crit.HasAttachments = &v
			}
			if rule.hasTagID.Valid {
				v := int(rule.hasTagID.Int64)
				crit.HasTagID = &v
			}
			msgInput := messageForRules{
				FromAddr:        fromAddr,
				ToAddrs:         toAddrs,
				Subject:         subject,
				AttachmentCount: attachmentCount,
				TagIDs:          msgTagSet[msgID],
			}
			if !ruleMatches(crit, msgInput) {
				continue
			}
			newFolder := strings.TrimSpace(rule.actionFolder)
			if isStandardMailFolder(newFolder) {
				newFolder = strings.ToLower(newFolder)
			}
			if !h.folderAllowed(ctx, accountID, newFolder) {
				continue
			}
			newRead := isRead
			if rule.markRead.Valid {
				newRead = rule.markRead.Bool
			}
			res, err := h.dbex(ctx).Exec(`
				UPDATE mail_messages
				SET folder = $1, is_read = $2
				WHERE id = $3 AND account_id = $4
			`, newFolder, newRead, msgID, accountID)
			if err == nil {
				n, _ := res.RowsAffected()
				if n > 0 {
					affected++
					folderChanged := !strings.EqualFold(strings.TrimSpace(folder), strings.TrimSpace(newFolder))
					readChanged := isRead != newRead
					if messageUID > 0 && imapAvailable && (folderChanged || readChanged) {
						if imapClientConn == nil {
							_, ic, imapErr := h.imapDialAndLogin(ctx, accountID, "")
							if imapErr != nil {
								imapAvailable = false
								log.Printf("[mail-rules] IMAP indisponible pour réconciliation account=%d: %v", accountID, imapErr)
							} else {
								imapClientConn = ic
							}
						}
						if imapClientConn != nil {
							if imapErr := h.reconcileMessageStateOnIMAP(ctx, accountID, imapClientConn, uint32(messageUID), folder, newFolder, isRead, newRead); imapErr != nil {
								log.Printf("[mail-rules] Réconciliation IMAP échouée account=%d msg=%d uid=%d: %v", accountID, msgID, messageUID, imapErr)
							}
						}
					}
					if rule.addTagID.Valid && int(rule.addTagID.Int64) > 0 {
						_, _ = h.dbex(ctx).Exec(`
							INSERT INTO mail_message_tags (message_id, tag_id)
							SELECT $1, t.id FROM mail_tags t
							WHERE t.id = $2 AND t.account_id = $3
							ON CONFLICT (message_id, tag_id) DO NOTHING
						`, msgID, int(rule.addTagID.Int64), accountID)
						if _, ok := msgTagSet[msgID]; !ok {
							msgTagSet[msgID] = map[int]struct{}{}
						}
						msgTagSet[msgID][int(rule.addTagID.Int64)] = struct{}{}
					}
				}
			}
			break
		}
	}
	return affected, nil
}

func (h *Handler) reconcileMessageStateOnIMAP(
	ctx context.Context,
	accountID int,
	ic *client.Client,
	uid uint32,
	dbSourceFolder string,
	dbTargetFolder string,
	wasRead bool,
	nowRead bool,
) error {
	sourceMailbox, err := h.imapResolveSourceMailbox(ctx, accountID, ic, dbSourceFolder, uid)
	if err != nil {
		return err
	}
	targetMailbox := sourceMailbox
	if !strings.EqualFold(strings.TrimSpace(dbSourceFolder), strings.TrimSpace(dbTargetFolder)) {
		destCandidates := h.imapCandidatesForAccountFolder(ctx, accountID, dbTargetFolder)
		if len(destCandidates) == 0 {
			return nil
		}
		if err := imapUidMoveToFirstDest(ic, sourceMailbox, uid, destCandidates); err != nil {
			return err
		}
		targetMailbox = destCandidates[0]
		for _, mb := range destCandidates {
			ok, chkErr := imapMailboxContainsUID(ic, mb, uid)
			if chkErr != nil {
				continue
			}
			if ok {
				targetMailbox = mb
				break
			}
		}
	}
	if wasRead == nowRead {
		return nil
	}
	if _, err := ic.Select(targetMailbox, false); err != nil {
		return err
	}
	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)
	var op imap.FlagsOp = imap.RemoveFlags
	if nowRead {
		op = imap.AddFlags
	}
	storeItem := imap.FormatFlagsOp(op, true)
	return ic.UidStore(seqset, storeItem, []interface{}{imap.SeenFlag}, nil)
}
