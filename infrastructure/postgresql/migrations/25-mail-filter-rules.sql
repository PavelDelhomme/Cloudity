CREATE TABLE IF NOT EXISTS mail_filter_rules (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES user_email_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  from_pattern TEXT NOT NULL DEFAULT '',
  subject_pattern TEXT NOT NULL DEFAULT '',
  has_attachments BOOLEAN NULL,
  action_folder TEXT NOT NULL DEFAULT 'inbox',
  mark_read BOOLEAN NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_account ON mail_filter_rules(account_id);

