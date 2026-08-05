-- APP-07 : tâches riches (sous-tâches, notes, start_at, étoile)

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_starred ON tasks(user_id, starred) WHERE starred = true;

COMMENT ON COLUMN tasks.parent_id IS 'Sous-tâche : id de la tâche parente (même user).';
COMMENT ON COLUMN tasks.notes IS 'Description / notes libres.';
COMMENT ON COLUMN tasks.start_at IS 'Date/heure de début (échéance = due_at).';
COMMENT ON COLUMN tasks.starred IS 'Priorité / étoile.';
