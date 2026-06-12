-- Coffres apps : métadonnées serveur pour contenu chiffré côté client (E2EE PIN local).
-- Le serveur stocke des blobs opaques ; seul le client déchiffre avec la clé dérivée du PIN.

ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS vault_encrypted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS is_vault_folder BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_vault_folder
  ON drive_nodes(user_id, parent_id)
  WHERE deleted_at IS NULL AND is_vault_folder = true;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_vault_encrypted
  ON drive_nodes(user_id)
  WHERE deleted_at IS NULL AND vault_encrypted = true AND is_folder = false;

ALTER TABLE notes ADD COLUMN IF NOT EXISTS vault_encrypted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS vault_ciphertext TEXT DEFAULT NULL;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vault_encrypted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vault_ciphertext TEXT DEFAULT NULL;
