-- Street View panorama availability per obra.
-- Populated by web/scripts/backfill-panorama.mjs (probes Google SV Metadata API).
-- has_panorama: NULL = not yet checked, TRUE/FALSE = checked.
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS has_panorama        BOOLEAN,
  ADD COLUMN IF NOT EXISTS panorama_pano_id    TEXT,
  ADD COLUMN IF NOT EXISTS panorama_checked_at TIMESTAMPTZ;

-- Partial index — /vr only ever queries WHERE has_panorama = TRUE.
CREATE INDEX IF NOT EXISTS idx_obras_has_panorama
  ON obras (has_panorama) WHERE has_panorama;
