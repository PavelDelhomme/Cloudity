-- Critère destinataire (to_addrs) pour les règles de tri mail.
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS recipient_pattern TEXT NOT NULL DEFAULT '';
