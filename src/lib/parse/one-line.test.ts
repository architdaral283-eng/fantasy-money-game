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
});
