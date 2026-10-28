-- Migration 0028: team news an hour before kickoff.
--
-- One flag so a fixture's lineup DM goes out once. It is set only after a DM
-- actually leaves, never on a tick that found nothing: ESPN publishes lineups
-- about an hour before kickoff and not a minute earlier, so an empty answer
-- is the normal case for the first few ticks of the window, and marking the
-- fixture done on one of those would silence it permanently.

ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS lineup_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fixtures_lineup_pending
  ON fixtures (kickoff_utc)
  WHERE status = 'SCHEDULED' AND lineup_sent_at IS NULL;
