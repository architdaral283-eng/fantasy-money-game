-- Migration 0007: record the §17 open decisions as answered by Archit.
UPDATE config SET value = '{"definition":"maximise (loser net at kickoff − winner net at kickoff) among counted fixtures where winner balance was lower","status":"ratified"}'::jsonb WHERE key = 'largest_upset_definition_provisional';
INSERT INTO config (key, value) VALUES
  ('public_standings', '{"enabled":true}'::jsonb),
  ('reverse_fixture_warning', '{"enabled":false}'::jsonb),
  ('round_formats_confirmed', '{"copa_del_rey_sf":2,"coppa_italia_sf":1,"status":"confirmed"}'::jsonb),
  ('backfill_scope', '{"from":"2026-08-21"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
