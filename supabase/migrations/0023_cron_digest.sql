-- Migration 0023: the 23:00 IST nightly brief.
--
-- The last counted fixture was 24 Oct and the next is 31 Oct. A week of
-- silence in a group whose entire point is arguing about football. This fills
-- it with headlines about the sixteen clubs these four own, plus whatever else
-- the sport did that day, and the next fixture with the money on it.
--
-- 23:00 IST = 17:30 UTC. Deliberately OUTSIDE quiet hours (04:30-16:30 IST),
-- so it sends immediately instead of queueing to the 16:30 digest. The route
-- still passes urgent:true so a busy day cannot push it past the group's
-- six-message ceiling.
--
-- IDEMPOTENT: unschedule-if-exists, then schedule.

select cron.unschedule('nightly-digest') where exists (
  select 1 from cron.job where jobname = 'nightly-digest');

select cron.schedule('nightly-digest', '30 17 * * *', $job$
  select net.http_post(
    url     := 'https://fantasy-money-game.vercel.app/api/cron/digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
