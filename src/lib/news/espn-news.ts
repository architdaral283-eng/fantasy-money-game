// The nightly brief's source: ESPN's public news feed, one call per league.
//
// Why this works at all: every article carries `categories`, and a team
// category holds ESPN's own team id. That means filtering to our sixteen is an
// id lookup against TEAM_ID_MAP.espn, never a string match on club names —
// which is forbidden in this repo for exactly the reasons you would expect
// ("United", "Inter", "Madrid").
//
// Pure functions only. The route does the IO. Tested in espn-news.test.ts.

import { TEAM_ID_MAP } from '@/lib/providers/team-ids';

const CLUB_BY_ESPN = new Map<string, string>(
  Object.entries(TEAM_ID_MAP).map(([club, ids]) => [String(ids.espn), club]),
);

/** Leagues worth asking. Cup stories surface in the domestic feed anyway —
 *  Arsenal's League Cup exit arrived in eng.1, not a cup feed. */
export const NEWS_LEAGUES = ['eng.1', 'esp.1', 'ger.1', 'ita.1', 'uefa.champions'] as const;

/** Video clips carry nothing in a text brief; match reports we already post ourselves. */
const USEFUL_TYPES = new Set(['Story', 'HeadlineNews']);

export interface NewsItem {
  id: string;
  headline: string;
  /** ESPN's own one-sentence summary. This is what gives a general headline context. */
  description: string;
  published: string;
  /** Our club ids mentioned, in the order ESPN listed them. Empty = general football. */
  clubIds: string[];
}

// Not first-team football. ESPN tags a youth or women's story to the SENIOR
// club id, so filtering by team id alone lets them through — "Wayne Rooney's
// son scores 4 goals for Man United under-18s" arrived tagged Manchester
// United. Archit's rule: transfers, managers, injuries, first-team news only.
// NOTE the trailing s? on the age groups: "under-18s" ends in a word
// character, so a closing \b right after the digits never matches.
const NOT_FIRST_TEAM = /\b(under[- ]?\d{2}s?|u-?1[5-9]s?|u-?2[0-3]s?|youth|academy|reserves?|primavera|women'?s?|wsl|f[ée]minines?|b team|development squad)\b/i;
// Tabloid stories about footballers rather than football.
const OFF_PITCH = /\b(burgl\w*|break-?in|divorce|wedding|girlfriend|nightclub)\b/i;

/** Transfers, managers, injuries, first-team matters. Not the under-18s. */
export function isFirstTeamFootball(headline: string): boolean {
  return !NOT_FIRST_TEAM.test(headline) && !OFF_PITCH.test(headline);
}

interface RawCategory { type?: string; teamId?: number | string; team?: { id?: number | string } }
interface RawArticle {
  id?: number | string; headline?: string; description?: string; published?: string; type?: string;
  categories?: RawCategory[];
}

/** One league's feed. Malformed articles are skipped, never thrown. */
export function parseNews(json: unknown, nowMs: number, windowHours = 36): NewsItem[] {
  const arts = (json as { articles?: unknown } | null)?.articles;
  if (!Array.isArray(arts)) return [];
  const cutoff = nowMs - windowHours * 3600 * 1000;
  const out: NewsItem[] = [];
  for (const a of arts as RawArticle[]) {
    try {
      if (!USEFUL_TYPES.has(String(a.type))) continue;
      const headline = String(a.headline ?? '').trim();
      const published = String(a.published ?? '');
      const at = Date.parse(published);
      if (!headline || !Number.isFinite(at) || at < cutoff) continue;
      if (!isFirstTeamFootball(headline)) continue;
      const clubIds: string[] = [];
      for (const c of a.categories ?? []) {
        if (c.type !== 'team') continue;
        const club = CLUB_BY_ESPN.get(String(c.teamId ?? c.team?.id));
        if (club && !clubIds.includes(club)) clubIds.push(club);
      }
      out.push({ id: String(a.id ?? headline), headline, description: String(a.description ?? '').trim(), published, clubIds });
    } catch { /* one bad article never sinks the feed */ }
  }
  return out;
}

export interface DigestSelection {
  ours: NewsItem[];
  /** Football that touches none of the sixteen. Carries ESPN's summary so it
   *  is not a bare headline about strangers. */
  general: NewsItem[];
  /** Every id shown tonight, to be remembered so nothing repeats tomorrow. */
  ids: string[];
}

/**
 * Pick what goes in tonight's brief.
 *
 * - club items first: anything tied to one of the sixteen
 * - then a little general football, but ONLY with ESPN's summary attached, so
 *   it arrives with context instead of as a headline about strangers
 * - de-duplicated by article id AND by headline, because the same story is
 *   syndicated into several league feeds
 * - nothing already sent on a previous night
 * - at most one item per club, so a busy Arsenal week cannot take the whole
 *   brief and leave the other fifteen unmentioned
 * - newest first
 */
export function selectDigest(
  items: NewsItem[],
  opts: { seenIds?: Iterable<string>; maxOurs?: number; maxGeneral?: number } = {},
): DigestSelection {
  const { maxOurs = 6, maxGeneral = 2 } = opts;
  const seen = new Set(opts.seenIds ?? []);
  const byId = new Map<string, NewsItem>();
  const headlines = new Set<string>();
  for (const it of [...items].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))) {
    const key = it.headline.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(it.id) || byId.has(it.id) || headlines.has(key)) continue;
    byId.set(it.id, it);
    headlines.add(key);
  }
  const ours: NewsItem[] = [];
  const usedClubs = new Set<string>();
  for (const it of byId.values()) {
    if (ours.length >= maxOurs) break;
    if (!it.clubIds.length) continue;
    const club = it.clubIds.find((c) => !usedClubs.has(c));
    if (!club) continue;
    usedClubs.add(club);
    ours.push({ ...it, clubIds: [club, ...it.clubIds.filter((c) => c !== club)] });
  }
  // General football only earns a slot if ESPN gave it a summary — without one
  // it is a headline about strangers and reads as a non sequitur.
  const general = [...byId.values()]
    .filter((it) => !it.clubIds.length && it.description.length > 20)
    .slice(0, maxGeneral);
  return { ours, general, ids: [...ours, ...general].map((i) => i.id) };
}
