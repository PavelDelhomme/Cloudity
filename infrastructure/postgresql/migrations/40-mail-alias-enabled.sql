-- MAIL-ALIAS-01 : activer / désactiver un alias sans le supprimer

ALTER TABLE user_email_aliases
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_email_aliases.enabled IS
    'Si false : alias ignoré pour filtre delivered_to, liste latérale et envoi From.';
