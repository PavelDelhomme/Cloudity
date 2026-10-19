-- Priorité 1 à 5, même barème que Hubera Docs (1 = la plus importante).

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 3;

UPDATE tasks SET priority = 3 WHERE priority < 1 OR priority > 5;

COMMENT ON COLUMN tasks.priority IS '1 = la plus importante, 5 = la plus faible. Même barème que Hubera Docs.';
