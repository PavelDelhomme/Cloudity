-- Envoi programmé (brouillon planifié) dans mail_messages.
-- Le message reste en dossier virtuel "scheduled" jusqu'à l'envoi effectif.

ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_status VARCHAR(32) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_mail_messages_scheduled_due
  ON mail_messages (scheduled_send_at, id)
  WHERE LOWER(TRIM(folder)) = 'scheduled' AND COALESCE(scheduled_status, '') = 'scheduled' AND scheduled_send_at IS NOT NULL;
