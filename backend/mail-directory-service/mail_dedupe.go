package main

import (
	"context"
	"fmt"
	"strings"
)

func mailListOrderByClause(orderQuery, ftsOrderPrefix, tieBreakSuffix string) string {
	orderDir := "DESC"
	if strings.EqualFold(strings.TrimSpace(orderQuery), "asc") {
		orderDir = "ASC"
	}
	parts := strings.Split(tieBreakSuffix, ",")
	tie := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		tie = append(tie, fmt.Sprintf("%s %s", p, orderDir))
	}
	base := fmt.Sprintf("m.date_at %s NULLS LAST", orderDir)
	if len(tie) > 0 {
		base += ", " + strings.Join(tie, ", ")
	}
	if ftsOrderPrefix != "" {
		return ftsOrderPrefix + base
	}
	return base
}

// dedupeMailMessagesAfterSync supprime les doublons évidents après une sync IMAP
// (même Message-ID, ou même expéditeur + objet + dossier + date proche).
func (h *Handler) dedupeMailMessagesAfterSync(ctx context.Context, accountID int) {
	if h.db == nil || accountID <= 0 {
		return
	}
	_, _ = h.dbex(ctx).Exec(`
		DELETE FROM mail_messages m
		USING mail_messages keep
		WHERE m.account_id = $1
		  AND keep.account_id = $1
		  AND COALESCE(m.internet_msg_id, '') <> ''
		  AND m.internet_msg_id = keep.internet_msg_id
		  AND m.id > keep.id
	`, accountID)
	_, _ = h.dbex(ctx).Exec(`
		DELETE FROM mail_messages m
		USING mail_messages keep
		WHERE m.account_id = $1
		  AND keep.account_id = $1
		  AND m.id > keep.id
		  AND LOWER(TRIM(m.folder)) = LOWER(TRIM(keep.folder))
		  AND LOWER(TRIM(m.from_addr)) = LOWER(TRIM(keep.from_addr))
		  AND LOWER(TRIM(m.subject)) = LOWER(TRIM(keep.subject))
		  AND m.date_at IS NOT NULL
		  AND keep.date_at IS NOT NULL
		  AND ABS(EXTRACT(EPOCH FROM (m.date_at - keep.date_at))) < 120
	`, accountID)
}
