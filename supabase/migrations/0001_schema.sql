-- Migration 0001: Fantasy Football Money Game 2026/27
-- Postgres schema per Build Spec §8. Append-only ledger, zero-sum by construction.
-- Run with: psql $DATABASE_URL -f 0001_schema.sql

-- ── extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── players ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('COMMISSIONER','PLAYER')),
  email       TEXT,
  whatsapp_e164 TEXT,
  telegram_chat_id TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'telegram'
    CHECK (preferred_channel IN ('whatsapp','telegram')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── clubs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  league      TEXT NOT NULL CHECK (league IN ('Premier League','La Liga','Bundesliga','Serie A')),
  owner_id    TEXT NOT NULL REFERENCES players(id),
  draft_pick  INTEGER NOT NULL CHECK (draft_pick BETWEEN 1 AND 4),
  in_ucl      BOOLEAN NOT NULL DEFAULT false
);

-- ── club external ids (no runtime fuzzy matching, §5.3) ────
CREATE TABLE IF NOT EXISTS club_external_ids (
  club_id          TEXT NOT NULL REFERENCES clubs(id),
  provider         TEXT NOT NULL CHECK (provider IN ('football-data','api-football')),
  external_team_id INTEGER NOT NULL,
  confirmed_at     TIMESTAMPTZ,
  confirmed_by     TEXT REFERENCES players(id),
  PRIMARY KEY (club_id, provider)
);

-- ── competitions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitions (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL UNIQUE,
  code                   TEXT NOT NULL UNIQUE,
  in_scope               BOOLEAN NOT NULL DEFAULT true,
  trophy_winner_prize    INTEGER NOT NULL DEFAULT 0,
  trophy_each_other_pays INTEGER NOT NULL DEFAULT 0,
  fd_org_code            TEXT,
  api_football_league_id INTEGER
);

-- ── competition rounds (configurable leg counts, §5.6) ──────
CREATE TABLE IF NOT EXISTS competition_rounds (
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  round_name     TEXT NOT NULL,
  leg_count      INTEGER NOT NULL CHECK (leg_count IN (1,2)),
  ordinal        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (competition_id, round_name)
);

-- ── ties (two-legged knockouts) ─────────────────────────────
CREATE TABLE IF NOT EXISTS ties (
  id                TEXT PRIMARY KEY DEFAULT ('tie_' || encode(gen_random_bytes(6),'hex')),
  competition_id    TEXT NOT NULL REFERENCES competitions(id),
  round             TEXT NOT NULL,
  club_a_id         TEXT NOT NULL REFERENCES clubs(id),
  club_b_id         TEXT NOT NULL REFERENCES clubs(id),
  leg1_fixture_id   TEXT,
  leg2_fixture_id   TEXT,
  agg_a             INTEGER,
  agg_b             INTEGER,
  advancing_club_id TEXT REFERENCES clubs(id),
  decided_by        TEXT CHECK (decided_by IN ('AGGREGATE','PENALTIES') OR decided_by IS NULL),
  resolved_at       TIMESTAMPTZ,
  CHECK (club_a_id <> club_b_id),
  UNIQUE (competition_id, round, club_a_id, club_b_id)
);
-- unordered-pair uniqueness guard (A,B) vs (B,A): enforced in app + this index
CREATE UNIQUE INDEX IF NOT EXISTS ties_unordered_pair_uidx ON ties
  (competition_id, round, LEAST(club_a_id,club_b_id), GREATEST(club_a_id,club_b_id));

-- ── fixtures ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixtures (
  id                 TEXT PRIMARY KEY DEFAULT ('fx_' || encode(gen_random_bytes(6),'hex')),
  competition_id     TEXT NOT NULL REFERENCES competitions(id),
  round              TEXT NOT NULL DEFAULT 'League',
  home_club_id       TEXT NOT NULL REFERENCES clubs(id),
  away_club_id       TEXT NOT NULL REFERENCES clubs(id),
  kickoff_utc        TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED','PENDING_APPROVAL','RECORDED','NOT_POSSIBLE','IN_REVIEW')),
  tie_id             TEXT REFERENCES ties(id),
  leg_number         INTEGER CHECK (leg_number IN (1,2) OR leg_number IS NULL),
  payment_suppressed BOOLEAN NOT NULL DEFAULT false,
  is_same_owner      BOOLEAN NOT NULL DEFAULT false,
  CHECK (home_club_id <> away_club_id),
  UNIQUE (competition_id, round, home_club_id, away_club_id)
);

-- ── results ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS results (
  id              TEXT PRIMARY KEY DEFAULT ('res_' || encode(gen_random_bytes(6),'hex')),
  fixture_id      TEXT NOT NULL UNIQUE REFERENCES fixtures(id),
  h90             INTEGER NOT NULL,
  a90             INTEGER NOT NULL,
  h120            INTEGER,
  a120            INTEGER,
  hpens           INTEGER,
  apens           INTEGER,
  terminal_status TEXT NOT NULL CHECK (terminal_status IN ('FT','AET','PEN','POSTPONED','ABANDONED','AWARDED','CANCELLED')),
  provider        TEXT NOT NULL,
  single_source   BOOLEAN NOT NULL DEFAULT false,
  raw_payload     JSONB NOT NULL DEFAULT '{}',
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── trophies ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trophies (
  id               TEXT PRIMARY KEY DEFAULT ('tr_' || encode(gen_random_bytes(6),'hex')),
  competition_id   TEXT NOT NULL REFERENCES competitions(id),
  season           TEXT NOT NULL DEFAULT '2026/27',
  winning_club_id  TEXT REFERENCES clubs(id),
  winner_unowned   BOOLEAN NOT NULL DEFAULT false,
  recorded_at      TIMESTAMPTZ,
  approval_id      TEXT,
  status           TEXT NOT NULL DEFAULT 'Live' CHECK (status IN ('Live','Decided','Unowned'))
);

-- ── pending approvals ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_approvals (
  id                  TEXT PRIMARY KEY DEFAULT ('pa_' || encode(gen_random_bytes(6),'hex')),
  subject_type        TEXT NOT NULL CHECK (subject_type IN ('FIXTURE','TIE','TROPHY','MANUAL')),
  subject_id          TEXT NOT NULL,
  proposed_payload    JSONB NOT NULL DEFAULT '{}',
  computed_transfers  JSONB NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  single_source       BOOLEAN NOT NULL DEFAULT false,
  review_reason       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ,
  decided_by          TEXT REFERENCES players(id),
  provider_message_id TEXT,
  reminders_sent      INTEGER NOT NULL DEFAULT 0
);

-- ── ledger (append-only, zero-sum by construction) ──────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                BIGSERIAL PRIMARY KEY,
  entry_no          INTEGER,
  occurred_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  event_type        TEXT NOT NULL CHECK (event_type IN ('MATCH','TROPHY','CORRECTION')),
  description       TEXT NOT NULL,
  from_player_id    TEXT NOT NULL REFERENCES players(id),
  to_player_id      TEXT NOT NULL REFERENCES players(id),
  amount_inr        INTEGER NOT NULL CHECK (amount_inr > 0),
  fixture_id        TEXT REFERENCES fixtures(id),
  tie_id            TEXT REFERENCES ties(id),
  trophy_id         TEXT REFERENCES trophies(id),
  approval_id       TEXT REFERENCES pending_approvals(id),
  is_correction     BOOLEAN NOT NULL DEFAULT false,
  corrects_entry_id BIGINT REFERENCES ledger_entries(id),
  winner_balance_before INTEGER,
  loser_balance_before  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_player_id <> to_player_id),
  CHECK (amount_inr % 500 = 0)
);

-- append-only enforcement (§1.2)
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger_entries is append-only'; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_append_only ON ledger_entries;
CREATE TRIGGER ledger_append_only
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- idempotency: one fixture/tie/trophy pays exactly once (§1.5, §8)
CREATE UNIQUE INDEX IF NOT EXISTS ledger_fixture_once ON ledger_entries (fixture_id)
  WHERE fixture_id IS NOT NULL AND is_correction = false;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_tie_once ON ledger_entries (tie_id)
  WHERE tie_id IS NOT NULL AND is_correction = false;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_trophy_once ON ledger_entries (trophy_id, from_player_id)
  WHERE trophy_id IS NOT NULL AND is_correction = false;

-- ── W/L/D records ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wld_records (
  id          BIGSERIAL PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id),
  fixture_id  TEXT REFERENCES fixtures(id),
  tie_id      TEXT REFERENCES ties(id),
  outcome     TEXT NOT NULL CHECK (outcome IN ('W','L','D')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, fixture_id),
  UNIQUE (player_id, tie_id)
);

-- ── notifications log (§7.2 cost visibility) ────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                  BIGSERIAL PRIMARY KEY,
  player_id           TEXT REFERENCES players(id),
  channel             TEXT NOT NULL,
  template_key        TEXT NOT NULL,
  payload             JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'QUEUED',
  provider_message_id TEXT,
  error               TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── api call log (§5.2 quota) ───────────────────────────────
CREATE TABLE IF NOT EXISTS api_call_log (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  called_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  quota_remaining INTEGER
);

-- ── config (amendment flag, feature flags, §2 + §17) ────────
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES players(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── audit log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     TEXT REFERENCES players(id),
  action       TEXT NOT NULL,
  subject_type TEXT,
  subject_id   TEXT,
  before       JSONB,
  after        JSONB,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── balances VIEW (never a table, §8) ───────────────────────
CREATE OR REPLACE VIEW player_balances AS
SELECT p.id, p.name,
  COALESCE(SUM(CASE WHEN l.to_player_id = p.id THEN l.amount_inr ELSE 0 END),0)
  - COALESCE(SUM(CASE WHEN l.from_player_id = p.id THEN l.amount_inr ELSE 0 END),0)
  AS net_inr
FROM players p LEFT JOIN ledger_entries l
  ON p.id IN (l.to_player_id, l.from_player_id)
GROUP BY p.id, p.name;
