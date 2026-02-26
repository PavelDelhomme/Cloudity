-- Schema Pass (Password Manager) : vaults et items chiffrés côté client
-- Le serveur ne stocke que des blobs (ciphertext). Isolation par user_id + tenant_id.

CREATE TABLE IF NOT EXISTS pass_vaults (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Default',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pass_items (
    id SERIAL PRIMARY KEY,
    vault_id INTEGER NOT NULL REFERENCES pass_vaults(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pass_vaults_user_tenant ON pass_vaults(user_id, tenant_id);
CREATE INDEX idx_pass_items_vault_id ON pass_items(vault_id);

ALTER TABLE pass_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_items ENABLE ROW LEVEL SECURITY;

-- RLS : un utilisateur ne voit que ses vaults (via app.current_user_id défini par le service)
CREATE POLICY pass_vaults_user_isolation ON pass_vaults
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

CREATE POLICY pass_items_vault_owner ON pass_items
    FOR ALL USING (
        vault_id IN (
            SELECT id FROM pass_vaults
            WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
        )
    );

CREATE TRIGGER update_pass_vaults_updated_at BEFORE UPDATE ON pass_vaults
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pass_items_updated_at BEFORE UPDATE ON pass_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON pass_vaults TO cloudity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON pass_items TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE pass_vaults_id_seq TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE pass_items_id_seq TO cloudity_app;

-- Fonction pour fixer le user_id courant (appelée par le service pass à chaque requête)
CREATE OR REPLACE FUNCTION set_current_user_id(uid INTEGER)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', uid::TEXT, false);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION set_current_user_id(INTEGER) TO cloudity_app;
