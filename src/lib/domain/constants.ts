// Domain constants — seed truth for 2026/27. Locked 20 August 2026.
// Mirrors Constitution Article I + Record Book Table 1 + §4 of build spec.
// No I/O here; pure data.

export type PlayerId = 'archit' | 'vedant' | 'harshal' | 'anmol';

export interface PlayerSeed {
  id: PlayerId;
  name: string;
  role: 'COMMISSIONER' | 'PLAYER';
}

export const PLAYERS: PlayerSeed[] = [
  { id: 'archit', name: 'Archit', role: 'COMMISSIONER' },
  { id: 'vedant', name: 'Vedant', role: 'PLAYER' },
  { id: 'harshal', name: 'Harshal', role: 'PLAYER' },
  { id: 'anmol', name: 'Anmol', role: 'PLAYER' },
];

export interface ClubSeed {
  id: string;
  name: string;
  league: 'Premier League' | 'La Liga' | 'Bundesliga' | 'Serie A';
  owner: PlayerId;
  pick: 1 | 2 | 3 | 4;
  inUcl: boolean;
}

export const CLUBS: ClubSeed[] = [
  // Premier League
  { id: 'arsenal', name: 'Arsenal', league: 'Premier League', owner: 'archit', pick: 1, inUcl: true },
  { id: 'man-city', name: 'Manchester City', league: 'Premier League', owner: 'harshal', pick: 2, inUcl: true },
  { id: 'man-utd', name: 'Manchester United', league: 'Premier League', owner: 'vedant', pick: 3, inUcl: true },
  { id: 'aston-villa', name: 'Aston Villa', league: 'Premier League', owner: 'anmol', pick: 4, inUcl: true },
  // La Liga
  { id: 'real-madrid', name: 'Real Madrid', league: 'La Liga', owner: 'vedant', pick: 1, inUcl: true },
  { id: 'barcelona', name: 'Barcelona', league: 'La Liga', owner: 'anmol', pick: 2, inUcl: true },
  { id: 'atletico', name: 'Atletico Madrid', league: 'La Liga', owner: 'archit', pick: 3, inUcl: true },
  { id: 'real-betis', name: 'Real Betis', league: 'La Liga', owner: 'harshal', pick: 4, inUcl: true },
  // Bundesliga
  { id: 'bayern', name: 'Bayern Munich', league: 'Bundesliga', owner: 'harshal', pick: 1, inUcl: true },
  { id: 'leverkusen', name: 'Bayer Leverkusen', league: 'Bundesliga', owner: 'archit', pick: 2, inUcl: false },
  { id: 'dortmund', name: 'Borussia Dortmund', league: 'Bundesliga', owner: 'anmol', pick: 3, inUcl: true },
  { id: 'rb-leipzig', name: 'RB Leipzig', league: 'Bundesliga', owner: 'vedant', pick: 4, inUcl: true },
  // Serie A
  { id: 'inter', name: 'Inter', league: 'Serie A', owner: 'anmol', pick: 1, inUcl: true },
  { id: 'napoli', name: 'Napoli', league: 'Serie A', owner: 'vedant', pick: 2, inUcl: true },
  { id: 'roma', name: 'AS Roma', league: 'Serie A', owner: 'harshal', pick: 3, inUcl: true },
  { id: 'juventus', name: 'Juventus', league: 'Serie A', owner: 'archit', pick: 4, inUcl: false },
];

export interface CompetitionSeed {
  id: string;
  name: string;
  code: string;
  inScope: boolean;
  winnerPrize: number;
  eachOtherPays: number;
  fdOrgCode: string | null;
}

export const COMPETITIONS: CompetitionSeed[] = [
  { id: 'epl', name: 'Premier League', code: 'EPL', inScope: true, winnerPrize: 3000, eachOtherPays: 1000, fdOrgCode: 'PL' },
  { id: 'laliga', name: 'La Liga', code: 'LA_LIGA', inScope: true, winnerPrize: 3000, eachOtherPays: 1000, fdOrgCode: 'PD' },
  { id: 'bundesliga', name: 'Bundesliga', code: 'BUNDESLIGA', inScope: true, winnerPrize: 3000, eachOtherPays: 1000, fdOrgCode: 'BL1' },
  { id: 'seriea', name: 'Serie A', code: 'SERIE_A', inScope: true, winnerPrize: 3000, eachOtherPays: 1000, fdOrgCode: 'SA' },
  { id: 'ucl', name: 'UEFA Champions League', code: 'UCL', inScope: true, winnerPrize: 6000, eachOtherPays: 2000, fdOrgCode: 'CL' },
  { id: 'facup', name: 'FA Cup', code: 'FA_CUP', inScope: true, winnerPrize: 1500, eachOtherPays: 500, fdOrgCode: null },
  { id: 'copadelrey', name: 'Copa del Rey', code: 'COPA_DEL_REY', inScope: true, winnerPrize: 1500, eachOtherPays: 500, fdOrgCode: null },
  { id: 'coppa', name: 'Coppa Italia', code: 'COPPA_ITALIA', inScope: true, winnerPrize: 1500, eachOtherPays: 500, fdOrgCode: null },
  { id: 'dfbpokal', name: 'DFB-Pokal', code: 'DFB_POKAL', inScope: true, winnerPrize: 1500, eachOtherPays: 500, fdOrgCode: null },
  // explicitly excluded — hard-reject (§3.2)
  { id: 'uel', name: 'Europa League', code: 'UEL', inScope: false, winnerPrize: 0, eachOtherPays: 0, fdOrgCode: 'EL' },
  { id: 'uecl', name: 'Conference League', code: 'UECL', inScope: false, winnerPrize: 0, eachOtherPays: 0, fdOrgCode: 'ECL' },
];

export const OUT_OF_SCOPE_CODES = new Set(
  COMPETITIONS.filter((c) => !c.inScope).map((c) => c.code),
);

export const IN_SCOPE_CODES = new Set(
  COMPETITIONS.filter((c) => c.inScope).map((c) => c.code),
);

/** round -> leg count, configurable per §5.6 (defaults for 2026/27) */
export const ROUND_LEG_COUNTS: Record<string, Record<string, number>> = {
  UCL: {
    'League Phase': 1,
    'Knockout Play-off': 2,
    'Round of 16': 2,
    'Quarter-final': 2,
    'Semi-final': 2,
    Final: 1,
  },
  COPA_DEL_REY: { 'Semi-final': 2, '*': 1 },
  FA_CUP: { '*': 1 },
  DFB_POKAL: { '*': 1 },
  COPPA_ITALIA: { '*': 1 },
};

export function legCountFor(competitionCode: string, round: string): 1 | 2 {
  const table = ROUND_LEG_COUNTS[competitionCode];
  if (!table) return 1;
  if (table[round] === 2) return 2;
  if (table['*'] === 2) return 2;
  return 1;
}

/** The 21 drawn UCL league-phase ties (§4.4). Club ids reference CLUBS. */
export interface UclTieSeed {
  home: string;
  away: string;
}
export const UCL_LEAGUE_PHASE_TIES: UclTieSeed[] = [
  { home: 'arsenal', away: 'real-madrid' },
  { home: 'bayern', away: 'arsenal' },
  { home: 'arsenal', away: 'dortmund' },
  { home: 'real-betis', away: 'arsenal' },
  { home: 'napoli', away: 'arsenal' },
  { home: 'atletico', away: 'bayern' },
  { home: 'atletico', away: 'man-utd' },
  { home: 'real-madrid', away: 'inter' },
  { home: 'roma', away: 'real-madrid' },
  { home: 'real-madrid', away: 'rb-leipzig' },
  { home: 'barcelona', away: 'man-city' },
  { home: 'man-city', away: 'napoli' },
  { home: 'rb-leipzig', away: 'man-city' },
  { home: 'bayern', away: 'real-betis' },
  { home: 'man-utd', away: 'bayern' },
  { home: 'dortmund', away: 'inter' },
  { home: 'dortmund', away: 'real-betis' },
  { home: 'aston-villa', away: 'dortmund' },
  { home: 'barcelona', away: 'aston-villa' },
  { home: 'man-utd', away: 'roma' },
  { home: 'man-utd', away: 'rb-leipzig' },
];

export const SEASON = {
  open: '2026-08-21',
  uclLeaguePhaseStart: '2026-09-08',
  close: '2027-06-05',
} as const;

export const TROPHY_POOL_TOTAL = 24000;

export const clubById = new Map(CLUBS.map((c) => [c.id, c]));
export const clubByName = new Map(
  CLUBS.map((c) => [c.name.toLowerCase(), c]),
);

export function ownerOf(clubId: string): PlayerId {
  const c = clubById.get(clubId);
  if (!c) throw new Error(`Unknown club: ${clubId}`);
  return c.owner;
}
