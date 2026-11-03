import { describe, expect, it } from 'vitest';
import { buildPositions, type PositionBlock } from '@/lib/notify/format';

const epl: PositionBlock = {
  label: 'Premier League',
  lines: [
    { rank: 1, club: 'Man City', owner: 'Harshal', points: 21 },
    { rank: 17, club: 'Man Utd', owner: 'Vedant', points: 7 },
  ],
};
const laliga: PositionBlock = {
  label: 'La Liga',
  lines: [
    { rank: 1, club: 'Barcelona', owner: 'Anmol', points: 30 },
    { rank: 3, club: 'Real Madrid', owner: 'Vedant', points: 24 },
  ],
};

describe('buildPositions', () => {
  it('is null with nothing to print', () => {
    expect(buildPositions([], 'Tue, 3 Nov')).toBeNull();
  });

  it('fits a phone: no table line over 30 characters', () => {
    // THE BUG. The first version was 34 wide. Telegram wraps a <pre> block
    // at roughly 30 on a phone, so every points value fell onto its own
    // line and the table was unreadable.
    const out = buildPositions([epl, laliga], 'Tue, 3 Nov') ?? '';
    const tableLines = out.replace(/<[^>]+>/g, '').split('\n')
      .filter((l) => /^\s*(\d+|–)\s/.test(l));
    expect(tableLines.length).toBeGreaterThan(0);
    for (const l of tableLines) expect(l.length).toBeLessThanOrEqual(30);
  });

  it('keeps the points column aligned down a block', () => {
    const out = buildPositions([epl], 'Tue, 3 Nov') ?? '';
    const lines = out.replace(/<[^>]+>/g, '').split('\n').filter((l) => l.includes('Harshal') || l.includes('Vedant'));
    expect(lines).toHaveLength(2);
    // Points are right-aligned in a fixed three-wide column, so a 7 and a 21
    // end in the same place. Compare the column, not the first digit.
    expect(lines[0].slice(16, 19)).toBe(' 21');
    expect(lines[1].slice(16, 19)).toBe('  7');
  });

  it('leaves a gutter even on the longest short name', () => {
    const out = buildPositions([
      { label: 'Premier League', lines: [{ rank: 9, club: 'Aston Villa', owner: 'Anmol', points: 12 }] },
    ], 'Tue, 3 Nov') ?? '';
    expect(out).toContain('Aston Villa  12');
  });

  it('prints a dash rather than a zeroth place when ESPN has no rank', () => {
    const out = buildPositions([{ label: 'Champions League', lines: [{ rank: 0, club: 'Inter', owner: 'Anmol', points: 7 }] }], 'Tue, 3 Nov') ?? '';
    expect(out).toContain('–');
    expect(out).not.toMatch(/\b0\s+Inter/);
  });

  it('separates each board with a blank line', () => {
    const out = buildPositions([epl, laliga], 'Tue, 3 Nov') ?? '';
    expect(out.indexOf('La Liga')).toBeGreaterThan(out.indexOf('Man Utd'));
  });

  it('escapes club names for HTML parse_mode', () => {
    const out = buildPositions([{ label: 'Serie A', lines: [{ rank: 3, club: 'A & B', owner: 'Archit', points: 9 }] }], 'Tue, 3 Nov') ?? '';
    expect(out).toContain('A &amp; B');
  });

  it('headers with the date read, not the award month', () => {
    // These are live tables sent beside the October awards. Labelling them
    // "October 2026" said they were October's, while the footer said
    // otherwise.
    const out = buildPositions([epl], 'Tue, 3 Nov') ?? '';
    expect(out.startsWith('POSITIONS · Tue, 3 Nov')).toBe(true);
  });
});
