-- Photos web : archivage et verrouillage logique (hors corbeille Drive).
ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS photo_archived_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS photo_locked_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_photos_archived
  ON drive_nodes(user_id, photo_archived_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND photo_archived_at IS NOT NULL AND photo_locked_at IS NULL AND is_folder = false;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_photos_locked
  ON drive_nodes(user_id, photo_locked_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND photo_locked_at IS NOT NULL AND is_folder = false;
