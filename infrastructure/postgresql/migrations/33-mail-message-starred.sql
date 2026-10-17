-- Favori Hubera Mail : le message reste dans son dossier, le drapeau est porté par l'API.
ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mail_messages_account_starred
  ON mail_messages (account_id, id)
  WHERE is_starred = true;
