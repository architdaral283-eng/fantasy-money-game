// ESPN's public scoreboard feed — the second source.
//
// football-data's free tier can sit on a finished match for hours: Napoli 3–3
// Roma on 24 Oct 2026 was still not FINISHED there five hours after full time,
// while ESPN had it final, with every scorer, within minutes. ESPN is used for
// exactly two things:
//   1. a fallback RESULT when football-data is late. It goes through the same
//      scoring and approval path as any other result, with provider 'espn'
//      recorded in the payload, and football-data's later verdict is
//      cross-checked against it (see crossCheckEspn in the poller).
//   2. GOAL SCORERS for the result message. Display only; never money.
// The feed is public but undocumented, so every caller treats a failure here
// as "no data", never as an error that blocks anything else.

import { TEAM_ID_MAP } from '@/lib/providers/team-ids';
import type { NormalisedResult } from '@/lib/scoring/engine';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** Our competition id → ESPN league slug. Every slug verified live on 24 Oct 2026. */
export const ESPN_LEAGUE: Record<string, string> = {
  epl: 'eng.1', laliga: 'esp.1', bundesliga: 'ger.1', seriea: 'ita.1', ucl: 'uefa.champions',
  facup: 'eng.fa', copadelrey: 'esp.copa_del_rey', coppa: 'ita.coppa_italia', dfbpokal: 'ger.dfb_pokal',
  communityshield: 'eng.charity', dflsupercup: 'ger.super_cup',
};

export const CLUB_BY_ESPN = new Map<string, string>(
  Object.entries(TEAM_ID_MAP).map(([club, ids]) => [String(ids.espn), club]),
);

export interface Goal { minute: string; player: string; clubId: string; pen?: boolean; og?: boolean }

export interface EspnMatch {
  espnId: string;
  kickoffUtc: string;
  status: string;      // STATUS_FULL_TIME, STATUS_FINAL_AET, STATUS_FINAL_PEN, STATUS_SCHEDULED, …
  completed: boolean;
  homeClubId: string;
  awayClubId: string;
  home: number;
  away: number;
  /** Empty whenever the feed's goal list does not add up to its own score. */
  goals: Goal[];
  /** Shootout kicks scored, when the tie went to penalties. */
  shootout: { home: number; away: number } | null;
  /** ESPN's own label for the tie ("Quarterfinals", "Round 3"), raw. */
  note: string | null;
  /** Match clock as ESPN prints it: "67'", "90'+4'", "HT". Null when not playing. */
  clock: string | null;
  /** 1 first half, 2 second half, higher for extra time. */
  period: number | null;
}

/** ESPN statuses that mean the match is over. */
const DONE = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN', 'STATUS_FINAL_AFTER_EXTRA_TIME', 'STATUS_FINAL_AFTER_PENALTIES']);
const WENT_TO_PENS = /PEN/;
const WENT_TO_ET = /AET|EXTRA_TIME/;

/**
 * Statuses that mean the ball is in play, or about to be again.
 *
 * ESPN names halves separately and adds its own for breaks, so a single
 * "in progress" check is not enough. Anything not completed and not one of
 * these is treated as not live — better to show nothing than a stale score
 * presented as current.
 */
const LIVE = new Set([
  'STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_HALFTIME',
  'STATUS_END_PERIOD', 'STATUS_EXTRA_TIME', 'STATUS_FIRST_EXTRA_TIME',
  'STATUS_SECOND_EXTRA_TIME', 'STATUS_SHOOTOUT',
]);

export function isLive(m: { status: string; completed: boolean }): boolean {
  return !m.completed && LIVE.has(m.status);
}

/** Minute a goal was scored, stoppage time folded back ("90'+5'" → 90). */
export function minuteOf(g: { minute: string }): number {
  const m = String(g.minute).match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

interface RawDetail {
  clock?: { displayValue?: string };
  team?: { id?: string | number };
  scoringPlay?: boolean; penaltyKick?: boolean; ownGoal?: boolean; shootout?: boolean;
  athletesInvolved?: { displayName?: string; shortName?: string }[];
}
interface RawEvent {
  id?: string | number; date?: string; name?: string; shortName?: string;
  season?: { slug?: string };
  status?: { type?: { name?: string; completed?: boolean }; displayClock?: string; period?: number };
  competitions?: {
    competitors?: { homeAway?: string; score?: string | number; team?: { id?: string | number } }[];
    details?: RawDetail[];
    notes?: { headline?: string; type?: string }[];
  }[];
}

/** Pure. Scoreboard JSON in, owned-v-owned matches out. Malformed events are skipped, never thrown. */
export function parseScoreboard(json: unknown): EspnMatch[] {
  const events = (json as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  const out: EspnMatch[] = [];
  for (const ev of events as RawEvent[]) {
    try {
      const c = ev.competitions?.[0];
      const h = c?.competitors?.find((x) => x.homeAway === 'home');
      const a = c?.competitors?.find((x) => x.homeAway === 'away');
      const homeClubId = CLUB_BY_ESPN.get(String(h?.team?.id));
      const awayClubId = CLUB_BY_ESPN.get(String(a?.team?.id));
      if (!h || !a || !homeClubId || !awayClubId) continue; // not two of our clubs: not ours
      const home = Number(h.score);
      const away = Number(a.score);
      const goals: Goal[] = [];
      for (const d of c?.details ?? []) {
        // team.id on a scoring play is the side CREDITED with the goal, which
        // for an own goal is the opponent of the player who scored it.
        if (!d.scoringPlay || d.shootout) continue;
        const clubId = CLUB_BY_ESPN.get(String(d.team?.id));
        const who = d.athletesInvolved?.[0];
        if (!clubId || !who) continue;
        goals.push({
          minute: String(d.clock?.displayValue ?? '').trim(),
          player: who.shortName || who.displayName || '?',
          clubId,
          ...(d.penaltyKick ? { pen: true } : {}),
          ...(d.ownGoal ? { og: true } : {}),
        });
      }
      // Shootout kicks are counted separately and never enter the score.
      let shootout: { home: number; away: number } | null = null;
      for (const d of c?.details ?? []) {
        if (!d.scoringPlay || !d.shootout) continue;
        const clubId = CLUB_BY_ESPN.get(String(d.team?.id));
        if (!clubId) continue;
        shootout ??= { home: 0, away: 0 };
        if (clubId === homeClubId) shootout.home++; else shootout.away++;
      }
      const adds = Number.isFinite(home) && Number.isFinite(away)
        && goals.filter((g) => g.clubId === homeClubId).length === home
        && goals.filter((g) => g.clubId === awayClubId).length === away;
      out.push({
        espnId: String(ev.id ?? ''),
        kickoffUtc: String(ev.date ?? ''),
        status: String(ev.status?.type?.name ?? ''),
        completed: ev.status?.type?.completed === true,
        homeClubId, awayClubId, home, away,
        goals: adds ? goals : [],
        shootout,
        note: c?.notes?.find((n) => n.headline)?.headline ?? ev.season?.slug ?? null,
        clock: ev.status?.displayClock ? String(ev.status.displayClock) : null,
        period: Number.isFinite(Number(ev.status?.period)) ? Number(ev.status?.period) : null,
      });
    } catch { /* one malformed event never sinks the rest */ }
  }
  return out;
}

/** The ESPN match for one of our fixtures: same two clubs in either order, kickoff within 36h. */
export function findMatch(list: EspnMatch[], homeClubId: string, awayClubId: string, kickoffIso: string | null): EspnMatch | null {
  const k = kickoffIso ? Date.parse(kickoffIso) : NaN;
  for (const m of list) {
    const near = !Number.isFinite(k) || Math.abs(Date.parse(m.kickoffUtc) - k) < 36 * 3600 * 1000;
    if (!near) continue;
    if ((m.homeClubId === homeClubId && m.awayClubId === awayClubId) || (m.homeClubId === awayClubId && m.awayClubId === homeClubId)) return m;
  }
  return null;
}

/**
 * A result for the scoring engine.
 *
 * ESPN's final score is the score at the END of play, so for a tie that went
 * to extra time that figure is the 120-minute score — exactly what the engine
 * wants in `scoreAt120`. The 90-minute score is then derived from the goal
 * minutes (stoppage time folded back, so 90'+5' still counts as 90'). That
 * derivation only happens when the goal list adds up to the final score; with
 * no usable goal list, this returns null and the fixture waits rather than
 * guessing. Penalty shootout kicks are counted separately and never touch the
 * margin.
 *
 * Every cup tie is a knockout, so nothing from here is ever auto-written: the
 * poller routes knockout proposals to the Commissioner's Approve button.
 */
export function toNormalised(m: EspnMatch, competitionCode: string, round: string): NormalisedResult | null {
  if (!m.completed || !DONE.has(m.status)) return null;
  if (!Number.isInteger(m.home) || !Number.isInteger(m.away) || m.home < 0 || m.away < 0) return null;

  const pens = WENT_TO_PENS.test(m.status);
  const extraTime = pens || WENT_TO_ET.test(m.status);
  const base = {
    competitionCode, round,
    homeClubId: m.homeClubId, awayClubId: m.awayClubId,
    kickoffUtc: m.kickoffUtc,
    // deliberately no providerFixtureId: that column holds football-data ids
    provider: 'espn',
  };

  if (!extraTime) {
    return { ...base, scoreAt90: { home: m.home, away: m.away }, scoreAt120: null, shootout: null, terminalStatus: 'FT' };
  }

  // Extra time: ESPN's score is at 120'. Recover 90' from the goal minutes.
  if (!m.goals.length && (m.home > 0 || m.away > 0)) return null;
  const at90 = {
    home: m.goals.filter((g) => g.clubId === m.homeClubId && minuteOf(g) <= 90).length,
    away: m.goals.filter((g) => g.clubId === m.awayClubId && minuteOf(g) <= 90).length,
  };
  if (at90.home > m.home || at90.away > m.away) return null; // inconsistent feed
  if (pens && (!m.shootout || m.shootout.home === m.shootout.away)) return null;

  return {
    ...base,
    scoreAt90: at90,
    scoreAt120: { home: m.home, away: m.away },
    shootout: pens ? m.shootout : null,
    terminalStatus: pens ? 'PEN' : 'AET',
  };
}

/** Goals only if they add up to the score actually being recorded, in our fixture's orientation. */
export function goalsMatching(goals: Goal[], homeClubId: string, h: number, awayClubId: string, a: number): Goal[] {
  const hc = goals.filter((g) => g.clubId === homeClubId).length;
  const ac = goals.filter((g) => g.clubId === awayClubId).length;
  return hc === h && ac === a ? goals : [];
}

// ESPN files a match under its US Eastern date.
const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function espnDateOf(iso: string): string {
  return etDate.format(new Date(iso)).replace(/-/g, '');
}

/**
 * One league, one ESPN date — or, with no date, whatever ESPN considers the
 * current round, which is how a cup tie is found before anyone has a date for
 * it. Never throws; a timeout or a bad response is [].
 */
export async function espnScoreboard(compId: string, yyyymmdd?: string, timeoutMs = 8000): Promise<EspnMatch[]> {
  const lg = ESPN_LEAGUE[compId];
  if (!lg) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${lg}/scoreboard${yyyymmdd ? `?dates=${yyyymmdd}` : ''}`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return [];
    return parseScoreboard(await r.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Cups ESPN is the ONLY source for: football-data's free tier carries none of them. */
export const ESPN_ONLY_COMPS = ['facup', 'copadelrey', 'coppa', 'dfbpokal', 'communityshield', 'dflsupercup'] as const;

/** Competition code the scoring engine expects, by our competition id. */
export const ENGINE_CODE: Record<string, string> = {
  facup: 'FA_CUP', copadelrey: 'COPA_DEL_REY', coppa: 'COPPA_ITALIA', dfbpokal: 'DFB_POKAL',
  communityshield: 'COMMUNITY_SHIELD', dflsupercup: 'DFL_SUPERCUP',
};

/** ESPN's round name for a tie, humanised to match what the fixtures table stores. */
export function espnRound(name: string | null | undefined): string {
  const s = String(name ?? '').toLowerCase();
  if (/semi/.test(s)) return 'Semi-final';
  if (/quarter/.test(s)) return 'Quarter-final';
  if (/round of 16|last 16/.test(s)) return 'Round of 16';
  const m = s.match(/round\s*(\d+)/);
  if (m) return `Round ${m[1]}`;
  if (/final/.test(s)) return 'Final';
  // A one-off cup has no round notes, so ESPN falls back to the season slug
  // ("2026-english-fa-community-shield"). Never print that at a human.
  if (!s || /^[a-z0-9]+(-[a-z0-9]+){2,}$/.test(s)) return 'Cup tie';
  return String(name);
}

/**
 * Every date to check for a cup: today, the next `days` days (so a tie is
 * found the moment it is drawn), and the recent past (so a result is not
 * missed if nothing ran). Plus one undated call for the current round.
 */
export function cupDates(nowMs: number, days = 10, back = 2): string[] {
  const out: string[] = [];
  for (let d = -back; d <= days; d++) out.push(espnDateOf(new Date(nowMs + d * 864e5).toISOString()));
  return [...new Set(out)];
}

/**
 * One cup, many dates, fetched CONCURRENTLY and de-duplicated by match id.
 *
 * Sequentially this was ~108 requests per schedule sync across six cups, which
 * ran the poller past its function timeout: the whole tick returned nothing and
 * no work at all got done. Concurrency plus a deadline keeps the cup pass to a
 * couple of seconds, and a slow cup is skipped rather than killing the run.
 */
export async function espnCupSweep(
  compId: string,
  dates: (string | undefined)[],
  opts: { concurrency?: number; deadlineMs?: number } = {},
): Promise<EspnMatch[]> {
  const { concurrency = 8, deadlineMs } = opts;
  const seen = new Map<string, EspnMatch>();
  for (let i = 0; i < dates.length; i += concurrency) {
    if (deadlineMs !== undefined && Date.now() > deadlineMs) break;
    const batch = await Promise.all(dates.slice(i, i + concurrency).map((d) => espnScoreboard(compId, d)));
    for (const list of batch) for (const m of list) if (!seen.has(m.espnId)) seen.set(m.espnId, m);
  }
  return [...seen.values()];
}
