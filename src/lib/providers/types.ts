// Provider abstraction — §5.1. Every ingestion path goes through this
// interface. Swapping to a paid provider later is a one-file change.
import type { NormalisedResult } from '@/lib/scoring/engine';

export interface FixtureQuery {
  competitionCode: string; // our canonical code: 'EPL' | 'UCL' | ...
  season: string; // '2026'
  matchday?: number;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
}

export interface FootballDataProvider {
  readonly name: 'football-data' | 'api-football';
  listFixtures(q: FixtureQuery): Promise<{ results: NormalisedResult[]; total: number }>;
  getFixture(providerFixtureId: string): Promise<NormalisedResult | null>;
}

/** Raw payloads are ALWAYS stored as JSONB on the result row (§5.4). */
export function mustStoreRawPayload(r: NormalisedResult): boolean {
  return true;
}
