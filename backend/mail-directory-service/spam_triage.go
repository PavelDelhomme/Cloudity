package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/emersion/go-imap/client"
)

const (
	clouditySpamBlockRulePrefix = "Cloudity · spam ·"
	clouditySpamHamRulePrefix   = "Cloudity · pas indésirable ·"
)

type spamAutoTriageConfig struct {
	Enabled   bool
	Threshold int
}

func mailSpamAutoTriageConfig() spamAutoTriageConfig {
	enabled := true
	if v := strings.TrimSpace(os.Getenv("MAIL_SPAM_AUTO_TRIAGE_ENABLED")); v != "" {
		switch strings.ToLower(v) {
		case "0", "false", "no", "off":
			enabled = false
		}
	}
	threshold := 52
	if v := strings.TrimSpace(os.Getenv("MAIL_SPAM_AUTO_TRIAGE_THRESHOLD")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 100 {
			threshold = n
		}
	}
	return spamAutoTriageConfig{Enabled: enabled, Threshold: threshold}
}

// spamScoreFromRawHeaders lit les en-têtes Rspamd / SpamAssassin si présents (MTA Cloudity ou fournisseur).
func spamScoreFromRawHeaders(rawHeaders string) int {
	if strings.TrimSpace(rawHeaders) == "" {
		return 0
	}
	lines := strings.Split(strings.ReplaceAll(rawHeaders, "\r\n", "\n"), "\n")
	best := 0
	for _, line := range lines {
		lower := strings.ToLower(strings.TrimSpace(line))
		if strings.HasPrefix(lower, "x-spam-score:") || strings.HasPrefix(lower, "x-rspamd-score:") {
			val := strings.TrimSpace(line[strings.Index(line, ":")+1:])
			if f, err := strconv.ParseFloat(val, 64); err == nil {
				n := int(f + 0.5)
				if n > 100 {
					n = 100
				}
				if n > best {
					best = n
				}
			}
		}
		if strings.HasPrefix(lower, "x-spam-status:") && strings.Contains(lower, "yes") {
			if best < 80 {
				best = 80
			}
		}
	}
	return best
}

func effectiveSpamScore(subject, fromAddr, rawHeaders string) int {
	h := spamHeuristicScore(subject, fromAddr)
	r := spamScoreFromRawHeaders(rawHeaders)
	if r > h {
		return r
	}
	return h
}

func (h *Handler) hasSenderHamExemption(ctx context.Context, accountID int, fromAddr string) bool {
	dom := normalizeFromDomainPattern(spamExtractEmailDomain(strings.ToLower(fromAddr)))
	if dom == "" {
		return false
	}
	var id int
	err := h.dbex(ctx).QueryRow(`
		SELECT id FROM mail_filter_rules
		WHERE account_id = $1 AND enabled = TRUE
		  AND LOWER(TRIM(action_folder)) = 'inbox'
		  AND LOWER(TRIM(COALESCE(from_domain_pattern, ''))) = $2
		  AND name LIKE $3
		LIMIT 1
	`, accountID, dom, clouditySpamHamRulePrefix+"%").Scan(&id)
	return err == nil && id > 0
}

// applyClouditySpamTriage déplace vers spam les messages encore en réception selon le score Cloudity
// (heuristique + en-têtes Rspamd), indépendamment du dossier Junk IMAP fournisseur.
func (h *Handler) applyClouditySpamTriage(ctx context.Context, accountID int) (int, error) {
	cfg := mailSpamAutoTriageConfig()
	if !cfg.Enabled {
		return 0, nil
	}
	rows, err := h.dbex(ctx).Query(`
		SELECT id, COALESCE(from_addr, ''), COALESCE(subject, ''), COALESCE(raw_headers, ''), COALESCE(folder, ''), COALESCE(is_read, FALSE), COALESCE(message_uid, 0)
		FROM mail_messages
		WHERE account_id = $1 AND LOWER(TRIM(folder)) = 'inbox'
	`, accountID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	affected := 0
	var imapClientConn *client.Client
	imapAvailable := true
	defer func() {
		if imapClientConn != nil {
			_ = imapClientConn.Logout()
		}
	}()

	for rows.Next() {
		var msgID int
		var fromAddr, subject, rawHeaders, folder string
		var isRead bool
		var messageUID int64
		if err := rows.Scan(&msgID, &fromAddr, &subject, &rawHeaders, &folder, &isRead, &messageUID); err != nil {
			continue
		}
		if h.hasSenderHamExemption(ctx, accountID, fromAddr) {
			continue
		}
		score := effectiveSpamScore(subject, fromAddr, rawHeaders)
		if score < cfg.Threshold {
			continue
		}
		res, err := h.dbex(ctx).Exec(`
			UPDATE mail_messages SET folder = 'spam'
			WHERE id = $1 AND account_id = $2 AND LOWER(TRIM(folder)) = 'inbox'
		`, msgID, accountID)
		if err != nil {
			continue
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			continue
		}
		affected++
		if messageUID > 0 && imapAvailable {
			if imapClientConn == nil {
				_, ic, imapErr := h.imapDialAndLogin(ctx, accountID, "")
				if imapErr != nil {
					imapAvailable = false
					log.Printf("[mail-spam] IMAP indisponible pour triage account=%d: %v", accountID, imapErr)
				} else {
					imapClientConn = ic
				}
			}
			if imapClientConn != nil {
				if imapErr := h.reconcileMessageStateOnIMAP(ctx, accountID, imapClientConn, uint32(messageUID), folder, "spam", isRead, isRead); imapErr != nil {
					log.Printf("[mail-spam] réconciliation IMAP triage account=%d msg=%d: %v", accountID, msgID, imapErr)
				}
			}
		}
	}
	if affected > 0 {
		log.Printf("[mail-spam] triage Cloudity account=%d → %d message(s) vers spam (seuil=%d)", accountID, affected, cfg.Threshold)
	}
	return affected, nil
}

func (h *Handler) ensureSenderSpamBlockRule(ctx context.Context, accountID int, fromAddr string) error {
	dom := normalizeFromDomainPattern(spamExtractEmailDomain(strings.ToLower(fromAddr)))
	if dom == "" {
		return nil
	}
	name := clouditySpamBlockRulePrefix + dom
	var existing int
	err := h.dbex(ctx).QueryRow(`
		SELECT id FROM mail_filter_rules
		WHERE account_id = $1 AND LOWER(TRIM(COALESCE(from_domain_pattern, ''))) = $2
		  AND LOWER(TRIM(action_folder)) = 'spam'
		  AND name LIKE $3
		LIMIT 1
	`, accountID, dom, clouditySpamBlockRulePrefix+"%").Scan(&existing)
	if err == nil {
		_, _ = h.dbex(ctx).Exec(`UPDATE mail_filter_rules SET enabled = true WHERE id = $1 AND account_id = $2`, existing, accountID)
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	criteriaJSON, _ := json.Marshal(map[string]string{"from_domain_pattern": dom})
	actionsJSON, _ := json.Marshal(map[string]string{"action_folder": "spam"})
	_, err = h.dbex(ctx).Exec(`
		INSERT INTO mail_filter_rules(account_id, name, from_domain_pattern, action_folder, enabled, rule_order, criteria_json, actions_json)
		VALUES ($1, $2, $3, 'spam', true, 200, $4::jsonb, $5::jsonb)
	`, accountID, name, dom, string(criteriaJSON), string(actionsJSON))
	return err
}

func (h *Handler) ensureSenderHamExemptionRule(ctx context.Context, accountID int, fromAddr string) error {
	dom := normalizeFromDomainPattern(spamExtractEmailDomain(strings.ToLower(fromAddr)))
	if dom == "" {
		return nil
	}
	name := clouditySpamHamRulePrefix + dom
	var existing int
	err := h.dbex(ctx).QueryRow(`
		SELECT id FROM mail_filter_rules
		WHERE account_id = $1 AND LOWER(TRIM(COALESCE(from_domain_pattern, ''))) = $2
		  AND LOWER(TRIM(action_folder)) = 'inbox'
		  AND name LIKE $3
		LIMIT 1
	`, accountID, dom, clouditySpamHamRulePrefix+"%").Scan(&existing)
	if err == nil {
		_, _ = h.dbex(ctx).Exec(`UPDATE mail_filter_rules SET enabled = true, rule_order = 50 WHERE id = $1 AND account_id = $2`, existing, accountID)
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	criteriaJSON, _ := json.Marshal(map[string]string{"from_domain_pattern": dom})
	actionsJSON, _ := json.Marshal(map[string]string{"action_folder": "inbox"})
	_, err = h.dbex(ctx).Exec(`
		INSERT INTO mail_filter_rules(account_id, name, from_domain_pattern, action_folder, enabled, rule_order, criteria_json, actions_json)
		VALUES ($1, $2, $3, 'inbox', true, 50, $4::jsonb, $5::jsonb)
	`, accountID, name, dom, string(criteriaJSON), string(actionsJSON))
	return err
}

func (h *Handler) clouditySpamLearnFromMove(ctx context.Context, accountID int, fromAddr, prevFolder, destFolder string) {
	prev := strings.ToLower(strings.TrimSpace(prevFolder))
	dest := strings.ToLower(strings.TrimSpace(destFolder))
	if dest == "spam" && prev != "spam" {
		if err := h.ensureSenderSpamBlockRule(ctx, accountID, fromAddr); err != nil {
			log.Printf("[mail-spam] règle blocage expéditeur account=%d: %v", accountID, err)
		}
	}
	if dest == "inbox" && prev == "spam" {
		if err := h.ensureSenderHamExemptionRule(ctx, accountID, fromAddr); err != nil {
			log.Printf("[mail-spam] exemption ham account=%d: %v", accountID, err)
		}
	}
}
