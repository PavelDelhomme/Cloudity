-- APP-06 Keep+ : archive, rappel, extras (checklist / images / dessin)

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes (user_id, archived);
CREATE INDEX IF NOT EXISTS idx_notes_remind_at ON notes (user_id, remind_at) WHERE remind_at IS NOT NULL;

COMMENT ON COLUMN notes.archived IS 'Note archivée (Keep) — hors grille principale.';
COMMENT ON COLUMN notes.remind_at IS 'Rappel optionnel (notification / badge UI).';
COMMENT ON COLUMN notes.extras IS 'JSON Keep+ : checklist[], images[{id,dataUrl}], drawing (dataUrl).';
