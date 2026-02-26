-- Schema Mail (Phase 2) : domaines, boîtes mail, alias
-- Référence : tenant_id pour isolation multi-tenant.

CREATE TABLE IF NOT EXISTS mail_domains (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, domain)
);

CREATE TABLE IF NOT EXISTS mail_mailboxes (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
    local_part VARCHAR(255) NOT NULL,
    password_hash VARCHAR(512) NOT NULL,
    quota_mb INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_id, local_part)
);

CREATE TABLE IF NOT EXISTS mail_aliases (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
    source_local VARCHAR(255) NOT NULL,
    destination VARCHAR(512) NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_id, source_local)
);

CREATE INDEX idx_mail_domains_tenant ON mail_domains(tenant_id);
CREATE INDEX idx_mail_mailboxes_domain ON mail_mailboxes(domain_id);
CREATE INDEX idx_mail_aliases_domain ON mail_aliases(domain_id);

ALTER TABLE mail_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY mail_domains_tenant_isolation ON mail_domains
    FOR ALL USING (tenant_id = current_setting('app.current_tenant', true)::INTEGER);

CREATE POLICY mail_mailboxes_via_domain ON mail_mailboxes
    FOR ALL USING (
        domain_id IN (SELECT id FROM mail_domains WHERE tenant_id = current_setting('app.current_tenant', true)::INTEGER)
    );

CREATE POLICY mail_aliases_via_domain ON mail_aliases
    FOR ALL USING (
        domain_id IN (SELECT id FROM mail_domains WHERE tenant_id = current_setting('app.current_tenant', true)::INTEGER)
    );

CREATE TRIGGER update_mail_domains_updated_at BEFORE UPDATE ON mail_domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mail_mailboxes_updated_at BEFORE UPDATE ON mail_mailboxes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mail_aliases_updated_at BEFORE UPDATE ON mail_aliases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON mail_domains TO cloudity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mail_mailboxes TO cloudity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mail_aliases TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_domains_id_seq TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_mailboxes_id_seq TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE mail_aliases_id_seq TO cloudity_app;
