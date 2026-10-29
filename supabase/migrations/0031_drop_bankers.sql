-- Migration 0031: remove banker picks.
--
-- Built as feature 39, removed before it ever ran. A banker is a second
-- mechanic stacked on a prediction league that has not yet seen a single
-- real poll, and it needed its own weekly DM, its own button, and a rule
-- about which week a pick belongs to. The league is better as one thing:
-- tap the poll in the group, keep the tally.
--
-- Guarded rather than a bare DROP. The table should be empty — offerBankers
-- only ever ran from the Sunday roundup, which has not fired — but if a pick
-- somehow exists then somebody used it and this needs a conversation, not a
-- migration. An empty, unreferenced table is clutter; a table with rows is
-- evidence.

DO $drop$
DECLARE
  picks int;
BEGIN
  IF to_regclass('public.prediction_bankers') IS NULL THEN
    RAISE NOTICE 'prediction_bankers already gone.';
    RETURN;
  END IF;

  SELECT count(*) INTO picks FROM prediction_bankers;
  IF picks > 0 THEN
    RAISE EXCEPTION 'prediction_bankers holds % rows. Somebody used it — not dropping.', picks;
  END IF;

  DROP TABLE prediction_bankers;
  RAISE NOTICE 'prediction_bankers dropped (was empty).';
END
$drop$;

-- The rest of the prediction league is untouched: polls, votes and the
-- settled scorecard all stay exactly as they are.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'prediction%'
ORDER BY table_name;
