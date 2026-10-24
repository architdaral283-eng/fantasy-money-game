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

const CLUB_BY_ESPN = new Map<string, string>(
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
}

interface RawDetail {
  clock?: { displayValue?: string };
  team?: { id?: string | number };
  scoringPlay?: boolean; penaltyKick?: boolean; ownGoal?: boolean; shootout?: boolean;
  athletesInvolved?: { displayName?: string; shortName?: string }[];
}
interface RawEvent {
  id?: string | number; date?: string;
  status?: { type?: { name?: string; completed?: boolean } };
  competitions?: { competitors?: { homeAway?: string; score?: string | number; team?: { id?: string | number } }[]; details?: RawDetail[] }[];
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
 * A 90-minute result for the scoring engine. Only a plain full-time finish
 * qualifies: extra time and penalties need a 90-minute score ESPN does not
 * give, and knockout ties go to the Commissioner regardless.
 */
export function toNormalised(m: EspnMatch, competitionCode: string, round: string): NormalisedResult | null {
  if (!m.completed || m.status !== 'STATUS_FULL_TIME') return null;
  if (!Number.isInteger(m.home) || !Number.isInteger(m.away) || m.home < 0 || m.away < 0) return null;
  return {
    competitionCode, round,
    homeClubId: m.homeClubId, awayClubId: m.awayClubId,
    scoreAt90: { home: m.home, away: m.away },
    scoreAt120: null, shootout: null,
    terminalStatus: 'FT',
    kickoffUtc: m.kickoffUtc,
    // deliberately no providerFixtureId: that column holds football-data ids
    provider: 'espn',
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

/** One league, one ESPN date. Never throws; a timeout or a bad response is []. */
export async function espnScoreboard(compId: string, yyyymmdd: string, timeoutMs = 8000): Promise<EspnMatch[]> {
  const lg = ESPN_LEAGUE[compId];
  if (!lg) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${lg}/scoreboard?dates=${yyyymmdd}`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return [];
    return parseScoreboard(await r.json());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
