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

/** Transfers, managers, injuries, first-team matters. Not the under-18s. */
export function isFirstTeamFootball(headline: string): boolean {
  return !NOT_FIRST_TEAM.test(headline) && !OFF_PITCH.test(headline);
}

// ———————————————————————————————————————————————————————————————————————
// What earns a slot.
//
// The first version of this ranked on keywords — "transfer", "manager" — and
// the live result was filler: ESPN's daily rumour column, a feature about
// where Basque coaches come from, a player being gracious about an award he
// lost. Archit's verdict: generic.
//
// The ones that worked were things that HAPPENED, with a name attached:
// Kompany collapsing in training, Fleetwood Town knocking Arsenal out of the
// League Cup. So this ranks events, not vocabulary, and throws out the three
// shapes of filler that a daily feed is mostly made of.
// ———————————————————————————————————————————————————————————————————————

/** ESPN's recurring columns. Same headline every day, different names in it. */
const RECURRING_COLUMN = /^(transfer rumou?rs?|transfer talk|rumou?r roundup|live updates?|ask |the briefing|what we learned)\b/i;

/** Somebody talking about football, rather than football happening. */
const JUST_TALK = /\b(says?|said|insists?|admits?|reveals?|claims?|excited|delighted|hits out|backs?|praises?|defends?|slams?|urges?|warns?|hopes?|confident|open to|interview)\b/i;

/** Analysis and listicles. "Why X lost", "How a tiny club…", "ranked", "best XI". */
const FEATURE = /^(why|how|what|who|where|inside|meet|the rise|the fall)\b|\b(ranked|rated|power rankings|best xi|predictions?|preview|talking points|winners and losers|explained|analysis|a look at)\b/i;

/** Something actually happened to a club. These get the slots. */
const EVENT = new RegExp([
  // the dugout
  'sack(ed|s|ing)?', 'fired', 'appoint\\w*', 'resign\\w*', 'steps? down', 'leaves?', 'departs?', 'takes? charge', 'interim',
  // bodies
  'collaps\\w*', 'hospital\\w*', 'injur\\w*', 'surgery', 'operation', 'ruled out', 'out for', 'away for',
  'sidelined', 'will miss', 'out of action', 'stretchered', 'tear', 'fracture', 'rupture',
  // business done
  'sign(s|ed|ing)?\\b', 'agree(s|d)?\\b', 'complete(s|d)?\\b', 'seal(s|ed)?\\b', 'medical', 'joins?\\b',
  'new contract', 'contract until', 'extends?', 'released', 'sold', 'bought', 'takeover', 'new owners?',
  // competition
  // "knock Arsenal out" puts the object in the middle, so a literal
  // "knocked out" misses the exact headline this filter exists for.
  'knock(s|ed|ing)?\\b', 'out of the \\w+ cup', 'eliminated', 'crash(es|ed)? out', 'dumped out', 'upset',
  'through to', 'reach(es|ed)? the',
  'win(s)? the', 'won the', 'champions', 'ballon d.or', 'player of the year',
  // discipline
  'ban(ned|s)?\\b', 'suspend\\w*', 'charg(ed|es)\\b', 'fined', 'red card', 'sent off', 'investigat\\w*', 'points deduction',
].join('|'), 'i');

/**
 * 0 = something happened, 1 = concrete interest in a named player, 2 = filler.
 * Tier 2 never reaches the brief: three good items beat six forgettable ones.
 */
export function newsPriority(headline: string): 0 | 1 | 2 {
  if (RECURRING_COLUMN.test(headline)) return 2;
  if (FEATURE.test(headline)) return 2;
  // Talk is checked BEFORE events on purpose. "Yamal excited despite Ballon
  // d'Or miss" contains an event word and is still just a man being gracious
  // about an award he lost; that ordering bug put it top of the live brief.
  if (JUST_TALK.test(headline)) return 2;
  if (EVENT.test(headline)) return 0;
  if (/\b(target(ing|s)?|track(ing|s)?|linked|bid for|want(s|ed)?|move for|interest in)\b/i.test(headline)) return 1;
  return 2;
}

/** Everything the brief will consider. Filler is dropped outright. */
export function worthPrinting(headline: string): boolean {
  return isFirstTeamFootball(headline) && newsPriority(headline) < 2;
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

// ELSEWHERE gets exactly one slot, and only for football that a group of
// four would actually recognise. Espanyol sacking their coach is real news and
// means nothing in a Delhi living room. The club or competition has to be one
// of these, matched on the HEADLINE, not the summary.
const MAJOR_ELSEWHERE = new RegExp([
  // England
  'liverpool', 'chelsea', 'tottenham', 'spurs', 'newcastle', 'everton', 'west ham',
  // Spain, Italy, Germany, France
  'sevilla', 'valencia', 'athletic( bilbao)?', 'villarreal', 'real sociedad',
  'ac milan', '\\\\bmilan\\\\b', 'lazio', 'atalanta', 'fiorentina',
  'frankfurt', 'stuttgart', 'wolfsburg', 'schalke',
  '\\\\bpsg\\\\b', 'paris saint-germain', 'marseille', '\\\\blyon\\\\b', '\\\\bmonaco\\\\b',
  // the rest of the continent and beyond
  // "sporting" alone matched "sporting director" at every club on earth
  'benfica', '\\\\bporto\\\\b', 'sporting (cp|lisbon)', '\\\\bajax\\\\b', '\\\\bpsv\\\\b', 'feyenoord',
  'celtic', 'rangers', 'galatasaray', 'fenerbah[çc]e', 'al-?nassr', 'al-?hilal', 'inter miami',
  // competitions, bodies and the sport's own furniture
  'world cup', 'champions league', 'europa league', 'conference league', '\\\\beuros?\\\\b',
  'premier league', 'laliga', 'la liga', 'serie a', 'bundesliga', 'ligue 1',
  '\\\\bfifa\\\\b', '\\\\buefa\\\\b', 'ballon d.or', 'golden boot', 'player of the year',
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
  return (it.sources - 1) * 6
    + (it.prominent ? 3 : 0)
    + Math.min(it.mentions, 6)
    + (newsPriority(it.headline) === 0 ? 2 : 0);
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
  const { maxOurs = 4, maxGeneral = 1 } = opts;
  const seen = new Set(opts.seenIds ?? []);

  // Collapse the same story across league feeds, COUNTING how many carried it.
  // That count is the best available measure of how big the story is.
  const byHeadline = new Map<string, NewsItem>();
  for (const it of items) {
    if (seen.has(it.id)) continue;
    const key = it.headline.toLowerCase().replace(/\s+/g, ' ').trim();
    const prev = byHeadline.get(key);
    if (prev) { prev.sources += 1; continue; }
    byHeadline.set(key, { ...it, sources: 1 });
  }
  const byId = new Map<string, NewsItem>(
    [...byHeadline.values()]
      .sort((a, b) => (prominence(b) - prominence(a)) || (Date.parse(b.published) - Date.parse(a.published)))
      .map((it) => [it.id, it]),
  );
  const ours: NewsItem[] = [];
  const usedClubs = new Set<string>();
  for (const it of byId.values()) {
    if (ours.length >= maxOurs) break;
    if (!it.clubIds.length) continue;
    const club = clubOfHeadline(it);
    if (!club || usedClubs.has(club)) continue;
    usedClubs.add(club);
    ours.push({ ...it, clubIds: [club, ...it.clubIds.filter((c) => c !== club)] });
  }
  // ELSEWHERE: one slot, and it has to earn it. ESPN's summary for context,
  // and a club or competition the group would actually recognise.
  const general = [...byId.values()]
    .filter((it) => !it.clubIds.length && it.description.length > 20 && isMajorElsewhere(it.headline))
    .slice(0, maxGeneral);
  return { ours, general, ids: [...ours, ...general].map((i) => i.id) };
}
