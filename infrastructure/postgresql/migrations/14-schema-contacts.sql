-- Contacts : carnet d'adresses par utilisateur (type Google Contacts)
-- Liaison Mail (suggestions destinataires), Calendar, etc.

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL DEFAULT '',
    email VARCHAR(512) NOT NULL,
    phone VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(user_id, email);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_user_isolation ON contacts;
CREATE POLICY contacts_user_isolation ON contacts
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contacts_updated_at') THEN
    CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE contacts_id_seq TO cloudity_app;
