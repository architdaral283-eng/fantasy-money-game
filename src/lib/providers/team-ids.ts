// Team ID mapping — §5.3. Populated by scripts/map-team-ids.ts (interactive,
// human-confirmed). String matching on club names at runtime is FORBIDDEN.
// `0` = not yet confirmed — the poller must refuse to run until all are confirmed.
// `espn` ids were read off ESPN's own team lists (site.api.espn.com …/{league}/teams)
// on 24 Oct 2026 and checked against a live scoreboard (Napoli 114, Roma 104).
export const TEAM_ID_MAP: Record<string, { 'football-data': number; 'api-football': number; espn: number }> = {
  arsenal: { 'football-data': 57, 'api-football': 42, espn: 359 },
  'man-city': { 'football-data': 65, 'api-football': 50, espn: 382 },
  'man-utd': { 'football-data': 66, 'api-football': 33, espn: 360 },
  'aston-villa': { 'football-data': 58, 'api-football': 66, espn: 362 },
  'real-madrid': { 'football-data': 86, 'api-football': 541, espn: 86 },
  barcelona: { 'football-data': 81, 'api-football': 529, espn: 83 },
  atletico: { 'football-data': 78, 'api-football': 530, espn: 1068 },
  'real-betis': { 'football-data': 90, 'api-football': 543, espn: 244 },
  bayern: { 'football-data': 5, 'api-football': 157, espn: 132 },
  leverkusen: { 'football-data': 3, 'api-football': 168, espn: 131 },
  dortmund: { 'football-data': 4, 'api-football': 165, espn: 124 },
  'rb-leipzig': { 'football-data': 721, 'api-football': 173, espn: 11420 },
  inter: { 'football-data': 108, 'api-football': 505, espn: 110 },
  napoli: { 'football-data': 113, 'api-football': 492, espn: 114 },
  roma: { 'football-data': 100, 'api-football': 497, espn: 104 },
  juventus: { 'football-data': 109, 'api-football': 496, espn: 111 },
};

export function mappingConfirmed(): boolean {
  return Object.values(TEAM_ID_MAP).every((m) => m['football-data'] > 0 && m['api-football'] > 0);
}
