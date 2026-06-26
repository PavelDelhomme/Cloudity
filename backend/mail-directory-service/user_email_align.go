package main

import (
	"context"
	"database/sql"
	"log"
	"strings"
)

// isPlaceholderCloudityLoginEmail : comptes seed / démo (@cloudity.local) remplaçables par l'email IMAP principal.
func isPlaceholderCloudityLoginEmail(email string) bool {
	e := strings.ToLower(strings.TrimSpace(email))
	if e == "" {
		return false
	}
	return strings.HasSuffix(e, "@cloudity.local")
}

// maybeAlignUserLoginEmail aligne users.email sur la boîte mail reliée si le login actuel est un placeholder démo.
// Retourne (aligné, nouvel email login ou "").
func (h *Handler) maybeAlignUserLoginEmail(ctx context.Context, userID, tenantID int, mailboxEmail string) (bool, string) {
	mailboxEmail = strings.ToLower(strings.TrimSpace(mailboxEmail))
	if mailboxEmail == "" || !strings.Contains(mailboxEmail, "@") || userID <= 0 || tenantID <= 0 || h.db == nil {
		return false, ""
	}

	var currentEmail string
	err := h.db.QueryRowContext(ctx, `
		SELECT email FROM users WHERE id = $1 AND tenant_id = $2
	`, userID, tenantID).Scan(&currentEmail)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("[mail] align login email: read user %d: %v", userID, err)
		}
		return false, ""
	}
	if strings.EqualFold(currentEmail, mailboxEmail) {
		return false, currentEmail
	}
	if !isPlaceholderCloudityLoginEmail(currentEmail) {
		return false, currentEmail
	}

	var conflictID int
	err = h.db.QueryRowContext(ctx, `
		SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = $2 AND id <> $3 LIMIT 1
	`, tenantID, mailboxEmail, userID).Scan(&conflictID)
	if err == nil {
		log.Printf("[mail] align login email: %s déjà utilisé (user_id=%d), garde %s", mailboxEmail, conflictID, currentEmail)
		return false, currentEmail
	}
	if err != sql.ErrNoRows {
		log.Printf("[mail] align login email: conflit check: %v", err)
		return false, currentEmail
	}

	res, err := h.db.ExecContext(ctx, `
		UPDATE users SET email = $1, updated_at = NOW()
		WHERE id = $2 AND tenant_id = $3
	`, mailboxEmail, userID, tenantID)
	if err != nil {
		log.Printf("[mail] align login email: update user %d: %v", userID, err)
		return false, currentEmail
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return false, currentEmail
	}
	log.Printf("[mail] align login email: %s → %s (user_id=%d)", currentEmail, mailboxEmail, userID)
	return true, mailboxEmail
}
