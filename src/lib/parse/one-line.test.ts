import { describe, it, expect } from 'vitest';
import { parseOneLine } from '@/lib/parse/one-line';

describe('one-line parser — one-off cups', () => {
  it('parses DFL-Supercup incl. alias', () => {
    const r = parseOneLine('Bayern Munich 2-1 Dortmund - DFL-Supercup');
    expect(r).toMatchObject({ homeClubId: 'bayern', awayClubId: 'dortmund', homeGoals: 2, awayGoals: 1, competitionCode: 'DFL_SUPERCUP' });
    const r2 = parseOneLine('Bayern 2-1 Dortmund - Bundesliga Super Cup');
    expect(r2).toMatchObject({ competitionCode: 'DFL_SUPERCUP' });
  });

  it('parses Community Shield', () => {
    const r = parseOneLine('Arsenal 1-0 Manchester City - Community Shield');
    expect(r).toMatchObject({ homeClubId: 'arsenal', awayClubId: 'man-city', competitionCode: 'COMMUNITY_SHIELD' });
  });

  it('accepts en dash separators and short aliases', () => {
    expect(parseOneLine('Arsenal 2–0 Man City - EPL')).toMatchObject({ competitionCode: 'EPL' });
    expect(parseOneLine('BVB 2-1 Bayern - Bundesliga')).toMatchObject({ homeClubId: 'dortmund', competitionCode: 'BUNDESLIGA' });
    expect(parseOneLine('Atleti 1-0 Barca - La Liga')).toMatchObject({ homeClubId: 'atletico', awayClubId: 'barcelona' });
    expect(parseOneLine('Inter 1-0 Juve - Coppa')).toMatchObject({ competitionCode: 'COPPA_ITALIA' });
    expect(parseOneLine('Betis 1-0 Madrid - Copa')).toMatchObject({ competitionCode: 'COPA_DEL_REY' });
    expect(parseOneLine('Arsenal 1-0 City - CL')).toMatchObject({ competitionCode: 'UCL' });
  });

  it('names unowned clubs explicitly as a rule, not an error', () => {
    const r = parseOneLine('Arsenal 2-0 Liverpool - Premier League');
    expect('error' in r && r.error).toMatch(/isn't owned by anyone/);
  });
});
