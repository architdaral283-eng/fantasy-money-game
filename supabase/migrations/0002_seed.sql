-- Migration 0002: seed — players, competitions, clubs, rounds, 48 league fixtures, 21 UCL ties.
-- Squads LOCKED 20 August 2026. Ownership immutable except Commissioner correction.

INSERT INTO players (id, name, role) VALUES
  ('archit','Archit','COMMISSIONER'),
  ('vedant','Vedant','PLAYER'),
  ('harshal','Harshal','PLAYER'),
  ('anmol','Anmol','PLAYER')
ON CONFLICT (id) DO NOTHING;

INSERT INTO competitions (id, name, code, in_scope, trophy_winner_prize, trophy_each_other_pays, fd_org_code, api_football_league_id) VALUES
  ('epl','Premier League','EPL',true,3000,1000,'PL',39),
  ('laliga','La Liga','LA_LIGA',true,3000,1000,'PD',140),
  ('bundesliga','Bundesliga','BUNDESLIGA',true,3000,1000,'BL1',78),
  ('seriea','Serie A','SERIE_A',true,3000,1000,'SA',135),
  ('ucl','UEFA Champions League','UCL',true,6000,2000,'CL',2),
  ('facup','FA Cup','FA_CUP',true,1500,500,NULL,45),
  ('copadelrey','Copa del Rey','COPA_DEL_REY',true,1500,500,NULL,143),
  ('coppa','Coppa Italia','COPPA_ITALIA',true,1500,500,NULL,137),
  ('dfbpokal','DFB-Pokal','DFB_POKAL',true,1500,500,NULL,81)
ON CONFLICT (id) DO NOTHING;

INSERT INTO clubs (id, name, league, owner_id, draft_pick, in_ucl) VALUES
  ('arsenal','Arsenal','Premier League','archit',1,true),
  ('man-city','Manchester City','Premier League','harshal',2,true),
  ('man-utd','Manchester United','Premier League','vedant',3,true),
  ('aston-villa','Aston Villa','Premier League','anmol',4,true),
  ('real-madrid','Real Madrid','La Liga','vedant',1,true),
  ('barcelona','Barcelona','La Liga','anmol',2,true),
  ('atletico','Atletico Madrid','La Liga','archit',3,true),
  ('real-betis','Real Betis','La Liga','harshal',4,true),
  ('bayern','Bayern Munich','Bundesliga','harshal',1,true),
  ('leverkusen','Bayer Leverkusen','Bundesliga','archit',2,false),
  ('dortmund','Borussia Dortmund','Bundesliga','anmol',3,true),
  ('rb-leipzig','RB Leipzig','Bundesliga','vedant',4,true),
  ('inter','Inter','Serie A','anmol',1,true),
  ('napoli','Napoli','Serie A','vedant',2,true),
  ('roma','AS Roma','Serie A','harshal',3,true),
  ('juventus','Juventus','Serie A','archit',4,false)
ON CONFLICT (id) DO NOTHING;

-- round configs (§5.6, configurable not hardcoded)
INSERT INTO competition_rounds (competition_id, round_name, leg_count, ordinal) VALUES
  ('ucl','League Phase',1,1),('ucl','Knockout Play-off',2,2),('ucl','Round of 16',2,3),
  ('ucl','Quarter-final',2,4),('ucl','Semi-final',2,5),('ucl','Final',1,6),
  ('copadelrey','Semi-final',2,5),
  ('facup','*',1,0),('dfbpokal','*',1,0),('coppa','*',1,0)
ON CONFLICT DO NOTHING;

-- 48 league fixtures: every ordered pair of owned clubs per league.
-- EPL
INSERT INTO fixtures (competition_id, round, home_club_id, away_club_id, status) VALUES
  ('epl','League','arsenal','man-city','SCHEDULED'),('epl','League','man-city','arsenal','SCHEDULED'),
  ('epl','League','arsenal','man-utd','SCHEDULED'),('epl','League','man-utd','arsenal','SCHEDULED'),
  ('epl','League','arsenal','aston-villa','SCHEDULED'),('epl','League','aston-villa','arsenal','SCHEDULED'),
  ('epl','League','man-city','man-utd','SCHEDULED'),('epl','League','man-utd','man-city','SCHEDULED'),
  ('epl','League','man-city','aston-villa','SCHEDULED'),('epl','League','aston-villa','man-city','SCHEDULED'),
  ('epl','League','man-utd','aston-villa','SCHEDULED'),('epl','League','aston-villa','man-utd','SCHEDULED')
ON CONFLICT DO NOTHING;
-- La Liga
INSERT INTO fixtures (competition_id, round, home_club_id, away_club_id, status) VALUES
  ('laliga','League','real-madrid','barcelona','SCHEDULED'),('laliga','League','barcelona','real-madrid','SCHEDULED'),
  ('laliga','League','real-madrid','atletico','SCHEDULED'),('laliga','League','atletico','real-madrid','SCHEDULED'),
  ('laliga','League','real-madrid','real-betis','SCHEDULED'),('laliga','League','real-betis','real-madrid','SCHEDULED'),
  ('laliga','League','barcelona','atletico','SCHEDULED'),('laliga','League','atletico','barcelona','SCHEDULED'),
  ('laliga','League','barcelona','real-betis','SCHEDULED'),('laliga','League','real-betis','barcelona','SCHEDULED'),
  ('laliga','League','atletico','real-betis','SCHEDULED'),('laliga','League','real-betis','atletico','SCHEDULED')
ON CONFLICT DO NOTHING;
-- Bundesliga
INSERT INTO fixtures (competition_id, round, home_club_id, away_club_id, status) VALUES
  ('bundesliga','League','bayern','leverkusen','SCHEDULED'),('bundesliga','League','leverkusen','bayern','SCHEDULED'),
  ('bundesliga','League','bayern','dortmund','SCHEDULED'),('bundesliga','League','dortmund','bayern','SCHEDULED'),
  ('bundesliga','League','bayern','rb-leipzig','SCHEDULED'),('bundesliga','League','rb-leipzig','bayern','SCHEDULED'),
  ('bundesliga','League','leverkusen','dortmund','SCHEDULED'),('bundesliga','League','dortmund','leverkusen','SCHEDULED'),
  ('bundesliga','League','leverkusen','rb-leipzig','SCHEDULED'),('bundesliga','League','rb-leipzig','leverkusen','SCHEDULED'),
  ('bundesliga','League','dortmund','rb-leipzig','SCHEDULED'),('bundesliga','League','rb-leipzig','dortmund','SCHEDULED')
ON CONFLICT DO NOTHING;
-- Serie A
INSERT INTO fixtures (competition_id, round, home_club_id, away_club_id, status) VALUES
  ('seriea','League','inter','napoli','SCHEDULED'),('seriea','League','napoli','inter','SCHEDULED'),
  ('seriea','League','inter','roma','SCHEDULED'),('seriea','League','roma','inter','SCHEDULED'),
  ('seriea','League','inter','juventus','SCHEDULED'),('seriea','League','juventus','inter','SCHEDULED'),
  ('seriea','League','napoli','roma','SCHEDULED'),('seriea','League','roma','napoli','SCHEDULED'),
  ('seriea','League','napoli','juventus','SCHEDULED'),('seriea','League','juventus','napoli','SCHEDULED'),
  ('seriea','League','roma','juventus','SCHEDULED'),('seriea','League','juventus','roma','SCHEDULED')
ON CONFLICT DO NOTHING;

-- 21 UCL league-phase ties, drawn 27 Aug 2026. 6 same-owner (₹0).
INSERT INTO fixtures (competition_id, round, home_club_id, away_club_id, status, is_same_owner) VALUES
  ('ucl','League Phase','arsenal','real-madrid','SCHEDULED',false),
  ('ucl','League Phase','bayern','arsenal','SCHEDULED',false),
  ('ucl','League Phase','arsenal','dortmund','SCHEDULED',false),
  ('ucl','League Phase','real-betis','arsenal','SCHEDULED',false),
  ('ucl','League Phase','napoli','arsenal','SCHEDULED',false),
  ('ucl','League Phase','atletico','bayern','SCHEDULED',false),
  ('ucl','League Phase','atletico','man-utd','SCHEDULED',false),
  ('ucl','League Phase','real-madrid','inter','SCHEDULED',false),
  ('ucl','League Phase','roma','real-madrid','SCHEDULED',false),
  ('ucl','League Phase','real-madrid','rb-leipzig','SCHEDULED',true),
  ('ucl','League Phase','barcelona','man-city','SCHEDULED',false),
  ('ucl','League Phase','man-city','napoli','SCHEDULED',false),
  ('ucl','League Phase','rb-leipzig','man-city','SCHEDULED',false),
  ('ucl','League Phase','bayern','real-betis','SCHEDULED',true),
  ('ucl','League Phase','man-utd','bayern','SCHEDULED',false),
  ('ucl','League Phase','dortmund','inter','SCHEDULED',true),
  ('ucl','League Phase','dortmund','real-betis','SCHEDULED',false),
  ('ucl','League Phase','aston-villa','dortmund','SCHEDULED',true),
  ('ucl','League Phase','barcelona','aston-villa','SCHEDULED',true),
  ('ucl','League Phase','man-utd','roma','SCHEDULED',false),
  ('ucl','League Phase','man-utd','rb-leipzig','SCHEDULED',true)
ON CONFLICT DO NOTHING;

-- 9 live trophies
INSERT INTO trophies (competition_id, season, status) VALUES
  ('epl','2026/27','Live'),('laliga','2026/27','Live'),('bundesliga','2026/27','Live'),
  ('seriea','2026/27','Live'),('ucl','2026/27','Live'),
  ('facup','2026/27','Live'),('copadelrey','2026/27','Live'),('coppa','2026/27','Live'),('dfbpokal','2026/27','Live')
ON CONFLICT DO NOTHING;

-- Amendment I pending ratification (§2): poller gated until accepted.
INSERT INTO config (key, value) VALUES
  ('amendment_1_assisted_mode', '{"status":"pending","text":"The Commissioner may proactively retrieve results from designated data providers. Retrieved results are proposals only and carry no force. No proposal enters the ledger without explicit approval from Archit."}'::jsonb),
  ('poller_enabled', 'false'::jsonb),
  ('public_standings', 'false'::jsonb),
  ('largest_upset_definition_provisional', '{"definition":"maximise (loser net at kickoff − winner net at kickoff) among counted fixtures where winner balance was lower","status":"provisional"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
