-- Migration 0013: Amendment III — machine-verified auto-write.
-- API-detected results (five provider-covered competitions, terminal status,
-- past kickoff+100min) write automatically. Human-reported results (/report,
-- one-offs) and anything disputed still require Archit's explicit tap.
INSERT INTO config (key, value) VALUES
  ('amendment_3_auto_write', '{"status":"ratified","text":"Machine-verified results write automatically. Human reports and disputes need approval. Zero-sum and idempotency unchanged."}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
