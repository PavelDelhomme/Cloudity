-- Critère + action d'étiquettes pour règles mail.
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS has_tag_id INTEGER NULL REFERENCES mail_tags(id) ON DELETE SET NULL;
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS add_tag_id INTEGER NULL REFERENCES mail_tags(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_has_tag_id ON mail_filter_rules(has_tag_id);
CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_add_tag_id ON mail_filter_rules(add_tag_id);
