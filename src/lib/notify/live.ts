// Live scores on the pinned panel.
//
// The pin is the one group surface that costs nothing to update, so a money
// match in progress can sit at the top of it and change as it goes. The
// poller runs every five minutes, so this is a panel, not a ticker — it says
// the minute it was true for, and goes quiet rather than ageing in place.

import type { SupabaseClient } from '@supabase/supabase-js';
import { espnScoreboard, espnDateOf, findMatch, isLive, ESPN_LEAGUE } from '@/lib/providers/espn';

export const LIVE_KEY = 'live_now';
/** Beyond this the entry is dropped rather than shown as current. */
export const LIVE_STALE_MIN = 12;

export interface LiveEntry {
  fixtureId: string;
  home: string;
  away: string;
  h: number;
  a: number;
  clock: string;
  updatedAt: string;
}

interface LiveFixture {
  id: string; home_club_id: string; away_club_id: string;
  competition_id: string; kickoff_utc: string;
}

/**
 * Look for money matches currently being played and record their scores.
 *
 * A fixture is a candidate only between kickoff and three hours after it, so
 * on a day with nothing on this makes no network calls at all.
 */
export async function refreshLive(db: SupabaseClient): Promise<number> {
  const now = Date.now();
  const { data: fx } = await db.from('fixtures')
    .select('id,home_club_id,away_club_id,competition_id,kickoff_utc')
    .eq('status', 'SCHEDULED').eq('is_same_owner', false)
    .lte('kickoff_utc', new Date(now).toISOString())
    .gte('kickoff_utc', new Date(now - 3 * 3600 * 1000).toISOString());

  const candidates = (fx ?? []) as LiveFixture[];
  if (!candidates.length) {
    await db.from('config').delete().eq('key', LIVE_KEY);
    return 0;
  }

  const { data: clubs } = await db.from('clubs').select('id,name');
  const nameOf = (id: string) =>
    ((clubs ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;

  // One scoreboard per competition per date, however many fixtures need it.
  const cache = new Map<string, ReturnType<typeof espnScoreboard>>();
  const board = (compId: string, iso: string) => {
    const league = ESPN_LEAGUE[compId];
    if (!league) return null;
    const key = `${league}:${espnDateOf(iso)}`;
    if (!cache.has(key)) cache.set(key, espnScoreboard(league, espnDateOf(iso)));
    return cache.get(key)!;
  };

  const entries: LiveEntry[] = [];
  for (const f of candidates) {
    try {
      const p = board(f.competition_id, f.kickoff_utc);
      if (!p) continue;
      const m = findMatch(await p, f.home_club_id, f.away_club_id, f.kickoff_utc);
      if (!m || !isLive(m)) continue;
      entries.push({
        fixtureId: f.id,
        home: nameOf(f.home_club_id),
        away: nameOf(f.away_club_id),
        h: m.home,
        a: m.away,
        clock: m.clock ?? '',
        updatedAt: new Date().toISOString(),
      });
    } catch { /* one competition failing must not take the others with it */ }
  }

  if (!entries.length) {
    await db.from('config').delete().eq('key', LIVE_KEY);
    return 0;
  }
  await db.from('config').upsert({ key: LIVE_KEY, value: { entries } }, { onConflict: 'key' });
  return entries.length;
}

/** What the pin should show, with anything stale thrown away. */
export async function readLive(db: SupabaseClient, maxAgeMin = LIVE_STALE_MIN): Promise<LiveEntry[]> {
  const { data } = await db.from('config').select('value').eq('key', LIVE_KEY).maybeSingle();
  const entries = ((data?.value as { entries?: LiveEntry[] } | null)?.entries ?? []) as LiveEntry[];
  const cutoff = Date.now() - maxAgeMin * 60 * 1000;
  return entries.filter((e) => Date.parse(e.updatedAt) >= cutoff);
}
