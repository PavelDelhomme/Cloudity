-- RFC6154 SPECIAL-USE + heuristique libellé : lier chemins IMAP réels aux rôles trash/sent/…
-- pour que la sync écrive folder=trash (etc.) et que la liste « Corbeille » web trouve les messages.

ALTER TABLE mail_imap_folders
    ADD COLUMN IF NOT EXISTS imap_special_use VARCHAR(32) NOT NULL DEFAULT '';

COMMENT ON COLUMN mail_imap_folders.imap_special_use IS 'trash|sent|drafts|spam|archive si détecté (LIST \\Trash, etc. ou heuristique libellé FR/EN)';

CREATE INDEX IF NOT EXISTS idx_mail_imap_folders_account_special
    ON mail_imap_folders (account_id, imap_special_use)
    WHERE imap_special_use <> '';
