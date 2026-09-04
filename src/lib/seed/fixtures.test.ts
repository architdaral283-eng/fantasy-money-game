import { describe, it, expect } from 'vitest';
import { bootCheck, generateLeagueFixtures, uclFixtures } from '@/lib/seed/fixtures';

describe('Seed + boot assertions (§4.5)', () => {
  it('generates 48 league fixtures, 12 per league', () => {
    const f = generateLeagueFixtures();
    expect(f).toHaveLength(48);
    for (const lg of ['Premier League', 'La Liga', 'Bundesliga', 'Serie A']) {
      expect(f.filter((x) => x.competition === lg)).toHaveLength(12);
    }
  });

  it('holds exactly 21 hand-entered UCL ties, 6 same-owner', () => {
    const u = uclFixtures();
    expect(u).toHaveLength(21);
    expect(u.filter((x) => x.sameOwner)).toHaveLength(6);
  });

  it('boot check reconciles: 69 logged / 63 paying / 10-9-7-4', () => {
    const c = bootCheck();
    expect(c.errors).toEqual([]);
    expect(c.ok).toBe(true);
    expect(c.totalLogged).toBe(69);
    expect(c.payingCount).toBe(63);
    expect(c.uclPerPlayer).toEqual({ archit: 7, vedant: 9, harshal: 10, anmol: 4 });
  });
});
