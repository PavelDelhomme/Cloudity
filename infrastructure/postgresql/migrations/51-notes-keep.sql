-- APP-06 : Notes type Google Keep — épinglage + libellés

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (user_id, pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_notes_labels ON notes USING GIN (labels);

COMMENT ON COLUMN notes.pinned IS 'Note épinglée (Keep) — affichée en premier.';
COMMENT ON COLUMN notes.labels IS 'Libellés / tags Keep (texte libre).';
