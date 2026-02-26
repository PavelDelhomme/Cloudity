-- Migration : schéma Drive (tables drive_nodes)
-- Appliquée automatiquement au démarrage si pas encore appliquée.

CREATE TABLE IF NOT EXISTS drive_nodes (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES drive_nodes(id) ON DELETE CASCADE,
    name VARCHAR(512) NOT NULL,
    is_folder BOOLEAN NOT NULL DEFAULT true,
    size BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(255) DEFAULT NULL,
    content BYTEA DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_nodes_unique_child ON drive_nodes(user_id, parent_id, name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_nodes_unique_root ON drive_nodes(user_id, name) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_nodes_user_parent ON drive_nodes(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_drive_nodes_tenant ON drive_nodes(tenant_id);

ALTER TABLE drive_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drive_nodes_user_isolation ON drive_nodes;
CREATE POLICY drive_nodes_user_isolation ON drive_nodes
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_drive_nodes_updated_at') THEN
    CREATE TRIGGER update_drive_nodes_updated_at BEFORE UPDATE ON drive_nodes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON drive_nodes TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE drive_nodes_id_seq TO cloudity_app;
