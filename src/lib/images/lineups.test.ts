import { describe, expect, it } from 'vitest';
import { orderXI, positionRank, outfieldRows } from '@/lib/images/lineups';
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

  it("trusts ESPN's own slot number when every outfielder carries one", () => {
    const placed = BAYERN.map((s, i) => ({ ...s, place: i === 0 ? 1 : 13 - i }));
    const { rows } = orderXI(placed, '4-2-3-1');
    // Reversed by place, so the last-listed man now leads the back row.
    expect(rows[0][0]).toBe('Gnabry');
  });

  it('ignores a partial set of slot numbers rather than half-trusting it', () => {
    const half = BAYERN.map((s, i) => (i < 4 ? { ...s, place: 20 - i } : s));
    const { rows } = orderXI(half, '4-2-3-1');
    expect(rows[0]).toEqual(['Kim', 'Upamecano', 'Davies', 'Laimer']);
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
