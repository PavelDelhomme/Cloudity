-- Préférence utilisateur : suffixe @ des alias (ex. domaine dédié type maily.*)
-- + colonne enabled sur les alias (utilisée par l’API, absente des migrations initiales)

ALTER TABLE user_email_aliases
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS mail_user_alias_prefs (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    alias_host_suffix VARCHAR(253) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE mail_user_alias_prefs IS
  'Suffixe après @ choisi par l’utilisateur pour créer des alias (prioritaire sur MAIL_ALIAS_SUBDOMAIN en dev).';

ALTER TABLE mail_user_alias_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_user_alias_prefs_owner ON mail_user_alias_prefs;
CREATE POLICY mail_user_alias_prefs_owner ON mail_user_alias_prefs
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::INTEGER);

GRANT SELECT, INSERT, UPDATE, DELETE ON mail_user_alias_prefs TO cloudity_app;
