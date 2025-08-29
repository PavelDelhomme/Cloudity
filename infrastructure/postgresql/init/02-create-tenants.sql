-- Table tenants : UUID PK, champs standard
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255)     NOT NULL,
    domain     VARCHAR(255)     UNIQUE,
    is_active  BOOLEAN          DEFAULT TRUE,
    config     JSONB            DEFAULT '{}',
    created_at TIMESTAMPTZ      DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ      DEFAULT CURRENT_TIMESTAMP
);

-- Indices utiles
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);

-- EXEMPLES DE TENANTS
INSERT INTO tenants (name, domain) VALUES
('Admin', 'admin.cloudity.local'),
('Demo',  'demo.cloudity.local')
ON CONFLICT DO NOTHING;
