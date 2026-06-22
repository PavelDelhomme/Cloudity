-- Empreinte SHA-256 du contenu fichier (matching cross-appareil Photos).
ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS content_hash CHAR(64) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_user_content_hash
  ON drive_nodes(user_id, content_hash)
  WHERE content_hash IS NOT NULL AND is_folder = false AND deleted_at IS NULL;
