-- Règles mail : structure JSON (critères/actions) + ordre explicite.
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS actions_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS rule_order INTEGER NOT NULL DEFAULT 1000;

CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_account_order ON mail_filter_rules(account_id, rule_order, id);
