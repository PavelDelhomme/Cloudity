-- OAuth (ex. Google) : stockage du refresh token pour éviter les mots de passe d'application.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(32) DEFAULT NULL;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS oauth_refresh_token_encrypted TEXT DEFAULT NULL;

-- État OAuth temporaire (state) pour le callback : user_id + tenant_id.
CREATE TABLE IF NOT EXISTS mail_oauth_state (
    state VARCHAR(128) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    return_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_oauth_state_created ON mail_oauth_state(created_at);
GRANT SELECT, INSERT, DELETE ON mail_oauth_state TO cloudity_app;
