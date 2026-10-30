// Everything a scouting report needs about the real world: where each club
// sits in its own league, and what has happened to it lately.
//
// Both come from feeds this repo already reads daily — the standings boards
// behind /clubform and the news feeds behind the nightly brief — so neither
// is a new dependency, and neither can break anything that was working.
//
// MEMOISED for five minutes. scoutDms() is called once per fixture entering
// its window, and on a four-fixture Saturday that would otherwise be nine
// ESPN calls per fixture inside the poller's 60-second budget. The cup sync
// already taught us what happens when one route spends the whole timeout.

import { espnStandings, FORM_COMPS, type ClubStanding } from '@/lib/providers/espn-standings';
import { NEWS_LEAGUES, fetchLeagueNews, parseNews, type NewsItem } from '@/lib/news/espn-news';

const TTL_MS = 5 * 60 * 1000;
/** A week: a scouting report wants the injury from Tuesday, not just today. */
const NEWS_WINDOW_HOURS = 168;

let cache: { at: number; standings: ClubStanding[]; news: NewsItem[] } | null = null;

/** Tests only. The cache is per lambda instance and deliberately process-wide. */
export function resetScoutFeed(): void { cache = null; }

export async function scoutFeed(nowMs = Date.now()): Promise<{ standings: ClubStanding[]; news: NewsItem[] }> {
  if (cache && nowMs - cache.at < TTL_MS) return { standings: cache.standings, news: cache.news };
  const [boards, feeds] = await Promise.all([
    Promise.all(FORM_COMPS.map((c) => espnStandings(c).catch((): ClubStanding[] => []))),
    Promise.all(NEWS_LEAGUES.map((lg) => fetchLeagueNews(lg).catch(() => null))),
  ]);
  const standings = boards.flat();
  const news = feeds.flatMap((j) => (j === null ? [] : parseNews(j, nowMs, NEWS_WINDOW_HOURS)));
  // A total failure is not cached: better to try again next fixture than to
  // serve five minutes of empty reports.
  if (standings.length || news.length) cache = { at: nowMs, standings, news };
  return { standings, news };
}
