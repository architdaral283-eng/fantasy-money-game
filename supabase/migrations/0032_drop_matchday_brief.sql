-- Migration 0032: retire the 09:00 IST matchday brief.
--
-- It repeated what the 24-hour fixture reminder had already said, per fixture,
-- and it never once arrived in the morning: it fired at 09:00 IST, inside quiet
-- hours (04:30-16:30), without `urgent`, so every run queued to 16:30. Fixing
-- the delivery time would only have made a redundant message punctual. The 24h
-- reminder and the 30-minute kickoff warning already cover the day ahead.
--
-- The GitHub Actions '30 3 * * *' tick is deliberately NOT removed: the poll
-- job rides it as a daily "is the poller reachable and not gated?" heartbeat.
-- See .github/workflows/poll.yml.

select cron.unschedule('matchday-brief') where exists (
  select 1 from cron.job where jobname = 'matchday-brief');

-- Proof, not hope: fail loudly if it survived.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'matchday-brief') then
    raise exception 'matchday-brief is still scheduled';
  end if;
end $$;

select jobname, schedule from cron.job order by jobname;
