package main

import (
	"context"
	"database/sql"
)

func (h *Handler) queryMailStorageUsage(ctx context.Context) (storageServiceUsage, error) {
	var msgBytes, msgCount, attBytes int64
	err := h.db.QueryRowContext(ctx, `
SELECT
  COALESCE(SUM(
    octet_length(COALESCE(m.body_plain, '')) +
    octet_length(COALESCE(m.body_html, '')) +
    octet_length(COALESCE(m.raw_headers, ''))
  ), 0),
  COUNT(*)::bigint,
  COALESCE((
    SELECT SUM(a.size_bytes)
    FROM mail_message_attachments a
    INNER JOIN mail_messages m2 ON m2.id = a.message_id
    WHERE m2.account_id IN (
      SELECT id FROM user_email_accounts
      WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
    )
  ), 0)
FROM mail_messages m
WHERE m.account_id IN (
  SELECT id FROM user_email_accounts
  WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
)
`).Scan(&msgBytes, &msgCount, &attBytes)
	if err != nil && err != sql.ErrNoRows {
		return storageServiceUsage{}, err
	}
	return storageServiceUsage{
		Label:     "Mail",
		Bytes:     msgBytes + attBytes,
		FileCount: msgCount,
	}, nil
}
