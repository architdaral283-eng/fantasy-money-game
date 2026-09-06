-- Migration 0017: hot-path indexes for the poller, queue drain and /status.
--
-- OPTIONAL AT CURRENT SCALE. Four players, a few hundred fixtures and a few
-- thousand notification / api_call_log rows per season: every one of these
-- tables fits in a handful of pages and Postgres will happily seq-scan them
-- for the life of the league. This file exists so the queries below stay
-- O(log n) if the log tables grow more than expected (api_call_log and
-- notifications are append-only and never pruned). Safe to run at any time;
-- re-runnable (IF NOT EXISTS); no data changes; no downtime (tables are tiny).
--
-- Column names verified against 0001_schema.sql, 0009_queue.sql, 0011_roast.sql.

-- drainQueue(): SELECT * FROM message_queue WHERE sent_at IS NULL AND not_before <= now() ORDER BY created_at LIMIT 50
CREATE INDEX IF NOT EXISTS message_queue_pending_idx
  ON message_queue (not_before, created_at)
  WHERE sent_at IS NULL;

-- groupSentToday(): COUNT(*) FROM notifications WHERE channel='telegram' AND template_key='group' AND status='SENT' AND sent_at >= now()-24h
CREATE INDEX IF NOT EXISTS notifications_group_sent_idx
  ON notifications (sent_at)
  WHERE channel = 'telegram' AND template_key = 'group' AND status = 'SENT';

-- /status: COUNT(*) WHERE called_at >= now()-24h, and ORDER BY called_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS api_call_log_called_at_idx
  ON api_call_log (called_at DESC);

-- /pending, /status, poll reminder loop: WHERE status='PENDING' [ORDER BY created_at]
CREATE INDEX IF NOT EXISTS pending_approvals_pending_idx
  ON pending_approvals (created_at)
  WHERE status = 'PENDING';

-- /roast reroll: WHERE fixture_id=$1 ORDER BY posted_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS roast_events_fixture_posted_idx
  ON roast_events (fixture_id, posted_at DESC);
