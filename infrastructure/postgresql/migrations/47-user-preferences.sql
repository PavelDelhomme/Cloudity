-- Migration 47 — Préférences utilisateur (thème par app, Pass clipboard/TOTP, …).
-- Sync cross-device via GET/PUT /auth/me/preferences (auth-service).
-- Référence : docs/produit/CLOUDITY-USER-PREFERENCES.md

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at ON user_preferences (updated_at DESC);

COMMENT ON TABLE user_preferences IS 'Préférences UI/comportement par utilisateur (JSON merge côté API).';
COMMENT ON COLUMN user_preferences.prefs IS 'Ex. theme.default, theme.apps.pass, pass.clipboardClearMs, pass.totpAutoCopy';
