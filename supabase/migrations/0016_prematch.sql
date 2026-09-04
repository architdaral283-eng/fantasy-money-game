-- Migration 0016: 30-minute pre-match group reminder flag (fires once per fixture).
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS pre_match_sent_at TIMESTAMPTZ;
