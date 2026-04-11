-- Alias d’envoi / adresses supplémentaires rattachées à une boîte connectée (filtre boîte « virtuelle » côté UI)

CREATE TABLE IF NOT EXISTS user_email_aliases (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
    alias_email VARCHAR(512) NOT NULL,
    label VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, alias_email)
);

CREATE INDEX IF NOT EXISTS idx_user_email_aliases_account ON user_email_aliases(account_id);

ALTER TABLE user_email_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_email_aliases_via_account ON user_email_aliases;
CREATE POLICY user_email_aliases_via_account ON user_email_aliases
    FOR ALL USING (
        account_id IN (SELECT id FROM user_email_accounts WHERE user_id = current_setting('app.current_user_id', true)::INTEGER)
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON user_email_aliases TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE user_email_aliases_id_seq TO cloudity_app;
