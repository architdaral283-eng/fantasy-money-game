import { describe, it, expect } from 'vitest';
import { stakesFor, biggestSwing, ceilingFloor, formString, activeLosingStreak, pickTaunt } from '@/lib/stats/projections';

describe('stakes + projections (pure arithmetic)', () => {
  it('stakes scale with thrashing upside', () => {
    expect(stakesFor(2)).toEqual({ base: 1000, ifBig: 2000 });
  });

  it('biggest swing names the trophy when it beats a fixture', () => {
    const s = biggestSwing([
      { code: 'UCL', name: 'Champions League', winnerPrize: 6000, eachOtherPays: 2000 },
      { code: 'FA_CUP', name: 'FA Cup', winnerPrize: 1500, eachOtherPays: 500 },
    ]);
    expect(s).toEqual({ label: 'Champions League trophy', swing: 8000 });
  });

  it('ceiling and floor bracket the present', () => {
    const { best, worst } = ceilingFloor(1000, 8, [3000], [1000]);
    expect(best).toBe(1000 + 8000 + 3000);
    expect(worst).toBe(1000 - 8000 - 1000);
  });

  it('form reads most-recent-first', () => {
    const ev = [
      { player: 'a', outcome: 'W' as const, at: '2026-09-01' },
      { player: 'a', outcome: 'L' as const, at: '2026-09-03' },
      { player: 'a', outcome: 'L' as const, at: '2026-09-05' },
    ];
    expect(formString(ev, 'a', 5)).toBe('LLW');
    expect(activeLosingStreak(ev, 'a')).toBe(2);
  });

  it('taunt picks the harshest true fact and never invents', () => {
    expect(pickTaunt('Anmol', { grossLost: 1000, streak: 4, biggestSingleLoss: 500, last7: { w: 1, l: 4 } }, ''))
      .toBe('Anmol has lost 4 counted fixtures in a row.');
    expect(pickTaunt('Anmol', { grossLost: 0, streak: 0, biggestSingleLoss: 0, last7: { w: 5, l: 0 } }, ''))
      .toBe('Anmol has nothing to be taunted for. Yet.');
  });
});
