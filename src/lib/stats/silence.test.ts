import { describe, it, expect } from 'vitest';
import { silentPlayers } from '@/lib/stats/silence';
import { buildSilenceLine } from '@/lib/notify/format';

const NOW = Date.parse('2026-10-28T18:00:00Z');
const ago = (days: number) => new Date(NOW - days * 864e5).toISOString();
const PLAYERS = ['archit', 'vedant', 'harshal', 'anmol'] as const;

describe('who has stopped talking', () => {
  it('names only those past the threshold, longest first', () => {
    const out = silentPlayers(
      { archit: ago(0), vedant: ago(1), harshal: ago(4), anmol: ago(9) },
      PLAYERS, NOW,
    );
    expect(out.map((r) => r.player)).toEqual(['anmol', 'harshal']);
    expect(out[0].days).toBe(9);
  });

  it('treats never-spoken as the worst offender', () => {
    const out = silentPlayers({ archit: ago(0), harshal: ago(5) }, PLAYERS, NOW);
    expect(out[0].days).toBeNull();
    expect(out.map((r) => r.player).slice(0, 2)).toEqual(['vedant', 'anmol']);
  });

  it('survives a corrupt timestamp instead of reporting NaN days', () => {
    const out = silentPlayers({ archit: 'not-a-date' }, ['archit'], NOW);
    expect(out[0].days).toBeNull();
  });

  it('says nothing when everyone has been talking', () => {
    expect(silentPlayers(
      { archit: ago(0), vedant: ago(1), harshal: ago(2), anmol: ago(0) }, PLAYERS, NOW,
    )).toEqual([]);
  });

  it('respects a different threshold', () => {
    expect(silentPlayers({ archit: ago(4) }, ['archit'], NOW, 7)).toEqual([]);
  });
});

describe('the silence line', () => {
  it('is null when there is nothing to say', () => {
    expect(buildSilenceLine([])).toBeNull();
  });

  it('names one man and his balance', () => {
    const t = buildSilenceLine([{ name: 'Harshal', days: 4, net: -2500 }])!;
    expect(t).toContain('Harshal');
    expect(t).toContain('4 days');
  });

  it('varies with the day count so it does not read the same every night', () => {
    const lines = [3, 4, 5].map((d) => buildSilenceLine([{ name: 'Harshal', days: d, net: -2500 }]));
    expect(new Set(lines).size).toBe(3);
  });

  it('lists several properly', () => {
    const t = buildSilenceLine([
      { name: 'Anmol', days: 9, net: -3000 },
      { name: 'Harshal', days: 4, net: -500 },
    ])!;
    expect(t).toContain('Anmol and Harshal');
    expect(t).toContain('9');
  });

  it('has a line for never having spoken at all', () => {
    const t = buildSilenceLine([{ name: 'Anmol', days: null, net: 0 }])!;
    expect(t).toContain('not said one word');
  });
});
