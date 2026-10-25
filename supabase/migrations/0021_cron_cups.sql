-- Migration 0021: give the cup pass its own pg_cron job.
--
-- The cups used to run inside /api/cron/poll. A full schedule sync there
-- already spends ~60s on football-data's 6.5s call spacing, so the combined
-- handler ran past its function timeout and the ENTIRE tick returned nothing:
-- no results, no reminders, no sync. Two NULL rows in net._http_response where
-- every other tick has a 200 are what gave it away.
--
-- Separate job, separate budget. Every 15 minutes is plenty: a cup tie is
-- found when it is drawn (days ahead) and its result is proposed, never
-- auto-written, so a few minutes either way changes nothing.
--
-- IDEMPOTENT: unschedule-if-exists, then schedule.

select cron.unschedule('poll-cups') where exists (
  select 1 from cron.job where jobname = 'poll-cups');

select cron.schedule('poll-cups', '*/15 * * * *', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/cups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
