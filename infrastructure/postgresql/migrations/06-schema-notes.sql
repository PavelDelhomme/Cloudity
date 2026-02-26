-- Migration : schéma Notes (bloc-notes)
-- Appliquée automatiquement au démarrage si pas encore appliquée.

CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL DEFAULT '',
    content TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notes_user_isolation ON notes;
CREATE POLICY notes_user_isolation ON notes
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_notes_updated_at') THEN
    CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE notes_id_seq TO cloudity_app;
