-- Migration 0016: 30-minute pre-match group reminder flag (fires once per fixture).
-- Re-runnable: adds the column only when missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixtures' AND column_name = 'pre_match_sent_at'
  ) THEN
    ALTER TABLE fixtures ADD COLUMN pre_match_sent_at TIMESTAMPTZ;
  END IF;
END $$;
