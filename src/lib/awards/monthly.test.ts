import { describe, it, expect } from 'vitest';
import { monthlyAwards, monthBounds } from '@/lib/awards/monthly';
import { buildMonthlyAwards } from '@/lib/notify/format';

const PLAYERS = ['archit', 'vedant', 'harshal', 'anmol'] as const;
const OCT = { from: Date.parse('2026-09-30T18:30:00Z'), to: Date.parse('2026-10-31T18:30:00Z') };

const row = (from: string, to: string, amount: number, day: number, fixture: string | null, description = 'x') => ({
  from_player_id: from, to_player_id: to, amount_inr: amount,
  created_at: new Date(Date.parse(`2026-10-${String(day).padStart(2, '0')}T18:00:00Z`)).toISOString(),
  fixture_id: fixture, description,
});

const fixtures = [
  { id: 'f1', home_club_id: 'arsenal', away_club_id: 'real-madrid' },
  { id: 'f2', home_club_id: 'barcelona', away_club_id: 'napoli' },
  { id: 'f3', home_club_id: 'bayern', away_club_id: 'liverpool' },
];
const results = [
  { fixture_id: 'f1', h90: 0, a90: 2 },
  { fixture_id: 'f2', h90: 3, a90: 1 },
  { fixture_id: 'f3', h90: 1, a90: 1 },
];

describe('month boundaries', () => {
  it('takes the IST month before the one it is called in', () => {
    const b = monthBounds(Date.parse('2026-11-01T13:30:00Z'));
    // 1 Oct 00:00 IST and 1 Nov 00:00 IST, expressed in UTC
    expect(new Date(b.from).toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(new Date(b.to).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(b.label).toBe('October 2026');
  });

  it('counts a late-night match on the last day of the month as that month', () => {
    // 31 Oct, 23:30 IST = 31 Oct 18:00 UTC. A UTC month boundary would have
    // pushed this into October's report when IST calls it October too, but a
    // UTC-based `to` of 1 Nov 00:00 UTC would also have swallowed 1 Nov IST.
    const b = monthBounds(Date.parse('2026-11-01T13:30:00Z'));
    const lateOct = Date.parse('2026-10-31T18:00:00Z');
    const earlyNov = Date.parse('2026-10-31T19:00:00Z'); // 1 Nov 00:30 IST
    expect(lateOct >= b.from && lateOct < b.to).toBe(true);
    expect(earlyNov < b.to).toBe(false);
  });

  it('rolls back across a year end', () => {
    expect(monthBounds(Date.parse('2027-01-01T13:30:00Z')).label).toBe('December 2026');
  });

  it('still reports last month when it fires late in the day IST', () => {
    expect(monthBounds(Date.parse('2026-11-01T18:25:00Z')).label).toBe('October 2026');
  });
});

describe('monthly awards', () => {
  const ledger = [
    row('archit', 'vedant', 1000, 5, 'f1'),
    row('anmol', 'harshal', 500, 12, 'f2'),
    row('vedant', 'archit', 500, 20, null, 'correction'),
    row('harshal', 'vedant', 500, 22, null, 'correction'),
    row('archit', 'vedant', 5000, 2, 'f1', 'september, out of window'),
  ];
  // the row labelled out-of-window is dated into September on purpose
  ledger.find((r) => r.description.startsWith('september'))!.created_at = '2026-09-02T18:00:00Z';

  it('ignores rows outside the window', () => {
    const a = monthlyAwards(PLAYERS, ledger, fixtures, results, OCT.from, OCT.to);
    expect(a.moved).toBe(2500);
  });

  it('crowns the best and worst net swing', () => {
    const a = monthlyAwards(PLAYERS, ledger, fixtures, results, OCT.from, OCT.to);
    expect(a.owner).toEqual({ id: 'vedant', amount: 1000 });
    expect(a.flop).toEqual({ id: 'archit', amount: -500 });
  });

  it('attributes money to the club that actually won the fixture', () => {
    const a = monthlyAwards(PLAYERS, ledger, fixtures, results, OCT.from, OCT.to);
    expect(a.club).toEqual({ id: 'real-madrid', amount: 1000 });
    expect(a.worstClub).toEqual({ id: 'arsenal', amount: -1000 });
  });

  it('counts only fixture-backed rows as results', () => {
    const a = monthlyAwards(PLAYERS, ledger, fixtures, results, OCT.from, OCT.to);
    expect(a.results).toBe(2);
  });

  it('breaks a dead-level month alphabetically rather than at random', () => {
    const level = [row('archit', 'vedant', 500, 3, null), row('anmol', 'harshal', 500, 4, null)];
    const a = monthlyAwards(PLAYERS, level, fixtures, results, OCT.from, OCT.to);
    expect(a.owner).toEqual({ id: 'harshal', amount: 500 });
    expect(a.flop).toEqual({ id: 'archit', amount: -500 });
  });

  it('names the biggest single transfer', () => {
    const a = monthlyAwards(PLAYERS, ledger, fixtures, results, OCT.from, OCT.to);
    expect(a.biggest).toMatchObject({ amount: 1000, from: 'archit', to: 'vedant' });
  });

  it('credits no club for a draw', () => {
    const a = monthlyAwards(PLAYERS, [row('archit', 'vedant', 500, 9, 'f3')], fixtures, results, OCT.from, OCT.to);
    expect(a.club).toBeNull();
    expect(a.results).toBe(1);
  });

  it('returns an empty month rather than throwing', () => {
    const a = monthlyAwards(PLAYERS, [], fixtures, results, OCT.from, OCT.to);
    expect(a).toEqual({ owner: null, flop: null, club: null, worstClub: null, biggest: null, moved: 0, results: 0 });
  });
});

describe('the monthly message', () => {
  it('carries both people, both clubs and the tally', () => {
    const t = buildMonthlyAwards({
      label: 'October 2026',
      owner: { name: 'Vedant', amount: 2500 },
      flop: { name: 'Anmol', amount: -3000 },
      club: { name: 'Real Madrid', owner: 'Vedant', amount: 1500 },
      worstClub: { name: 'Barcelona', owner: 'Anmol', amount: -2000 },
      biggest: { description: 'Barcelona 1–2 Real Madrid', amount: 1000, from: 'Anmol', to: 'Vedant' },
      moved: 7500, results: 11,
    });
    expect(t.startsWith('THE MONTH · October 2026')).toBe(true);
    expect(t).toContain('Owner of the month: Vedant, +₹2,500');
    expect(t).toContain('Flop of the month: Anmol, −₹3,000');
    expect(t).toContain('Club of the month: Real Madrid — Vedant, +₹1,500');
    expect(t).toContain('₹7,500 moved across 11 results.');
  });

  it('has something to say about a month where nothing happened', () => {
    const t = buildMonthlyAwards({
      label: 'June 2027', owner: null, flop: null, club: null, worstClub: null,
      biggest: null, moved: 0, results: 0,
    });
    expect(t).toContain('A month of pure talk');
  });
});
