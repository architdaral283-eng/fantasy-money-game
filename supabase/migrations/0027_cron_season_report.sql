-- Migration 0027: the end-of-season report.
--
-- 6 June 2027 is the day after the Champions League final at the Metropolitano
-- (Constitution §3: the season window closes 5 June 2027). Everything is
-- settled by then, including the trophies.
--
-- 19:00 IST = 13:30 UTC. pg_cron has no one-shot, so this is written as an
-- annual date: it fires on 6 June every year, which is correct for every
-- season this game runs.
--
-- It calls the same route as the monthly awards with ?period=season, because
-- nothing about a season award differs from a monthly one except the window
-- it reads over.
--
-- IDEMPOTENT: unschedule-if-exists, then schedule.

select cron.unschedule('season-report') where exists (
  select 1 from cron.job where jobname = 'season-report');

select cron.schedule('season-report', '30 13 6 6 *', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/awards?period=season',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
