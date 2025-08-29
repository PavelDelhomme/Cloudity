-- Fonction de contexte tenant
CREATE OR REPLACE FUNCTION set_current_tenant(tenant_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('cloudity.tenant', tenant_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;

-- Politique RLS pour tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenants ON tenants
  FOR ALL USING (id::TEXT = current_setting('cloudity.tenant'));

-- RLS pour users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  FOR ALL USING (tenant_id::TEXT = current_setting('cloudity.tenant'));

-- RLS pour emails, folders, etc.
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_emails ON emails
  FOR ALL USING (tenant_id::TEXT = current_setting('cloudity.tenant'));

-- Idem sur folders et tout autre composant où il y a tenant_id
