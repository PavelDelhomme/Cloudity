package main

import (
	"context"
	"strings"
)

// recordMailSyncSuccess efface l'erreur et horodate la dernière sync réussie.
func (h *Handler) recordMailSyncSuccess(ctx context.Context, accountID, userID int) {
	if accountID <= 0 || userID <= 0 {
		return
	}
	_, _ = h.dbex(ctx).Exec(`
		UPDATE user_email_accounts
		SET last_sync_error = NULL,
		    last_sync_at = CURRENT_TIMESTAMP,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND user_id = $2
	`, accountID, userID)
}

// recordMailSyncFailure enregistre l'erreur. Si invalidatePassword, efface le secret IMAP
// (mot de passe refusé) pour forcer une resaisie et imap_auth_ready=false.
func (h *Handler) recordMailSyncFailure(
	ctx context.Context,
	accountID, userID int,
	errMsg string,
	invalidatePassword bool,
) {
	if accountID <= 0 || userID <= 0 {
		return
	}
	errMsg = strings.TrimSpace(errMsg)
	if errMsg == "" {
		errMsg = "échec de synchronisation IMAP"
	}
	if invalidatePassword {
		_, _ = h.dbex(ctx).Exec(`
			UPDATE user_email_accounts
			SET password_encrypted = NULL,
			    last_sync_error = $1,
			    last_sync_at = CURRENT_TIMESTAMP,
			    updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 AND user_id = $3
		`, errMsg, accountID, userID)
		return
	}
	_, _ = h.dbex(ctx).Exec(`
		UPDATE user_email_accounts
		SET last_sync_error = $1,
		    last_sync_at = CURRENT_TIMESTAMP,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND user_id = $3
	`, errMsg, accountID, userID)
}
