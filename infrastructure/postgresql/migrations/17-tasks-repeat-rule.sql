-- Répétition des tâches (quotidien, hebdo, etc.) — optionnel, NULL = pas de répétition

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_rule VARCHAR(32) NULL;
