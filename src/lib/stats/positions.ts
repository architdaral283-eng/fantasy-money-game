// Where the sixteen clubs actually sit, league by league.
//
// Pure: one ESPN standings board per competition in, the rows we own out,
// best rank first. espnStandings() has already thrown away every club
// nobody owns, so a "board" here is at most four rows — fourteen for the
// Champions League league phase.
//
// rank can come back as 0 when ESPN has not computed one yet (a league that
// has not kicked off, a table mid-rebuild). That is not a reason to lose the
// points, so a 0 rank survives and prints as a dash.

import type { ClubStanding } from '@/lib/providers/espn-standings';

export interface PositionRow {
  clubId: string;
  rank: number;
  points: number;
  played: number;
}

export interface PositionSection {
  compId: string;
  label: string;
  rows: PositionRow[];
}

/** The five boards the monthly message prints, in the order it prints them. */
export const POSITION_COMPS: [string, string][] = [
  ['epl', 'Premier League'],
  ['laliga', 'La Liga'],
  ['bundesliga', 'Bundesliga'],
  ['seriea', 'Serie A'],
  ['ucl', 'Champions League'],
];

/** One board into one section. Null when there is nothing worth printing. */
export function sectionFor(compId: string, label: string, board: ClubStanding[]): PositionSection | null {
  const rows = board
    .filter((s) => s.played > 0 || s.rank > 0)
    .map((s) => ({ clubId: s.clubId, rank: s.rank, points: s.points, played: s.played }))
    .sort((a, b) => {
      if (a.rank > 0 && b.rank > 0) return a.rank - b.rank;
      if (a.rank > 0) return -1;
      if (b.rank > 0) return 1;
      return b.points - a.points;
    });
  return rows.length ? { compId, label, rows } : null;
}
