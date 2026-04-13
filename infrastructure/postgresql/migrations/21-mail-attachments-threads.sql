-- Pièces jointes (métadonnées + contenu optionnel) et regroupement conversation (thread_key).

ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS internet_msg_id VARCHAR(1024) NOT NULL DEFAULT '';
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS in_reply_to VARCHAR(1024) NOT NULL DEFAULT '';
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS references_header TEXT;
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS thread_key VARCHAR(1024) NOT NULL DEFAULT '';
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS attachment_count SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mail_messages_account_thread ON mail_messages(account_id, thread_key);
CREATE INDEX IF NOT EXISTS idx_mail_messages_account_internet_msg
  ON mail_messages(account_id, internet_msg_id) WHERE internet_msg_id <> '';

CREATE TABLE IF NOT EXISTS mail_message_attachments (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
    part_ordinal SMALLINT NOT NULL,
    filename VARCHAR(512) NOT NULL DEFAULT '',
    content_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes INTEGER NOT NULL DEFAULT 0,
    content BYTEA,
    UNIQUE(message_id, part_ordinal)
);

CREATE INDEX IF NOT EXISTS idx_mail_message_attachments_message ON mail_message_attachments(message_id);

ALTER TABLE mail_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_attachments_via_message ON mail_message_attachments;
CREATE POLICY mail_attachments_via_message ON mail_message_attachments
    FOR ALL USING (
        message_id IN (
            SELECT id FROM mail_messages WHERE account_id IN (
                SELECT id FROM user_email_accounts
                WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
            )
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON mail_message_attachments TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_message_attachments_id_seq TO cloudity_app;
