import { describe, expect, it } from 'vitest';
import { orderXI, positionRank, positionDepth, positionLateral, outfieldRows } from '@/lib/images/lineups';
import type { LineupSlot } from '@/lib/providers/espn-lineups';

const p = (name: string, pos: string | null, place: number | null = null): LineupSlot => ({ name, pos, place });

// Bayern v Dortmund, 31 Oct 2026, in the order ESPN actually listed them.
const BAYERN: LineupSlot[] = [
  p('Neuer', 'G'), p('Kim', 'D'), p('Upamecano', 'D'), p('Davies', 'D'), p('Laimer', 'D'),
  p('Kane', 'F'), p('Kimmich', 'M'), p('Pavlovic', 'M'), p('Olise', 'M'), p('Musiala', 'M'), p('Gnabry', 'M'),
];

describe('positionRank', () => {
  it('reads the four bands off ESPN abbreviations', () => {
    expect(positionRank('G')).toBe(0);
    expect(positionRank('D')).toBe(1);
    expect(positionRank('M')).toBe(2);
    expect(positionRank('F')).toBe(3);
  });

  it('handles the finer abbreviations some feeds use', () => {
    expect(positionRank('GK')).toBe(0);
    expect(positionRank('CB')).toBe(1);
    expect(positionRank('LB')).toBe(1);
    expect(positionRank('RWB')).toBe(1);
    expect(positionRank('ST')).toBe(3);
    expect(positionRank('LW')).toBe(3);
  });

  it('does NOT read a defensive midfielder as a defender', () => {
    // 'DM' starts with D. A prefix test would put the holding midfielder
    // in the back four and push a real defender forward.
    expect(positionRank('DM')).toBe(2);
    expect(positionRank('CDM')).toBe(2);
  });

  it('guesses midfield when ESPN says nothing', () => {
    expect(positionRank(null)).toBe(2);
    expect(positionRank('')).toBe(2);
    expect(positionRank('WTF')).toBe(2);
  });
});

// Read off /api/og/lineup?debug=1 during the live match, 31 Oct 2026.
const BAYERN_REAL: LineupSlot[] = [
  p('J. Urbig', 'G', 1), p('K. Min-Jae', 'CD-L', 6), p('D. Upamecano', 'CD-R', 5),
  p('A. Davies', 'LB', 3), p('K. Laimer', 'RB', 2), p('I. Saibari', 'AM', 10),
  p('A. Pavlovic', 'LM', 4), p('J. Kimmich', 'RM', 8), p('H. Kane', 'F', 9),
  p('S. Gnabry', 'AM-L', 11), p('M. Olise', 'AM-R', 7),
];
const DORTMUND_REAL: LineupSlot[] = [
  p('G. Kobel', 'G', 1), p('W. Anton', 'CD', 5), p('N. Schlotterbeck', 'CD-L', 4),
  p('K. Gadou', 'CD-R', 6), p('F. Nmecha', 'CM-L', 8), p('J. Veerman', 'CM-R', 7),
  p('D. Svensson', 'LM', 3), p('M. Beier', 'RM', 2), p('S. Guirassy', 'F', 9),
  p('C. Chukwuemeka', 'CF-L', 11), p('J. Bellingham', 'CF-R', 10),
];

describe('positionLateral', () => {
  it('runs a back four from left to right', () => {
    const order = ['LB', 'CD-L', 'CD-R', 'RB'].map(positionLateral);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it('runs an attacking three from left to right', () => {
    const order = ['AM-L', 'AM', 'AM-R'].map(positionLateral);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('positionDepth', () => {
  it('puts the lone striker ahead of the two behind him', () => {
    expect(positionDepth('F')).toBeGreaterThan(positionDepth('CF-L'));
    expect(positionDepth('F')).toBeGreaterThan(positionDepth('AM'));
  });
  it('keeps wide midfielders out of the back four', () => {
    expect(positionDepth('LM')).toBe(2);
    expect(positionDepth('CD-L')).toBe(1);
  });
});

describe('orderXI', () => {
  it('puts the striker in the front row, not the midfield', () => {
    // The 31 Oct bug: ESPN listed Kane sixth, so filling 4-2-3-1 in roster
    // order drew him in the double pivot.
    const { rows } = orderXI(BAYERN, '4-2-3-1');
    expect(rows.at(-1)).toEqual(['Kane']);
    expect(rows[1]).not.toContain('Kane');
  });

  it('puts the back four in the back row', () => {
    const { rows } = orderXI(BAYERN, '4-2-3-1');
    expect(rows[0]).toEqual(['Kim', 'Upamecano', 'Davies', 'Laimer']);
  });

  it('finds the keeper by position, not by being listed first', () => {
    const shuffled = [BAYERN[1], BAYERN[0], ...BAYERN.slice(2)];
    expect(orderXI(shuffled, '4-2-3-1').keeper).toBe('Neuer');
    expect(orderXI(shuffled, '4-2-3-1').rows.flat()).not.toContain('Neuer');
  });

  it('falls back to the first man when nobody is flagged as a keeper', () => {
    const noKeeper = BAYERN.map((s) => (s.pos === 'G' ? { ...s, pos: null } : s));
    expect(orderXI(noKeeper, '4-2-3-1').keeper).toBe('Neuer');
  });

  it('does NOT use formationPlace as a layout index', () => {
    // ESPN sends formationPlace and it is NOT a left-to-right order. In the
    // real Bayern eleven below, place 2 and 3 are the full-backs, place 4 is
    // a central midfielder and places 5 and 6 are the centre-backs. Sorting
    // by it would put Pavlovic in the back four.
    const { rows } = orderXI(BAYERN_REAL, '4-2-3-1');
    expect(rows[0]).not.toContain('A. Pavlovic');
    expect(rows[0]).toContain('K. Min-Jae');
  });

  it('reproduces the real Bayern eleven from 31 Oct exactly', () => {
    const { keeper, rows } = orderXI(BAYERN_REAL, '4-2-3-1');
    expect(keeper).toBe('J. Urbig');
    // Davies at left-back and Kim at centre-back: the reported bug, inverted.
    expect(rows[0]).toEqual(['A. Davies', 'K. Min-Jae', 'D. Upamecano', 'K. Laimer']);
    expect(rows[1]).toEqual(['A. Pavlovic', 'J. Kimmich']);
    expect(rows[2]).toEqual(['S. Gnabry', 'I. Saibari', 'M. Olise']);
    expect(rows[3]).toEqual(['H. Kane']);
  });

  it('reproduces the real Dortmund eleven, where CF-L/CF-R sit behind the F', () => {
    const { keeper, rows } = orderXI(DORTMUND_REAL, '3-4-2-1');
    expect(keeper).toBe('G. Kobel');
    expect(rows[0]).toEqual(['N. Schlotterbeck', 'W. Anton', 'K. Gadou']);
    expect(rows[1]).toEqual(['D. Svensson', 'F. Nmecha', 'J. Veerman', 'M. Beier']);
    expect(rows[2]).toEqual(['C. Chukwuemeka', 'J. Bellingham']);
    expect(rows[3]).toEqual(['S. Guirassy']);
  });

  it('keeps the eleven whole for any formation', () => {
    for (const f of ['4-2-3-1', '4-3-3', '3-4-2-1', '5-3-2', null]) {
      const { keeper, rows } = orderXI(BAYERN, f);
      expect([keeper, ...rows.flat()]).toHaveLength(11);
    }
  });

  it('survives a short or empty lineup without throwing', () => {
    expect(orderXI([], '4-4-2')).toEqual({ keeper: '', rows: [] });
    expect(orderXI([p('Solo', 'G')], '4-4-2').keeper).toBe('Solo');
  });
});

describe('outfieldRows', () => {
  it('uses the formation when it adds up', () => {
    expect(outfieldRows('4-2-3-1', 10)).toEqual([4, 2, 3, 1]);
  });
  it('falls back, back-heavy, when it does not', () => {
    expect(outfieldRows('nonsense', 10).reduce((a, b) => a + b, 0)).toBe(10);
  });
});
