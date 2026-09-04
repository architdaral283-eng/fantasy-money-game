// football-data.org adapter — primary for PL/PD/BL1/SA/CL (§5.1).
// Docs: regularTime = 90' goals, extraTime = ET goals ONLY, fullTime = total.
// Normalised scoreAt120 = regularTime + extraTime (cumulative at 120').
// Penalty shootout winner is NOT in the score fields; aggregatedScore + penalties
// handled via `score.penalties` on finished knockout ties — when absent, MANUAL REVIEW.
import type { FootballDataProvider, FixtureQuery } from './types';
import type { NormalisedResult, TerminalStatus } from '@/lib/scoring/engine';
import { TEAM_ID_MAP } from '@/lib/providers/team-ids';

const BASE = 'https://api.football-data.org/v4';
const FD_COMP: Record<string, string> = {
  EPL: 'PL', LA_LIGA: 'PD', BUNDESLIGA: 'BL1', SERIE_A: 'SA', UCL: 'CL',
};

function reverseLookup(providerTeamId: number): string | null {
  for (const [clubId, ids] of Object.entries(TEAM_ID_MAP)) {
    if (ids['football-data'] === providerTeamId) return clubId;
  }
  return null;
}

/** Schedule row — no scores, works for future fixtures (the results adapter skips those). */
export interface ScheduleRow {
  providerFixtureId: string;
  kickoffUtc: string;
  homeClubId: string;
  awayClubId: string;
  finished: boolean;
}

/** Normalize a provider stage name to our round. UCL league phase is 'League Stage' in v4. */
export function normalizeRound(competitionCode: string, stage: string): string {
  if (competitionCode !== 'UCL') return 'League';
  if (/league|group/i.test(stage)) return 'League Phase';
  return stage;
}

export class FootballDataOrgProvider implements FootballDataProvider {
  readonly name = 'football-data' as const;
  constructor(private token: string) {}

  private async call(path: string): Promise<{ json: unknown; remaining?: number }> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-Auth-Token': this.token },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`football-data ${res.status} on ${path}: ${body.slice(0, 300)}`);
    }
    return { json: await res.json() };
  }

  async listFixtures(q: FixtureQuery): Promise<NormalisedResult[]> {
    const fd = FD_COMP[q.competitionCode];
    if (!fd) return []; // cups not covered — API-Football's job
    let path = `/competitions/${fd}/matches?season=2026`;
    if (q.dateFrom && q.dateTo) path += `&dateFrom=${q.dateFrom}&dateTo=${q.dateTo}`;
    const { json } = await this.call(path);
    const matches = (json as { matches?: unknown[] }).matches ?? [];
    const out: NormalisedResult[] = [];
    for (const m of matches) {
      const n = this.normalise(m);
      if (n) out.push(n);
    }
    return out;
  }

  async getFixture(providerFixtureId: string): Promise<NormalisedResult | null> {
    const { json } = await this.call(`/matches/${providerFixtureId}`);
    return this.normalise((json as { match?: unknown }).match ?? json);
  }

  /** Full schedule incl. future fixtures where BOTH clubs are owned. No scores parsed. */
  async listSchedule(q: FixtureQuery): Promise<ScheduleRow[]> {
    const fd = FD_COMP[q.competitionCode];
    if (!fd) return [];
    let path = `/competitions/${fd}/matches?season=2026`;
    if (q.dateFrom && q.dateTo) path += `&dateFrom=${q.dateFrom}&dateTo=${q.dateTo}`;
    const { json } = await this.call(path);
    const matches = (json as { matches?: unknown[] }).matches ?? [];
    const out: ScheduleRow[] = [];
    for (const m of matches) {
      const x = m as {
        id: number; utcDate: string; status: string;
        homeTeam: { id: number }; awayTeam: { id: number };
      };
      const homeClubId = reverseLookup(x.homeTeam.id);
      const awayClubId = reverseLookup(x.awayTeam.id);
      if (!homeClubId || !awayClubId) continue;
      out.push({
        providerFixtureId: String(x.id), kickoffUtc: x.utcDate,
        homeClubId, awayClubId, finished: x.status === 'FINISHED',
      });
    }
    return out;
  }

  /** Exported for the verification script (§5.4). */
  normalise(m: unknown): NormalisedResult | null {
    const x = m as {
      id: number; utcDate: string; status: string;
      competition: { code: string }; stage?: string;
      homeTeam: { id: number }; awayTeam: { id: number };
      score: {
        fullTime: { home: number | null; away: number | null };
        regularTime?: { home: number | null; away: number | null };
        extraTime?: { home: number | null; away: number | null };
        penalties?: { home: number | null; away: number | null };
      };
    };
    const homeClubId = reverseLookup(x.homeTeam.id);
    const awayClubId = reverseLookup(x.awayTeam.id);
    if (!homeClubId || !awayClubId) return null; // unowned — discard at ingestion (§3.1)
    const reg = x.score.regularTime ?? x.score.fullTime;
    if (reg.home == null || reg.away == null) return null; // not started / missing → never guess
    const et = x.score.extraTime;
    const hasET = et != null && (et.home != null || et.away != null);
    // scoreAt120 is CUMULATIVE: regular + ET goals (football-data documents ET-only)
    const scoreAt120 =
      hasET && et.home != null && et.away != null
        ? { home: reg.home + et.home, away: reg.away + et.away }
        : null;
    const pen = x.score.penalties;
    const shootout =
      pen != null && pen.home != null && pen.away != null
        ? { home: pen.home, away: pen.away }
        : null;
    let terminal: TerminalStatus = 'FT';
    if (x.status === 'FINISHED') terminal = shootout ? 'PEN' : hasET ? 'AET' : 'FT';
    else if (x.status === 'POSTPONED') terminal = 'POSTPONED';
    else if (x.status === 'SUSPENDED' || x.status === 'CANCELLED') terminal = 'CANCELLED';
    else return null; // IN_PLAY / SCHEDULED / TIMED → not terminal, skip
    return {
      competitionCode: fdCodeToOurs(x.competition.code),
      round: normalizeRound(fdCodeToOurs(x.competition.code), x.stage ?? 'League'),
      homeClubId, awayClubId,
      scoreAt90: { home: reg.home, away: reg.away },
      scoreAt120, shootout,
      terminalStatus: terminal,
      kickoffUtc: x.utcDate,
      providerFixtureId: String(x.id),
      provider: 'football-data',
    };
  }
}

function fdCodeToOurs(fd: string): string {
  const rev: Record<string, string> = { PL: 'EPL', PD: 'LA_LIGA', BL1: 'BUNDESLIGA', SA: 'SERIE_A', CL: 'UCL' };
  return rev[fd] ?? fd;
}
