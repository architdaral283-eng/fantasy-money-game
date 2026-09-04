-- Migration 0005: Amendment II — one-off super cups enter scope for match money only.
-- Community Shield + DFL-Supercup. No trophy rows, not in the ₹24,000 pool.
-- Gated: manual entry refuses one-off codes until amendment_2 is ratified.

INSERT INTO competitions (id, name, code, in_scope, trophy_winner_prize, trophy_each_other_pays, fd_org_code, api_football_league_id) VALUES
  ('communityshield','Community Shield','COMMUNITY_SHIELD',true,0,0,NULL,NULL),
  ('dflsupercup','DFL-Supercup','DFL_SUPERCUP',true,0,0,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO config (key, value) VALUES
  ('amendment_2_oneoffs', '{"status":"pending","text":"One-off domestic super cups (Community Shield, DFL-Supercup) enter scope for match money only (500/1000, single-leg, ET and penalties as per Article V). They carry no trophy and are not part of the 24,000 pool. Recorded only after all four members agree."}'::jsonb)
ON CONFLICT (key) DO NOTHING;
