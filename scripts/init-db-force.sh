# Script pour forcer l'exécution des scripts SQL
# À exécuter manuellement si les scripts d'init ne marchent pas

#!/bin/bash

echo "🔧 Forçage de l'initialisation de la base de données"

# Attendre PostgreSQL
echo "Attente PostgreSQL..."
sleep 5

# Exécuter chaque script SQL dans l'ordre
echo "📝 Exécution des scripts SQL..."

# 1. Extensions et database (déjà fait normalement)
docker compose exec postgres psql -U cloudity_admin -d cloudity -c "
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";
"

# 2. Tables tenants et users
echo "2️⃣ Création tables tenants et users..."
docker compose exec postgres psql -U cloudity_admin -d cloudity <<'EOF'
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
    language VARCHAR(10) DEFAULT 'fr',
    timezone VARCHAR(50) DEFAULT 'Europe/Paris',
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    last_login TIMESTAMPTZ,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

-- Tenant admin par défaut
INSERT INTO tenants (id, name, subdomain, status, max_users, max_storage_gb, created_at)
VALUES 
    ('550e8400-e29b-41d4-a716-446655440000', 'Admin Tenant', 'admin', 'active', 1000, 10000, NOW())
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    subdomain = EXCLUDED.subdomain,
    status = EXCLUDED.status;

-- Utilisateur admin paul@delhomme.ovh
INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, created_at)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'paul@delhomme.ovh',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqyT4/OEo48wGCcFCCfr2JW', -- Pavel180400&Ovh@Delhomme
    'Paul',
    'Delhomme',
    'admin',
    true,
    NOW()
) ON CONFLICT (tenant_id, email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();
EOF

# 3. RLS (optionnel pour l'instant)
echo "3️⃣ Configuration RLS..."
docker compose exec postgres psql -U cloudity_admin -d cloudity <<'EOF'
-- Fonction pour définir le tenant courant
CREATE OR REPLACE FUNCTION set_current_tenant(tenant_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('cloudity.tenant', tenant_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;

-- RLS sur tenants (optionnel)
-- ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation_tenants ON tenants
-- FOR ALL USING (id::TEXT = current_setting('cloudity.tenant', true));

-- RLS sur users (optionnel) 
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation_users ON users
-- FOR ALL USING (tenant_id::TEXT = current_setting('cloudity.tenant', true));

-- Triggers updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users  
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOF

# 4. Vérification
echo "4️⃣ Vérification des tables créées..."
docker compose exec postgres psql -U cloudity_admin -d cloudity -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
"

echo "5️⃣ Vérification utilisateur admin..."
docker compose exec postgres psql -U cloudity_admin -d cloudity -c "
SELECT u.email, u.first_name, u.last_name, u.role, t.name as tenant_name
FROM users u
JOIN tenants t ON u.tenant_id = t.id
WHERE u.email = 'paul@delhomme.ovh';
"

echo "✅ Initialisation base de données terminée !"
echo ""
echo "🔑 Credentials admin :"
echo "Email: paul@delhomme.ovh" 
echo "Password: Pavel180400&Ovh@Delhomme"
echo "Tenant: admin"