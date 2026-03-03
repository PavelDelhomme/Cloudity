-- Mot de passe IMAP/SMTP stocké chiffré (optionnel) pour ne pas redemander à chaque sync.
-- Clé de chiffrement : MAIL_PASSWORD_ENCRYPTION_KEY (32 bytes hex) côté backend.
ALTER TABLE user_email_accounts ADD COLUMN IF NOT EXISTS password_encrypted TEXT DEFAULT NULL;
