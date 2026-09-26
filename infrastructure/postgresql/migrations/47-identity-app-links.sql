-- Migration 47: Tables pour SSO Hubera ID cross-app
-- identity_app_links : lie un compte Cloudity (Hubera ID) aux comptes des apps satellites
-- device_sessions : tracking des sessions par device pour SSO cross-app
-- migration_status : suivi des migrations de comptes vers Hubera ID

-- Table identity_app_links (lien Hubera ID ↔ app satellite)
CREATE TABLE IF NOT EXISTS identity_app_links (
    id BIGSERIAL PRIMARY KEY,
    cloudity_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id VARCHAR(50) NOT NULL,
    external_user_id VARCHAR(255) NOT NULL,
    email_normalized VARCHAR(255) NOT NULL,
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cloudity_user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_app_links_user ON identity_app_links(cloudity_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_app_links_app ON identity_app_links(app_id);
CREATE INDEX IF NOT EXISTS idx_identity_app_links_email ON identity_app_links(email_normalized);

-- Table device_sessions (pour le tracking des sessions par device)
CREATE TABLE IF NOT EXISTS device_sessions (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    last_app VARCHAR(50),
    user_agent TEXT,
    ip_address VARCHAR(45),
    UNIQUE(device_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_device_id ON device_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_active ON device_sessions(is_active) WHERE is_active = true;

-- Table migration_status (pour le suivi des migrations de compte)
CREATE TABLE IF NOT EXISTS migration_status (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    app_id VARCHAR(50) NOT NULL,
    old_email VARCHAR(255),
    hubera_id_email VARCHAR(255),
    migrated_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'completed',
    UNIQUE(user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_migration_status_user_id ON migration_status(user_id);
CREATE INDEX IF NOT EXISTS idx_migration_status_app ON migration_status(app_id);
