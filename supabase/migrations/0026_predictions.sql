-- Migration 0026: the prediction league.
--
-- The structural problem this fixes: in any given fixture only two of the
-- four have money on it, so the other two have no reason to care. A poll with
-- every 24h reminder gives all four something at stake in every match, at the
-- cost of one tap. No money — a separate leaderboard and, in May, its own
-- trophy.
--
-- Every rejected idea in the ideation session needed someone to keep doing
-- something. Voting is one tap on a message that was going to be sent anyway.
--
-- REQUIRES: the webhook must list poll_answer in allowed_updates, or Telegram
-- never delivers a vote. setWebhook, not SQL — see the deploy runbook.

CREATE TABLE IF NOT EXISTS prediction_polls (
  fixture_id   TEXT PRIMARY KEY REFERENCES fixtures(id),
  poll_id      TEXT NOT NULL UNIQUE,
  chat_id      TEXT NOT NULL,
  message_id   BIGINT NOT NULL,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);

-- One row per player per poll. The primary key is what stops a second vote
-- becoming a second row; a changed vote overwrites, a retracted vote deletes.
CREATE TABLE IF NOT EXISTS predictions (
  poll_id     TEXT NOT NULL REFERENCES prediction_polls(poll_id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES players(id),
  choice      SMALLINT NOT NULL CHECK (choice BETWEEN 0 AND 2),  -- 0 home, 1 draw, 2 away
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, player_id)
);

-- Settled predictions. Separate from `predictions` on purpose: that table is
-- live and mutable until kickoff, this one is the record and never changes.
CREATE TABLE IF NOT EXISTS prediction_scores (
  fixture_id TEXT NOT NULL REFERENCES fixtures(id),
  player_id  TEXT NOT NULL REFERENCES players(id),
  choice     SMALLINT NOT NULL,
  correct    BOOLEAN NOT NULL,
  points     SMALLINT NOT NULL DEFAULT 0,
  scored_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_prediction_scores_player ON prediction_scores (player_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_poll ON predictions (poll_id);

-- RLS on with no policy: the service role bypasses it, everything else is
-- denied. Nothing public reads predictions yet, and a table left open by
-- default is how a public repo becomes a public database.
ALTER TABLE prediction_polls  ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_scores ENABLE ROW LEVEL SECURITY;
