-- Migration 0011: roast engine tables + derby directory + dossiers + blocked terms.
-- Templates seed comes in 0012 (large corpus, separate file).
CREATE TABLE IF NOT EXISTS derbies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  club_a_id TEXT NOT NULL REFERENCES clubs(id),
  club_b_id TEXT NOT NULL REFERENCES clubs(id),
  tier TEXT NOT NULL CHECK (tier IN ('TRUE_DERBY','GRUDGE'))
);

CREATE TABLE IF NOT EXISTS club_dossiers (
  club_id TEXT PRIMARY KEY REFERENCES clubs(id),
  marquee TEXT NOT NULL,
  manager TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roast_templates (
  id BIGSERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('LOSER','WINNER','BOTH','NEUTRAL')),
  scope TEXT NOT NULL CHECK (scope IN ('CLUB','PLAYER','MANAGER','DERBY','LEAGUE','MARGIN','META')),
  club_id TEXT NULL REFERENCES clubs(id),
  derby_id TEXT NULL REFERENCES derbies(id),
  conditions JSONB NOT NULL DEFAULT '{}',
  severity SMALLINT NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  weight SMALLINT NOT NULL DEFAULT 10,
  author_player_id TEXT NULL REFERENCES players(id),
  use_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  retired BOOL NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roast_events (
  id BIGSERIAL PRIMARY KEY,
  fixture_id TEXT REFERENCES fixtures(id),
  template_ids BIGINT[] NOT NULL DEFAULT '{}',
  rendered_text TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reroll_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocked_terms (
  term TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'boundary'
);

-- derby directory: 8 true derbies + 6 grudge fixtures
INSERT INTO derbies (id, name, club_a_id, club_b_id, tier) VALUES
  ('el-clasico','El Clásico','real-madrid','barcelona','TRUE_DERBY'),
  ('madrid-derby','Madrid Derby','real-madrid','atletico','TRUE_DERBY'),
  ('manchester-derby','Manchester Derby','man-city','man-utd','TRUE_DERBY'),
  ('klassiker','Der Klassiker','bayern','dortmund','TRUE_DERBY'),
  ('derby-d-italia','Derby d’Italia','inter','juventus','TRUE_DERBY'),
  ('derby-del-sole','Derby del Sole','napoli','roma','TRUE_DERBY'),
  ('bavaria-rhine','Bavaria–Rhine','bayern','leverkusen','TRUE_DERBY'),
  ('north-south','North–South','juventus','napoli','TRUE_DERBY'),
  ('arsenal-utd','Arsenal v Man United','arsenal','man-utd','GRUDGE'),
  ('madrid-bayern','Real Madrid v Bayern','real-madrid','bayern','GRUDGE'),
  ('barca-inter','Barcelona v Inter','barcelona','inter','GRUDGE'),
  ('atleti-betis','Atlético v Real Betis','atletico','real-betis','GRUDGE'),
  ('dortmund-leipzig','Dortmund v RB Leipzig','dortmund','rb-leipzig','GRUDGE'),
  ('arsenal-city','Arsenal v Man City','arsenal','man-city','GRUDGE')
ON CONFLICT (id) DO NOTHING;

-- dossiers: verify against reality; managers move. Review any time via SQL.
INSERT INTO club_dossiers (club_id, marquee, manager, reviewed_at) VALUES
  ('arsenal','Bukayo Saka','Mikel Arteta','2026-01-01'),
  ('man-city','Erling Haaland','Pep Guardiola','2026-01-01'),
  ('man-utd','Bruno Fernandes','Ruben Amorim','2026-01-01'),
  ('aston-villa','Ollie Watkins','Unai Emery','2026-01-01'),
  ('real-madrid','Kylian Mbappé','Xabi Alonso','2026-01-01'),
  ('barcelona','Lamine Yamal','Hansi Flick','2026-01-01'),
  ('atletico','Julián Álvarez','Diego Simeone','2026-01-01'),
  ('real-betis','Isco','Manuel Pellegrini','2026-01-01'),
  ('bayern','Harry Kane','Vincent Kompany','2026-01-01'),
  ('leverkusen','Florian Wirtz','Kasper Hjulmand','2026-01-01'),
  ('dortmund','Serhou Guirassy','Niko Kovač','2026-01-01'),
  ('rb-leipzig','Loïs Openda','Ole Werner','2026-01-01'),
  ('inter','Lautaro Martínez','Cristian Chivu','2026-01-01'),
  ('napoli','Scott McTominay','Antonio Conte','2026-01-01'),
  ('roma','Paulo Dybala','Gian Piero Gasperini','2026-01-01'),
  ('juventus','Kenan Yıldız','Igor Tudor','2026-01-01')
ON CONFLICT (club_id) DO NOTHING;

-- content boundaries: matched on insert, never displayed
INSERT INTO blocked_terms (term, reason) VALUES
  ('munich 1958','disaster'),('heysel','disaster'),('hillsborough','disaster'),
  ('superga','disaster'),('chapecoense','disaster'),('ibrox','disaster'),('bradford','disaster'),
  ('munich air disaster','disaster'),(' Hillsborough ','disaster')
ON CONFLICT (term) DO NOTHING;
