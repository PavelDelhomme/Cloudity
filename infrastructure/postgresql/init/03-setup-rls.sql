-- Fonction pour définir le tenant courant
CREATE OR REPLACE FUNCTION set_current_tenant(tenant_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('cloudity.tenant', tenant_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;


-- RLS sur tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL USING (id::TEXT = current_setting('cloudity.tenant', true));

-- RLS sur users  
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
    FOR ALL USING (tenant_id::TEXT = current_setting('cloudity.tenant', true));

-- Fonction updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();