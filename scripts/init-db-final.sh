# SOLUTION FINALE - Script d'init direct via Makefile
# Exécution directe sans docker exec interactif

#!/bin/bash

echo "🔧 INIT BASE DE DONNÉES - VERSION CORRIGÉE"
echo "Attendre PostgreSQL prêt..."

# Attendre que PostgreSQL soit vraiment prêt
sleep 10

echo "📋 Vérification état initial..."
docker compose exec -T postgres psql -U cloudity_admin -d cloudity -c "SELECT version();" || {
    echo "❌ PostgreSQL pas accessible"
    exit 1
}

echo "🔍 Vérification tables existantes..."
docker compose exec -T postgres psql -U cloudity_admin -d cloudity -c "\dt" || echo "Aucune table trouvée"

echo "🚀 Exécution des scripts SQL..."

# 1. Extensions
echo "1️⃣ Extensions..."
docker compose exec -T postgres psql -U cloudity_admin -d cloudity << 'EOF'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOF

# 2. Tables tenants et users
echo "2️⃣ Tables principales..."
docker compose exec -T postgres psql -U cloudity_admin -d cloudity << 'EOF'
-- Table tenants
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(63) UNIQUE,
    domain VARCHAR(255) UNIQUE,
    max_storage_gb INTEGER DEFAULT 100,
    max_users INTEGER DEFAULT 10,
    features JSONB DEFAULT '["drive", "mail"]'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    subscription_tier VARCHAR(64) DEFAULT 'starter',
    status VARCHAR(64) DEFAULT 'active',
    is_active BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    role VARCHAR(64) DEFAULT 'user',
    permissions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
EOF

# 3. Tenants et utilisateur admin
echo "3️⃣ Tenant admin et utilisateur paul@delhomme.ovh..."
docker compose exec -T postgres psql -U cloudity_admin -d cloudity << 'EOF'
-- Tenant admin avec UUID FIXE pour éviter les problèmes
INSERT INTO tenants (id, name, subdomain, max_storage_gb, max_users, features) VALUES
    ('550e8400-e29b-41d4-a716-446655440000', 'Admin Tenant', 'admin', 10000, 1000, '["all"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    subdomain = EXCLUDED.subdomain;

-- Utilisateur paul@delhomme.ovh dans le tenant admin
INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'paul@delhomme.ovh',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqyT4/OEo48wGCcFCCfr2JW', -- Pavel180400&Ovh@Delhomme
    'Paul',
    'Delhomme', 
    'admin',
    true
) ON CONFLICT (tenant_id, email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    is_active = true;
EOF

# 4. RLS et triggers (optionnels pour debug)
echo "4️⃣ RLS et triggers..."
docker compose exec -T postgres psql -U cloudity_admin -d cloudity << 'EOF'
-- Fonction updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users  
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# 5. Vérifications finales
echo "5️⃣ Vérifications finales..."

echo "📊 Tables créées:"
docker compose exec -T postgres psql -U cloudity_admin -d cloudity -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
"

echo "👤 Utilisateurs admin:"
docker compose exec -T postgres psql -U cloudity_admin -d cloudity -c "
SELECT 
    u.email, 
    u.first_name, 
    u.last_name, 
    u.role, 
    u.is_active,
    t.name as tenant_name,
    t.subdomain,
    t.id as tenant_uuid
FROM users u
JOIN tenants t ON u.tenant_id = t.id
WHERE u.role = 'admin'
ORDER BY u.created_at DESC;
"

echo "✅ Initialisation base de données terminée !"
echo ""
echo "🔑 Credentials admin :"
echo "Email: paul@delhomme.ovh" 
echo "Password: Pavel180400&Ovh@Delhomme"
echo "Tenant ID (UUID): 550e8400-e29b-41d4-a716-446655440000"
echo "Tenant Name: admin"