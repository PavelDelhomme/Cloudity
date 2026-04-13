-- Couleur d’accent pour les cartes Notes (style Keep)

ALTER TABLE notes ADD COLUMN IF NOT EXISTS color VARCHAR(32) DEFAULT 'default';

COMMENT ON COLUMN notes.color IS 'Identifiant couleur UI : default, yellow, green, blue, pink, purple, orange, gray';
