-- identity_app_links : lien Cloudity users ↔ users apps satellites (PLM, Gasoil, JT)
-- Phase 1 SSO opt-in — ne touche PAS aux volumes ytmusic / gasoil.
-- Appliquer seulement quand CLOUDITY_SSO démarre (auth-service + flag).

CREATE TABLE IF NOT EXISTS identity_app_links (
    id BIGSERIAL PRIMARY KEY,
    cloudity_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id VARCHAR(64) NOT NULL,
    external_user_id VARCHAR(128) NOT NULL,
    email_normalized VARCHAR(255) NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT identity_app_links_app_external UNIQUE (app_id, external_user_id),
    CONSTRAINT identity_app_links_user_app UNIQUE (cloudity_user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_app_links_email
  ON identity_app_links (email_normalized);

COMMENT ON TABLE identity_app_links IS
  'Lien opt-in Cloudity ID ↔ user externe (ytmusic|gasoil|jobbingtrack). Auth locale des apps reste valide.';
