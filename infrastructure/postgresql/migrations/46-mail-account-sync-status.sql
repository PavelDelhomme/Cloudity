-- État de la dernière synchronisation IMAP par boîte (erreur visible côté UI).
ALTER TABLE user_email_accounts
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
