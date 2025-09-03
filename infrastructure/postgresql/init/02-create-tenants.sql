-- Table tenants : UUID PK, champs standard
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
    id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(255)     NOT NULL,
    subdomain         VARCHAR(63)      UNIQUE,
    domain            VARCHAR(255)     UNIQUE,
    max_storage_gb    INTEGER          DEFAULT 100,
    max_users         INTEGER          DEFAULT 10,
    features          JSONB            DEFAULT '["drive", "mail"]'::jsonb,
    settings          JSONB            DEFAULT '{}'::jsonb,
    subscription_tier VARCHAR(64)      DEFAULT 'starter',
    status            VARCHAR(64)      DEFAULT 'active',
    is_active         BOOLEAN          DEFAULT TRUE,
    config            JSONB            DEFAULT '{}',
    created_at        TIMESTAMPTZ      DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ      DEFAULT CURRENT_TIMESTAMP
);


-- Table users avec UUID comme PK (compatible avec email system)
CREATE TABLE IF NOT EXISTS users (
    id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email             VARCHAR(255)     NOT NULL,
    password_hash     VARCHAR(255)     NOT NULL,
    first_name        VARCHAR(255),
    last_name         VARCHAR(255),
    role              VARCHAR(64)      DEFAULT 'user',
    permissions       JSONB            DEFAULT '[]'::jsonb,
    is_active         BOOLEAN          DEFAULT true,
    email_verified    BOOLEAN          DEFAULT false,
    last_login        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ,     DEFAULT NOW(),
    updated_at        TIMESTAMPTZ,     DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

-- Index pour perfromance
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Tenants obligatoires (admin + test)
INSERT INTO tenants (name, subdomain, max_storage_gb, max_users, features) VALUES
    ('Admin Tenant', 'admin', 10000, 1000, '["all"]'::jsonb),
    ('Demo Tenant', 'demo', 100, 5, '["drive", "mail"]'::jsonb),
    ('Test Tenant', 'test', 50, 3, '["chat"]'::jsonb)
    ON CONFLICT (name) DO NOTHING;

-- Utilisateur admin par défaut
INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
SELECT t.id, 'admin@cloudity.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeRyDvYh7oMWJJ9jK', 'Admin', 'User', 'admin'
FROM tenants t WHERE t.name = 'Admin Tenant'
ON CONFLICT (tenant_id, email) DO NOTHING;
