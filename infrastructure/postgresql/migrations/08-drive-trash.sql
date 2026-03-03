-- Corbeille Drive : soft delete (deleted_at) au lieu de suppression définitive.
ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Unicité : seulement parmi les nœuds non supprimés.
DROP INDEX IF EXISTS idx_drive_nodes_unique_child;
CREATE UNIQUE INDEX idx_drive_nodes_unique_child ON drive_nodes(user_id, parent_id, name) WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
DROP INDEX IF EXISTS idx_drive_nodes_unique_root;
CREATE UNIQUE INDEX idx_drive_nodes_unique_root ON drive_nodes(user_id, name) WHERE parent_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_deleted_at ON drive_nodes(user_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_nodes_trash ON drive_nodes(user_id) WHERE deleted_at IS NOT NULL;
