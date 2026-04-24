-- Dossiers IMAP créés par l’utilisateur (rename/delete autorisés) + métadonnées UI

ALTER TABLE mail_imap_folders ADD COLUMN IF NOT EXISTS user_created BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mail_imap_folders ADD COLUMN IF NOT EXISTS ui_color VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE mail_imap_folders ADD COLUMN IF NOT EXISTS ui_icon VARCHAR(64) NOT NULL DEFAULT '';

COMMENT ON COLUMN mail_imap_folders.user_created IS 'true si dossier créé via Cloudity (LIST seul → false) : rename/delete côté UI';
COMMENT ON COLUMN mail_imap_folders.ui_color IS 'Couleur affichage UI (ex. #hex), optionnel';
COMMENT ON COLUMN mail_imap_folders.ui_icon IS 'Identifiant ou emoji icône UI, optionnel';
