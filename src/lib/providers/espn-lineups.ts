// Team news. ESPN's match summary carries the full roster with starters
// flagged, free, for every competition we track — verified against the live
// feed rather than assumed, because the backlog listed this one as unproven.
//
// Lineups appear roughly an hour before kickoff and not a minute earlier, so
// everything here treats "not published yet" as the normal case rather than
// an error.

import { CLUB_BY_ESPN } from '@/lib/providers/espn';

export interface Lineup {
  clubId: string;
  formation: string | null;
  /** Starting eleven, in the order ESPN lists them: keeper first. */
  xi: string[];
  bench: number;
}

interface RawRoster {
  team?: { id?: string | number };
  formation?: string;
  roster?: {
    starter?: boolean;
    athlete?: { displayName?: string; shortName?: string };
    position?: { abbreviation?: string };
  }[];
}

/** Pure. Summary JSON in, lineups for clubs we own out. */
export function parseLineups(json: unknown): Lineup[] {
  const rosters = (json as { rosters?: RawRoster[] } | null)?.rosters ?? [];
  const out: Lineup[] = [];
  for (const r of rosters) {
    try {
      const clubId = CLUB_BY_ESPN.get(String(r.team?.id ?? ''));
      if (!clubId) continue;
      const squad = r.roster ?? [];
      const starters = squad.filter((p) => p.starter === true);
      // An unpublished lineup comes back as an empty roster, or as a squad
      // with nobody flagged as a starter. Both mean "not yet", not "nobody".
      if (starters.length < 11) continue;
      out.push({
        clubId,
        formation: r.formation ? String(r.formation) : null,
        xi: starters
          .map((p) => p.athlete?.shortName || p.athlete?.displayName || '')
          .filter((n) => n !== ''),
        bench: squad.length - starters.length,
      });
    } catch { /* one malformed roster never sinks the other */ }
  }
  return out;
}

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export async function espnLineups(compId: string, eventId: string, timeoutMs = 8000): Promise<Lineup[]> {
  const { ESPN_LEAGUE } = await import('@/lib/providers/espn');
  const lg = ESPN_LEAGUE[compId];
  if (!lg || !eventId) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${lg}/summary?event=${encodeURIComponent(eventId)}`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return [];
    return parseLineups(await r.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Is a named player in this eleven? ESPN shortens names, so match loosely. */
export function inXI(xi: string[], player: string): boolean {
  if (!player) return false;
  const last = player.trim().split(/\s+/).pop()!.toLowerCase();
  return xi.some((n) => n.toLowerCase().includes(last));
}
