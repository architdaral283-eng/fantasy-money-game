// League standings per club, for the side-table.
//
// ESPN's standings endpoint gives goals for and against, wins and points for
// every team in a league in one call, so all sixteen clubs cost four calls.
// Its stat names are from the American house style: pointsFor and
// pointsAgainst are GOALS, and points is points.

import { CLUB_BY_ESPN, ESPN_LEAGUE } from '@/lib/providers/espn';

export interface ClubStanding {
  clubId: string;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  diff: number;
  points: number;
  rank: number;
}

interface RawEntry {
  team?: { id?: string | number };
  stats?: { name?: string; value?: number }[];
}

/** Pure. Standings JSON in, rows for clubs we own out. */
export function parseStandings(json: unknown): ClubStanding[] {
  const root = json as { children?: { standings?: { entries?: RawEntry[] } }[]; standings?: { entries?: RawEntry[] } } | null;
  const entries: RawEntry[] = [
    ...(root?.standings?.entries ?? []),
    ...(root?.children ?? []).flatMap((c) => c.standings?.entries ?? []),
  ];

  const out: ClubStanding[] = [];
  for (const e of entries) {
    try {
      const clubId = CLUB_BY_ESPN.get(String(e.team?.id ?? ''));
      if (!clubId) continue;
      const stat = (name: string): number => {
        const v = (e.stats ?? []).find((s) => s.name === name)?.value;
        return Number.isFinite(Number(v)) ? Number(v) : 0;
      };
      const gf = stat('pointsFor');
      const ga = stat('pointsAgainst');
      out.push({
        clubId,
        played: stat('gamesPlayed'),
        w: stat('wins'),
        d: stat('ties'),
        l: stat('losses'),
        gf, ga,
        diff: gf - ga,
        points: stat('points'),
        rank: stat('rank'),
      });
    } catch { /* one malformed row never sinks the table */ }
  }
  return out;
}

const BASE = 'https://site.api.espn.com/apis/v2/sports/soccer';

export async function espnStandings(compId: string, timeoutMs = 8000): Promise<ClubStanding[]> {
  const lg = ESPN_LEAGUE[compId];
  if (!lg) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${lg}/standings`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return [];
    return parseStandings(await r.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** The four leagues every club plays in. Cups and the UCL are not standings. */
export const FORM_COMPS = ['epl', 'laliga', 'bundesliga', 'seriea'] as const;
