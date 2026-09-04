-- Migration 0010: trophies were seed-inserted without uniqueness, so repeat runs
-- duplicated them (63 rows instead of 9). Keep one Live row per competition
-- and prevent it forever. Safe: no trophy has been decided yet.
DELETE FROM trophies a
USING trophies b
WHERE a.ctid > b.ctid
  AND a.competition_id = b.competition_id
  AND a.season = b.season;

ALTER TABLE trophies ADD CONSTRAINT trophies_one_per_competition UNIQUE (competition_id, season);
