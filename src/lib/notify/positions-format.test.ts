import { describe, expect, it } from 'vitest';
import { buildPositions, type PositionBlock } from '@/lib/notify/format';

const epl: PositionBlock = {
  label: 'Premier League',
  lines: [
    { rank: 1, club: 'Arsenal', owner: 'Archit', points: 24 },
    { rank: 4, club: 'Manchester City', owner: 'Harshal', points: 19 },
    { rank: 7, club: 'Manchester United', owner: 'Vedant', points: 15 },
    { rank: 11, club: 'Aston Villa', owner: 'Anmol', points: 12 },
  ],
};

describe('buildPositions', () => {
  it('is null with nothing to print', () => {
    expect(buildPositions([], 'November 2026')).toBeNull();
  });

  it('prints rank, club, owner and points, columns aligned', () => {
    const out = buildPositions([epl], 'November 2026') ?? '';
    expect(out).toContain('November 2026');
    expect(out).toContain('Premier League');
    const lines = out.split('\n').filter((l) => l.includes('Arsenal') || l.includes('Aston Villa'));
    expect(lines).toHaveLength(2);
    // The points column lands in the same place on both rows.
    expect(lines[0].lastIndexOf('24')).toBe(lines[1].lastIndexOf('12'));
  });

  it('prints a dash rather than a zeroth place when ESPN has no rank', () => {
    const out = buildPositions([{ label: 'Champions League', lines: [{ rank: 0, club: 'Inter', owner: 'Anmol', points: 7 }] }], 'November 2026') ?? '';
    expect(out).toContain('–');
    expect(out).not.toMatch(/\b0\s+Inter/);
  });

  it('separates each board with a blank line', () => {
    const out = buildPositions([epl, { label: 'La Liga', lines: [{ rank: 2, club: 'Real Madrid', owner: 'Vedant', points: 22 }] }], 'November 2026') ?? '';
    expect(out).toContain('Premier League');
    expect(out).toContain('La Liga');
    expect(out.indexOf('La Liga')).toBeGreaterThan(out.indexOf('Aston Villa'));
  });

  it('escapes club names for HTML parse_mode', () => {
    const out = buildPositions([{ label: 'Serie A', lines: [{ rank: 3, club: 'A & B', owner: 'Archit', points: 9 }] }], 'November 2026') ?? '';
    expect(out).toContain('A &amp; B');
  });
});
