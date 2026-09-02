-- Répétition des événements agenda (même sémantique que tasks.repeat_rule)

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS repeat_rule VARCHAR(32) NULL;
