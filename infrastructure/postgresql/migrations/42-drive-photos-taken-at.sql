-- Date de prise de vue Photos.
-- `created_at` reste la date d'import Drive ; `taken_at` sert à trier/regrouper la timeline Photos.
ALTER TABLE drive_nodes ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_drive_nodes_photos_taken_at
  ON drive_nodes(user_id, taken_at DESC NULLS LAST, created_at DESC)
  WHERE deleted_at IS NULL AND is_folder = false;

WITH detected AS (
  SELECT
    id,
    regexp_match(
      name,
      '(?i)(?:IMG|VID|PXL|Screenshot)?[_ -]*([12][0-9]{3})[-_]?([01][0-9])[-_]?([0-3][0-9])[_ -]?([0-2][0-9])([0-5][0-9])([0-5][0-9])'
    ) AS m
  FROM drive_nodes
  WHERE taken_at IS NULL
    AND is_folder = false
    AND (
      LOWER(COALESCE(mime_type, '')) LIKE 'image/%'
      OR LOWER(name) ~ '\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tiff|tif)$'
    )
)
UPDATE drive_nodes d
SET taken_at = make_timestamptz(
  detected.m[1]::int,
  detected.m[2]::int,
  detected.m[3]::int,
  detected.m[4]::int,
  detected.m[5]::int,
  detected.m[6]::double precision,
  'UTC'
)
FROM detected
WHERE d.id = detected.id
  AND detected.m IS NOT NULL;
