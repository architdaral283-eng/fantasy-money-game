// Team ID mapping — §5.3. Populated by scripts/map-team-ids.ts (interactive,
// human-confirmed). String matching on club names at runtime is FORBIDDEN.
// `0` = not yet confirmed — the poller must refuse to run until all are confirmed.
export const TEAM_ID_MAP: Record<string, { 'football-data': number; 'api-football': number }> = {
  arsenal: { 'football-data': 57, 'api-football': 42 },
  'man-city': { 'football-data': 65, 'api-football': 50 },
  'man-utd': { 'football-data': 66, 'api-football': 33 },
  'aston-villa': { 'football-data': 58, 'api-football': 66 },
  'real-madrid': { 'football-data': 86, 'api-football': 541 },
  barcelona: { 'football-data': 81, 'api-football': 529 },
  atletico: { 'football-data': 78, 'api-football': 530 },
  'real-betis': { 'football-data': 90, 'api-football': 543 },
  bayern: { 'football-data': 5, 'api-football': 157 },
  leverkusen: { 'football-data': 3, 'api-football': 168 },
  dortmund: { 'football-data': 4, 'api-football': 165 },
  'rb-leipzig': { 'football-data': 721, 'api-football': 173 },
  inter: { 'football-data': 108, 'api-football': 505 },
  napoli: { 'football-data': 113, 'api-football': 492 },
  roma: { 'football-data': 100, 'api-football': 497 },
  juventus: { 'football-data': 109, 'api-football': 496 },
};

export function mappingConfirmed(): boolean {
  return Object.values(TEAM_ID_MAP).every((m) => m['football-data'] > 0 && m['api-football'] > 0);
}
