-- Migration 0018: move the 5-minute poll off GitHub Actions onto pg_cron.
--
-- WHY. On 24 Oct 2026 Aston Villa 2-1 Manchester City was never recorded.
-- GitHub was firing the "*/5" schedule roughly 3 times a day, not 156 (it
-- deprioritises and silently drops scheduled runs on free public repos). The
-- single poll that landed inside the fixture's window ran 53 min after full
-- time, before football-data's free tier had marked it FT; by the next poll the
-- fixture had aged past the lookback and became invisible. GitHub also disables
-- scheduled workflows entirely after 60 days without a push.
--
-- pg_cron runs inside the database: no throttling, no 60-day rule. The
-- self-ping also keeps the project active, which defeats the Free-plan 7-day
-- inactivity pause. GitHub Actions stays enabled as a backup trigger and, more
-- importantly, as the thing that can still FAIL LOUDLY and alert — pg_net is
-- fire-and-forget and will not tell you when a call fails.
--
-- Runs every 5 minutes, all day. The poller already skips provider calls when
-- no fixture is near kickoff, so off-hours ticks are DB-only and nearly free.
-- Running 24/7 removes the "football happens between these hours" assumption,
-- which is part of what failed here.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─────────────────────────────────────────────────────────────────────────────
-- ONE MANUAL STEP. Run this line ONCE, by hand, with the real value pasted in.
-- It is deliberately not committed with a value: this file is in a PUBLIC repo.
-- The value must match CRON_SECRET in Vercel exactly.
--
--   select vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret',
--                              'Bearer token for /api/cron/poll and /brief');
--
-- To rotate later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'cron_secret'),
--     'NEW_VALUE');
-- ─────────────────────────────────────────────────────────────────────────────

select cron.unschedule('poll-matchdays') where exists (
  select 1 from cron.job where jobname = 'poll-matchdays');

select cron.schedule('poll-matchdays', '*/5 * * * *', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);

select cron.unschedule('matchday-brief') where exists (
  select 1 from cron.job where jobname = 'matchday-brief');

-- 03:30 UTC = 09:00 IST, matching the old GitHub schedule.
select cron.schedule('matchday-brief', '30 3 * * *', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);

-- Verify:
--   select jobid, jobname, schedule, active from cron.job;
--   select status, count(*) from net._http_response
--     where created > now() - interval '1 hour' group by status;
--   select * from cron.job_run_details order by start_time desc limit 10;
