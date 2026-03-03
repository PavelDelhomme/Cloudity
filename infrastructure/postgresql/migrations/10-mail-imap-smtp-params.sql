-- Paramètres IMAP/SMTP optionnels par compte (override des valeurs par défaut déduites de l'email).
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS imap_host VARCHAR(256) DEFAULT NULL;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT NULL;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(256) DEFAULT NULL;
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT NULL;
