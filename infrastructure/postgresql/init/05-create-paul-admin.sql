# Script d'ajout de l'utilisateur admin paul@delhomme.ovh
# À placer dans infrastructure/postgresql/init/05-create-paul-admin.sql

-- Création de l'utilisateur admin paul@delhomme.ovh dans le tenant Admin Tenant existant
-- Le tenant "Admin Tenant" existe déjà via 02-create-tenants.sql

-- Supprime l'ancien utilisateur admin@cloudity.com s'il existe
DELETE FROM users WHERE email = 'admin@cloudity.com';

-- Crée le nouvel utilisateur admin paul@delhomme.ovh
INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active, created_at)
SELECT 
    t.id,
    'paul@delhomme.ovh',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqyT4/OEo48wGCcFCCfr2JW', -- Hash de "Pavel180400&Ovh@Delhomme"
    'Paul',
    'Delhomme',
    'admin',
    true,
    NOW()
FROM tenants t 
WHERE t.name = 'Admin Tenant'
ON CONFLICT (tenant_id, email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    is_active = true,
    updated_at = NOW();

-- Vérifier la création
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    t.name as tenant_name
FROM users u
JOIN tenants t ON u.tenant_id = t.id
WHERE u.email = 'paul@delhomme.ovh';

-- Log de confirmation
SELECT 'Utilisateur admin paul@delhomme.ovh créé avec succès!' as message;