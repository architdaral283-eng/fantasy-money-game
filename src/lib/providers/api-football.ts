// API-Football adapter — the ONLY source for the four domestic cups (§5.1).
// Free tier: 100 req/day. Quota enforced in code via api_call_log (§5.2).
// Field semantics (verify with scripts/verify-score-semantics.ts before trusting):
//   score.halftime/fulltime/extratime/penalty + fixture.status.short ∈ FT|AET|PEN.
//   `extratime` holds goals scored IN extra time or cumulative — the verification
//   script asserts the interpretation against known historical fixtures.
import type { FootballDataProvider, FixtureQuery } from './types';
import type { NormalisedResult, TerminalStatus } from '@/lib/scoring/engine';
import { TEAM_ID_MAP } from '@/lib/providers/team-ids';

const BASE = 'https://v3.football.api-sports.io';
const AF_LEAGUE: Record<string, number> = {
  EPL: 39, LA_LIGA: 140, BUNDESLIGA: 78, SERIE_A: 135, UCL: 2,
  FA_CUP: 45, COPA_DEL_REY: 143, COPPA_ITALIA: 137, DFB_POKAL: 81,
};

function reverseLookup(providerTeamId: number): string | null {
  for (const [clubId, ids] of Object.entries(TEAM_ID_MAP)) {
    if (ids['api-football'] === providerTeamId) return clubId;
  }
  return null;
}

export class ApiFootballProvider implements FootballDataProvider {
  readonly name = 'api-football' as const;
  constructor(private key: string) {}

  private async call(path: string): Promise<unknown> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-apisports-key': this.key },
    });
    if (!res.ok) throw new Error(`api-football ${res.status} on ${path}`);
    const json = (await res.json()) as { response?: unknown[] };
    return json.response ?? [];
  }

  async listFixtures(q: FixtureQuery): Promise<NormalisedResult[]> {
    const league = AF_LEAGUE[q.competitionCode];
    if (!league) return [];
    let path = `/fixtures?league=${league}&season=2026`;
    if (q.dateFrom && q.dateTo) path += `&from=${q.dateFrom}&to=${q.dateTo}`;
    const rows = (await this.call(path)) as unknown[];
    const out: NormalisedResult[] = [];
    for (const r of rows) {
      const n = this.normalise(r, q.competitionCode);
      if (n) out.push(n);
    }
    return out;
  }

  async getFixture(providerFixtureId: string): Promise<NormalisedResult | null> {
    const rows = (await this.call(`/fixtures?id=${providerFixtureId}`)) as unknown[];
    if (!rows.length) return null;
    return this.normalise(rows[0], '');
  }

  /** Exported for the verification script (§5.4). */
  normalise(r: unknown, fallbackComp: string): NormalisedResult | null {
    const x = r as {
      fixture: { id: number; date: string; status: { short: string } };
      league: { name: string; round: string };
      teams: { home: { id: number }; away: { id: number } };
      score: {
        halftime: { home: number | null; away: number | null };
        fulltime: { home: number | null; away: number | null };
        extratime: { home: number | null; away: number | null };
        penalty: { home: number | null; away: number | null };
      };
    };
    const homeClubId = reverseLookup(x.teams.home.id);
    const awayClubId = reverseLookup(x.teams.away.id);
    if (!homeClubId || !awayClubId) return null;
    const short = x.fixture.status.short;
    let terminal: TerminalStatus | null = null;
    if (short === 'FT') terminal = 'FT';
    else if (short === 'AET') terminal = 'AET';
    else if (short === 'PEN') terminal = 'PEN';
    else if (short === 'PST') terminal = 'POSTPONED';
    else if (['ABD', 'AWD', 'WO', 'CANC'].includes(short)) terminal = 'ABANDONED';
    else return null;
    const ft = x.score.fulltime;
    if (ft.home == null || ft.away == null) return null;
    // fulltime here is the 90' score when ET was played (halftime/fulltime/extra split).
    // scoreAt120 = fulltime + extratime goals.
    const et = x.score.extratime;
    const hasET = terminal === 'AET' || terminal === 'PEN';
    const scoreAt120 =
      hasET && et.home != null && et.away != null
        ? { home: ft.home + et.home, away: ft.away + et.away }
        : null;
    const pen = x.score.penalty;
    const shootout =
      terminal === 'PEN' && pen.home != null && pen.away != null
        ? { home: pen.home, away: pen.away }
        : terminal === 'PEN'
          ? null // null penalty score → engine routes to MANUAL REVIEW (§3.9)
          : null;
    return {
      competitionCode: fallbackComp || 'UCL',
      round: x.league.round ?? 'League',
      homeClubId, awayClubId,
      scoreAt90: { home: ft.home, away: ft.away },
      scoreAt120, shootout,
      terminalStatus: terminal,
      kickoffUtc: x.fixture.date,
      providerFixtureId: String(x.fixture.id),
      provider: 'api-football',
    };
  }
}

/** Quota guard (§5.2): call this before every API-Football request. */
export function apiFootballQuotaOk(callsToday: number, remaining: number): { ok: boolean; reason?: string } {
  if (remaining < 15) {
    return { ok: false, reason: `Only ${remaining} API-Football calls left today — deferring non-urgent work, Commissioner alerted.` };
  }
  if (callsToday >= 100) return { ok: false, reason: 'Daily 100-call cap reached.' };
  return { ok: true };
}
