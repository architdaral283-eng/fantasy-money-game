-- Migration 0003: Row Level Security — §10.
-- Closed registration (4 seeded seats), magic-link auth, COMMISSIONER vs PLAYER.
-- Players read everything; only the Commissioner writes via the approval path.

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ties ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wld_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything (closed league; no public signup).
DO $$ BEGIN
  CREATE POLICY read_all ON players FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
