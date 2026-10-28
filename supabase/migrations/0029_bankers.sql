-- Migration 0029: banker picks.
--
-- One nomination a week: double points if it comes off, minus one if it does
-- not. It gives the prediction league a decision in it rather than four
-- independent taps, and it is still one tap to make.
--
-- The week is the IST week starting Monday. Same definition in the DM that
-- offers it, the callback that records it and the settlement that scores it —
-- weekStartIST() in lib/predictions/score.ts is the only implementation.

CREATE TABLE IF NOT EXISTS prediction_bankers (
  week_start  DATE NOT NULL,
  player_id   TEXT NOT NULL REFERENCES players(id),
  fixture_id  TEXT NOT NULL REFERENCES fixtures(id),
  picked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, player_id)
);

CREATE INDEX IF NOT EXISTS idx_bankers_fixture ON prediction_bankers (fixture_id);

-- Service role only, like the rest of the prediction tables.
ALTER TABLE prediction_bankers ENABLE ROW LEVEL SECURITY;
