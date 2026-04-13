-- Dossiers IMAP découverts (LIST) + tags utilisateur par boîte + liaison messages

ALTER TABLE mail_messages ALTER COLUMN folder TYPE VARCHAR(512);

CREATE TABLE IF NOT EXISTS mail_imap_folders (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
    imap_path VARCHAR(512) NOT NULL,
    parent_imap_path VARCHAR(512) NOT NULL DEFAULT '',
    label VARCHAR(512) NOT NULL DEFAULT '',
    delimiter VARCHAR(8) NOT NULL DEFAULT '/',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, imap_path)
);

CREATE INDEX IF NOT EXISTS idx_mail_imap_folders_account ON mail_imap_folders(account_id);

ALTER TABLE mail_imap_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_imap_folders_via_account ON mail_imap_folders;
CREATE POLICY mail_imap_folders_via_account ON mail_imap_folders
    FOR ALL USING (
        account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON mail_imap_folders TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_imap_folders_id_seq TO cloudity_app;

CREATE TABLE IF NOT EXISTS mail_tags (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    color VARCHAR(32) NOT NULL DEFAULT 'slate',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_tags_account_name_lower ON mail_tags(account_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_mail_tags_account ON mail_tags(account_id);

ALTER TABLE mail_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_tags_via_account ON mail_tags;
CREATE POLICY mail_tags_via_account ON mail_tags
    FOR ALL USING (
        account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON mail_tags TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_tags_id_seq TO cloudity_app;

CREATE TABLE IF NOT EXISTS mail_message_tags (
    message_id INTEGER NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES mail_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_message_tags_message ON mail_message_tags(message_id);
CREATE INDEX IF NOT EXISTS idx_mail_message_tags_tag ON mail_message_tags(tag_id);

ALTER TABLE mail_message_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mail_message_tags_via_message ON mail_message_tags;
CREATE POLICY mail_message_tags_via_message ON mail_message_tags
    FOR ALL USING (
        message_id IN (
            SELECT m.id FROM mail_messages m
            INNER JOIN user_email_accounts u ON u.id = m.account_id
            WHERE u.user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON mail_message_tags TO cloudity_app;
