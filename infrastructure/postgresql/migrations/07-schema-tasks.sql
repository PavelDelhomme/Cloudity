-- Migration : schéma Tasks (tâches / to-do)
-- Appliquée automatiquement au démarrage si pas encore appliquée.

CREATE TABLE IF NOT EXISTS task_lists (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    due_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_lists_user ON task_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id);

ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_lists_user_isolation ON task_lists;
CREATE POLICY task_lists_user_isolation ON task_lists
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DROP POLICY IF EXISTS tasks_user_isolation ON tasks;
CREATE POLICY tasks_user_isolation ON tasks
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_task_lists_updated_at') THEN
    CREATE TRIGGER update_task_lists_updated_at BEFORE UPDATE ON task_lists
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tasks_updated_at') THEN
    CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON task_lists TO cloudity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE task_lists_id_seq TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE tasks_id_seq TO cloudity_app;
