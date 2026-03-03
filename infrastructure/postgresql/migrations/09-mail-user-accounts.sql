-- Comptes mail reliés par l'utilisateur (IMAP/SMTP externes) et messages stockés.
-- Isolation par user_id (app.current_user_id).

CREATE TABLE IF NOT EXISTS user_email_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(512) NOT NULL,
    label VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS mail_messages (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
    folder VARCHAR(128) NOT NULL DEFAULT 'inbox',
    message_uid BIGINT NOT NULL,
    from_addr VARCHAR(512) NOT NULL DEFAULT '',
    to_addrs TEXT NOT NULL DEFAULT '',
    subject VARCHAR(1024) NOT NULL DEFAULT '',
    body_plain TEXT,
    body_html TEXT,
    date_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, folder, message_uid)
);

CREATE INDEX IF NOT EXISTS idx_user_email_accounts_user ON user_email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_account ON mail_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_account_folder ON mail_messages(account_id, folder);

ALTER TABLE user_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_email_accounts_user_isolation ON user_email_accounts;
CREATE POLICY user_email_accounts_user_isolation ON user_email_accounts
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DROP POLICY IF EXISTS mail_messages_via_account ON mail_messages;
CREATE POLICY mail_messages_via_account ON mail_messages
    FOR ALL USING (
        account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON user_email_accounts TO cloudity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mail_messages TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE user_email_accounts_id_seq TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_messages_id_seq TO cloudity_app;
