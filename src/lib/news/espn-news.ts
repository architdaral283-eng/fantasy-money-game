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

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** One league's raw news feed. Null on any failure — a league being down
 *  costs that league, never the caller. The digest and the scout DM share it. */
export async function fetchLeagueNews(lg: string, timeoutMs = 8000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${lg}/news?limit=25`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
  /** ESPN filed it as HeadlineNews rather than a Story. */
  prominent: boolean;
  /** How many teams and players ESPN tagged. A big story touches a lot of them. */
  mentions: number;
  /** How many league feeds carried it. Filled in during selection. */
  sources: number;
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

/** First-team football. The under-18s and the women's side are different clubs. */
export function isFirstTeamFootball(headline: string): boolean {
  return !NOT_FIRST_TEAM.test(headline);
}

// ———————————————————————————————————————————————————————————————————————
// What earns a slot. REWRITTEN 31 Oct 2026.
//
// The old version was an ALLOW-LIST of event words — sack, injure, sign, ban.
// Anything it did not recognise was thrown away as filler. That failed in the
// worst possible way: the bigger and stranger the story, the less likely its
// vocabulary was on the list. Manchester City were found guilty of 114
// charges, faced expulsion, and the group was never told, across four
// consecutive briefs, because "guilty", "verdict", "breaches", "expulsion"
// and "stripped" were not words anyone had thought to add.
//
// So nothing is discarded for its KIND any more. Everything about one of the
// sixteen is ranked, and the ranking is: how big is this story, and is it
// about the four things Archit actually wants — injuries, transfers, players
// and managers. A rumour column or a listicle is not banned, it simply sits
// at the bottom and only appears when there is nothing better.
//
// The flood guard is elsewhere and always was: selectDigest takes at most ONE
// item per club, so thirteen Man City articles in one feed cannot take the
// brief. The filter never needed to do that job.
// ———————————————————————————————————————————————————————————————————————

/** ESPN's recurring columns. Same headline every day, different names in it. */
const RECURRING_COLUMN = /^(transfer rumou?rs?|transfer talk|rumou?r roundup|live updates?|ask |the briefing|what we learned)\b/i;

/** Analysis and listicles. "Why X lost", "How a tiny club…", "ranked", "best XI". */
const FEATURE = /^(why|how|what|who|where|inside|meet|the rise|the fall)\b|\b(ranked|rated|power rankings|best xi|predictions?|preview|talking points|winners and losers|explained|analysis|a look at)\b/i;

/** Somebody talking about football, rather than football happening. */
const JUST_TALK = /\b(says?|said|insists?|admits?|reveals?|claims?|excited|delighted|hits out|backs?|praises?|defends?|slams?|urges?|warns?|hopes?|confident|open to|interview)\b/i;

// The four things worth knowing about a club you own money on. These are
// BOOSTS, not gates: a story that matches none of them still runs if it is
// big enough.
const INJURY = /\b(injur\w*|ruled out|out for|sidelined|will miss|miss(es|ed)? the|surgery|operation|hamstring|knee|ankle|groin|calf|achilles|concussion|fitness|doubt|setback|tear|torn|fracture|rupture|stretchered|hospital\w*|collaps\w*|returns? to training|back in training|comeback)\b/i;
const TRANSFER = /\b(transfer|sign(s|ed|ing)?|joins?|move (to|for)|deal|fee|bid|loan|contract|extends?|renew\w*|released?|sold|bought|medical|agree(s|d)?|target(s|ing)?|linked|swoop|exit|departure|leaves?|price tag|release clause|buyout)\b/i;
const MANAGER = /\b(managers?|head coach(es)?|bosses|boss|sack(ed|s|ing)?|fired|appoint\w*|resign\w*|steps? down|takes? charge|interim|dugout|successor|technical director|sporting director)\b/i;
// Discipline and governance. "guilty", "verdict" and "breaches" live here
// precisely because their absence is what hid the Manchester City story.
const DISCIPLINE = /\b(ban(ned|s)?|suspend\w*|charg(ed|es)|fined|red card|sent off|investigat\w*|points deduction|guilty|verdict|breach\w*|expulsion|expelled|stripped|sanction\w*|appeal)\b/i;

/** Which of Archit's topics this headline is about. Empty is allowed. */
export function topicsOf(headline: string): string[] {
  const out: string[] = [];
  if (INJURY.test(headline)) out.push('injury');
  if (TRANSFER.test(headline)) out.push('transfer');
  if (MANAGER.test(headline)) out.push('manager');
  if (DISCIPLINE.test(headline)) out.push('discipline');
  return out;
}

/**
 * 0 = one of the four topics, 1 = everything else, 2 = a recurring column or
 * a listicle AND nothing on topic.
 *
 * Nothing is excluded by this any more — worthPrinting no longer consults it.
 * It survives because prominence() reads it and the tests describe the brief
 * in its terms.
 */
export function newsPriority(headline: string): 0 | 1 | 2 {
  if (topicsOf(headline).length) return 0;
  if (RECURRING_COLUMN.test(headline) || FEATURE.test(headline)) return 2;
  return 1;
}

/**
 * Everything the brief will consider.
 *
 * ONE exclusion left, and it is not a matter of taste: ESPN tags a youth or
 * women's story to the SENIOR club id, so without this a Manchester United
 * under-18 result arrives as news about Vedant's club. That is a mis-tag, not
 * an editorial call. Every other kind of story is ranked, not refused.
 */
export function worthPrinting(headline: string): boolean {
  return isFirstTeamFootball(headline);
}

interface RawCategory { type?: string; teamId?: number | string; team?: { id?: number | string } }

interface RawArticle {
  id?: number | string; headline?: string; description?: string; published?: string; type?: string;
  categories?: RawCategory[];
}

/**
 * One league's feed. Malformed articles are skipped, never thrown.
 *
 * The window is 24 hours, not 36: this runs at 23:00, and a match report from
 * the day before is not news by then.
 */
export function parseNews(json: unknown, nowMs: number, windowHours = 24): NewsItem[] {
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
      if (!worthPrinting(headline)) continue;
      const clubIds: string[] = [];
      for (const c of a.categories ?? []) {
        if (c.type !== 'team') continue;
        const club = CLUB_BY_ESPN.get(String(c.teamId ?? c.team?.id));
        if (club && !clubIds.includes(club)) clubIds.push(club);
      }
      out.push({
        id: String(a.id ?? headline), headline,
        description: String(a.description ?? '').trim(), published, clubIds,
        prominent: String(a.type) === 'HeadlineNews',
        mentions: (a.categories ?? []).filter((c) => c.type === 'team' || c.type === 'athlete').length,
        sources: 1,
      });
    } catch { /* one bad article never sinks the feed */ }
  }
  return out;
}

// Whose story is it?
//
// ESPN tags an article with every club it mentions — the Fleetwood Town cup
// upset carried seven, Manchester United among them because the piece listed
// other famous giant-killings. Taking the first owned club in ESPN's order
// printed "Manchester United · Vedant" above a headline about Arsenal, which
// is worse than printing nothing: it puts the wrong man's name on it.
//
// So the club must be NAMED IN THE HEADLINE. The only exception is an article
// tagged to exactly one of ours, where there is nothing to confuse it with
// ("Mbappé ruled out for three weeks" never says Real Madrid).
const CLUB_IN_HEADLINE: Record<string, RegExp> = {
  arsenal: /\barsenal\b/i,
  'man-city': /\bman(chester)? city\b/i,
  'man-utd': /\bman(chester)? (united|utd)\b/i,
  'aston-villa': /\b(aston )?villa\b/i,
  'real-madrid': /\breal madrid\b/i,
  barcelona: /\b(barcelona|bar[çc]a)\b/i,
  atletico: /\batl[ée]tico\b/i,
  'real-betis': /\bbetis\b/i,
  bayern: /\bbayern\b/i,
  leverkusen: /\bleverkusen\b/i,
  dortmund: /\bdortmund\b/i,
  'rb-leipzig': /\bleipzig\b/i,
  inter: /\b(inter|internazionale)\b/i,
  napoli: /\bnapoli\b/i,
  roma: /\broma\b/i,
  juventus: /\b(juventus|juve)\b/i,
};

/** The club this headline is actually about, or null if it cannot be told. */
export function clubOfHeadline(item: NewsItem): string | null {
  const named = item.clubIds
    .map((c) => ({ c, at: item.headline.search(CLUB_IN_HEADLINE[c] ?? /$^/) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);                 // whoever the headline names FIRST
  if (named.length) return named[0].c;
  if (item.clubIds.length === 1) return item.clubIds[0];  // unambiguous tag, player-only headline
  return null;                                    // several tagged, none named: do not guess
}

// NOTE ON ESCAPING: these are strings joined into a RegExp, so a word
// boundary is '\\b' (two characters in the source), exactly as in EVENT
// above. It was '\\\\b' here until 30 Oct 2026, which compiles to a literal
// backslash followed by b and matches nothing — ten entries, Milan, PSG,
// Porto, Ajax, PSV, Lyon, Monaco, FIFA, UEFA and the Euros, were silently
// dead, and the ELSEWHERE slot was picking from a smaller pool than it looked.
//
// ELSEWHERE gets exactly one slot, and only for football that a group of
// four would actually recognise. Espanyol sacking their coach is real news and
// means nothing in a Delhi living room. The club or competition has to be one
// of these, matched on the HEADLINE, not the summary.
const MAJOR_ELSEWHERE = new RegExp([
  // England
  'liverpool', 'chelsea', 'tottenham', 'spurs', 'newcastle', 'everton', 'west ham',
  // Spain, Italy, Germany, France
  'sevilla', 'valencia', 'athletic( bilbao)?', 'villarreal', 'real sociedad',
  'ac milan', '\\bmilan\\b', 'lazio', 'atalanta', 'fiorentina',
  'frankfurt', 'stuttgart', 'wolfsburg', 'schalke',
  '\\bpsg\\b', 'paris saint-germain', 'marseille', '\\blyon\\b', '\\bmonaco\\b',
  // the rest of the continent and beyond
  // "sporting" alone matched "sporting director" at every club on earth
  'benfica', '\\bporto\\b', 'sporting (cp|lisbon)', '\\bajax\\b', '\\bpsv\\b', 'feyenoord',
  'celtic', 'rangers', 'galatasaray', 'fenerbah[çc]e', 'al-?nassr', 'al-?hilal', 'inter miami',
  // competitions, bodies and the sport's own furniture
  'world cup', 'champions league', 'europa league', 'conference league', '\\beuros?\\b',
  'premier league', 'laliga', 'la liga', 'serie a', 'bundesliga', 'ligue 1',
  '\\bfifa\\b', '\\buefa\\b', 'ballon d.or', 'golden boot', 'player of the year',
  'england', 'france', 'brazil', 'argentina', 'spain', 'germany', 'italy', 'portugal',
].join('|'), 'i');

/** Football the group would recognise. Not a mid-table side nobody has heard of. */
export function isMajorElsewhere(headline: string): boolean {
  return MAJOR_ELSEWHERE.test(headline);
}

/**
 * How big is this story?
 *
 * Archit's note: the three club items should be the day's top stories mapped
 * onto the sixteen, not whichever three happened to be newest. ESPN gives no
 * popularity number, but it gives three usable proxies:
 *
 *  - SYNDICATION. A story carried by several league feeds at once is a story
 *    the editors think everyone cares about. Kane's Ballon d'Or ran in four;
 *    a Napoli touchline ban ran in one. This is the strongest signal and it
 *    was being thrown away by the de-duplication.
 *  - HeadlineNews over Story: ESPN's own front-page call.
 *  - BREADTH. A big story is tagged with a lot of clubs and players.
 *
 * Recency only breaks ties — at 23:00 everything in the window is today.
 */
export function prominence(it: NewsItem): number {
  const topics = topicsOf(it.headline);
  return (it.sources - 1) * 6                 // syndication: the best virality signal there is
    + (it.prominent ? 5 : 0)                  // ESPN's own front-page call
    + Math.min(it.mentions, 6)                // breadth of a big story
    // FLAT, not scaled by how many topics matched. Counting them made
    // "Man City learned of guilty verdicts before transfer activity" beat
    // "Man City guilty of all charges", because an incidental second keyword
    // scored higher than the story everybody was actually reading. Matching
    // two of Archit's topics does not make a story twice as interesting.
    + (topics.length ? 6 : 0)                 // injuries, transfers, managers, discipline
    + (RECURRING_COLUMN.test(it.headline) ? -6 : 0)
    + (FEATURE.test(it.headline) ? -5 : 0)
    + (topics.length === 0 && JUST_TALK.test(it.headline) ? -4 : 0)
    + (OFF_PITCH.test(it.headline) ? -6 : 0); // tabloid, not banned, just last
}

export interface DigestSelection {
  ours: NewsItem[];
  /** Football that touches none of the sixteen. Carries ESPN's summary so it
   *  is not a bare headline about strangers. */
  general: NewsItem[];
  /** EVERY article id behind what went out tonight, including the syndicated
   *  copies that were collapsed into it. */
  ids: string[];
  /** The headline keys that went out tonight. */
  keys: string[];
}

/**
 * A story's identity, independent of ESPN's article id.
 *
 * WHY THIS EXISTS. ESPN syndicates one story into several league feeds with a
 * DIFFERENT article id in each. The old code collapsed them by headline and
 * remembered only the winning copy's id, so the other ids were never marked
 * as seen. Days later — once the digest widened its window to 48 or 72 hours
 * on a quiet day — a surviving copy walked straight back in. That is exactly
 * how the Pulisic contract story ran twice.
 */
export function headlineKey(headline: string): string {
  return headline.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ———————————————————————————————————————————————————————————————————————
// THE RETREAD GUARD.
//
// Found on 31 Oct in the live Serie A feed, which carried both of these:
//
//   "Sources: USMNT's Christian Pulisic set to sign new AC Milan contract"
//   "USMNT star Christian Pulisic signs new AC Milan contract through 2031"
//
// Different ids, different headlines, days apart — so neither the id check
// nor the headline key stops the second one. To ESPN they are two events,
// agreed and then completed. To four men reading a group chat they are the
// same story twice, and this is the repeat Archit actually complained about.
//
// So: compare what a headline is ABOUT. Strip the small words, stem the rest,
// and if a new headline shares most of its distinctive words with one already
// sent, it is a retread.
// ———————————————————————————————————————————————————————————————————————

const STOP = new Set([
  'after', 'ahead', 'among', 'another', 'back', 'been', 'before', 'being', 'both', 'could', 'deal',
  'does', 'down', 'during', 'each', 'first', 'from', 'game', 'have', 'into', 'just', 'last', 'late',
  'like', 'more', 'most', 'much', 'near', 'need', 'news', 'next', 'over', 'said', 'says', 'season',
  'should', 'since', 'some', 'soon', 'sources', 'star', 'still', 'than', 'that', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'through', 'time', 'under', 'until', 'well', 'were',
  'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would', 'year', 'years',
]);

/** Crude stemmer: signs/signed/signing all become sign. */
function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, '');
}

/** The distinctive words of a headline. */
export function headlineTokens(headline: string): Set<string> {
  return new Set(
    headlineKey(headline)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
      .map(stem),
  );
}

/** Has this story already been told, in different words? */
export function isRetread(headline: string, alreadySent: Iterable<string>, threshold = 0.6): boolean {
  const a = headlineTokens(headline);
  if (a.size < 3) return false;              // too short to judge; let it run
  for (const prev of alreadySent) {
    const b = headlineTokens(prev);
    if (b.size < 3) continue;
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    if (shared / Math.min(a.size, b.size) >= threshold) return true;
  }
  return false;
}

/** The stories about one club, newest first. Used by the scouting DM. */
export function clubHeadlines(items: NewsItem[], clubId: string, max = 2): NewsItem[] {
  const out: NewsItem[] = [];
  const seenKeys = new Set<string>();
  for (const it of [...items].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))) {
    if (out.length >= max) break;
    if (clubOfHeadline(it) !== clubId) continue;
    const k = headlineKey(it.headline);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    out.push(it);
  }
  return out;
}

/**
 * Pick what goes in tonight's brief.
 *
 * - club items first: anything tied to one of the sixteen
 * - then a little general football, but ONLY with ESPN's summary attached, so
 *   it arrives with context instead of as a headline about strangers
 * - de-duplicated by article id AND by headline key, within tonight's feeds
 *   and against every previous night
 * - at most one item per club, so a busy Arsenal week cannot take the whole
 *   brief and leave the other fifteen unmentioned
 * - newest first
 */
export function selectDigest(
  items: NewsItem[],
  opts: { seenIds?: Iterable<string>; seenKeys?: Iterable<string>; maxOurs?: number; maxGeneral?: number } = {},
): DigestSelection {
  const { maxOurs = 4, maxGeneral = 1 } = opts;
  const seen = new Set(opts.seenIds ?? []);
  const seenKeys = new Set(opts.seenKeys ?? []);
  // Only the recent ones: a story from three months ago sharing words with
  // today's is a coincidence, not a repeat. seenKeys is newest-first.
  const recent = [...seenKeys].slice(0, 60);

  // Collapse the same story across league feeds, COUNTING how many carried it
  // and KEEPING every id it arrived under. The count measures how big the
  // story is; the ids are what stop it coming back.
  const byHeadline = new Map<string, { it: NewsItem; ids: string[] }>();
  for (const it of items) {
    const key = headlineKey(it.headline);
    if (seen.has(it.id) || seenKeys.has(key) || isRetread(it.headline, recent)) continue;
    const prev = byHeadline.get(key);
    if (prev) { prev.it.sources += 1; if (!prev.ids.includes(it.id)) prev.ids.push(it.id); continue; }
    byHeadline.set(key, { it: { ...it, sources: 1 }, ids: [it.id] });
  }

  const ranked = [...byHeadline.values()]
    .sort((a, b) => (prominence(b.it) - prominence(a.it)) || (Date.parse(b.it.published) - Date.parse(a.it.published)));
  const allIds = new Map<string, string[]>(ranked.map((r) => [r.it.id, r.ids]));

  const ours: NewsItem[] = [];
  const usedClubs = new Set<string>();
  for (const { it } of ranked) {
    if (ours.length >= maxOurs) break;
    if (!it.clubIds.length) continue;
    const club = clubOfHeadline(it);
    if (!club || usedClubs.has(club)) continue;
    usedClubs.add(club);
    ours.push({ ...it, clubIds: [club, ...it.clubIds.filter((c) => c !== club)] });
  }
  // ELSEWHERE: one slot, and it has to earn it. ESPN's summary for context,
  // and a club or competition the group would actually recognise.
  const general = ranked
    .map((r) => r.it)
    .filter((it) => clubOfHeadline(it) === null && it.description.length > 20 && isMajorElsewhere(it.headline))
    .slice(0, maxGeneral);

  const shown = [...ours, ...general];
  return {
    ours,
    general,
    ids: [...new Set(shown.flatMap((i) => allIds.get(i.id) ?? [i.id]))],
    keys: [...new Set(shown.map((i) => headlineKey(i.headline)))],
  };
}
