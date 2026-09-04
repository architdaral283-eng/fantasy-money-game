-- Migration 0015: roast_templates has 4x duplicates (seed re-run, no guard).
-- Keep the earliest copy of each body+club pairing, then guard both halves.
DELETE FROM roast_templates a
USING roast_templates b
WHERE a.id > b.id
  AND a.body = b.body
  AND COALESCE(a.club_id, '') = COALESCE(b.club_id, '')
  AND COALESCE(a.derby_id, '') = COALESCE(b.derby_id, '');

CREATE UNIQUE INDEX IF NOT EXISTS roast_templates_club_once
  ON roast_templates (body, club_id) WHERE club_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roast_templates_meta_once
  ON roast_templates (body) WHERE club_id IS NULL;
