-- Migration 0025: Owner, Club and Flop of the Month, on the 1st.
--
-- 19:00 IST = 13:30 UTC. Outside quiet hours (04:30-16:30 IST) so it sends
-- rather than queueing, and in the evening rather than the morning because
-- nobody argues about last month at breakfast.
--
-- monthBounds() takes the month BEFORE the one it runs in, so firing on the
-- 1st reports the month that just finished.
--
-- IDEMPOTENT: unschedule-if-exists, then schedule.

select cron.unschedule('monthly-awards') where exists (
  select 1 from cron.job where jobname = 'monthly-awards');

select cron.schedule('monthly-awards', '30 13 1 * *', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/awards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
