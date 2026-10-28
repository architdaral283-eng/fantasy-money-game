-- Migration 0024: the Sunday roundup.
--
-- One message a week carrying the things that only make sense over a week:
-- the form table with running titles, the hottest rivalry, the moment of the
-- week, who keeps losing by one goal, who is exposed in the next seven days,
-- how many wins the chaser needs, and the season landmark if one just passed.
--
-- 21:00 IST Sunday = 15:30 UTC Sunday. Outside quiet hours (04:30-16:30 IST)
-- so it sends rather than queueing, and late enough that Sunday's own results
-- are already in the table it reports.
--
-- IDEMPOTENT: unschedule-if-exists, then schedule.

select cron.unschedule('weekly-roundup') where exists (
  select 1 from cron.job where jobname = 'weekly-roundup');

select cron.schedule('weekly-roundup', '30 15 * * 0', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
