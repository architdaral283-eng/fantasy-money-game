import { describe, it, expect } from 'vitest';
import {
  formTable, rivalries, unluckyTable, exposedThisWeek, momentOfWeek,
  winsToCatch, runningTitle, landmark, SEASON_START,
  type WldRow, type LedgerRow, type FixtureRow, type ResultRow,
} from '@/lib/stats/weekly';
import { buildWeeklyText } from '@/lib/notify/format';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * 864e5).toISOString();
const w = (player: string, outcome: 'W' | 'L' | 'D', days: number): WldRow =>
  ({ player_id: player, outcome, occurred_at: ago(days), fixture_id: 'f' + days });
const led = (from: string, to: string, amount: number, days: number, description = 'x'): LedgerRow =>
  ({ from_player_id: from, to_player_id: to, amount_inr: amount, created_at: ago(days), description });

describe('form table', () => {
  it('orders on recent points, newest result first in the string', () => {
    const rows = formTable([
      w('archit', 'W', 1), w('archit', 'W', 2), w('archit', 'L', 3),
      w('vedant', 'L', 1), w('vedant', 'L', 2), w('vedant', 'L', 3),
    ]);
    expect(rows[0].player).toBe('archit');
    expect(rows[0].form).toBe('WWL');
    expect(rows[0].points).toBe(6);
    expect(rows.find((r) => r.player === 'vedant')?.points).toBe(0);
  });

  it('a player with nothing played shows a dash, not a crash', () => {
    expect(formTable([]).every((r) => r.form === '—')).toBe(true);
  });
});

describe('rivalry heat', () => {
  it('totals money moved per pairing and names who is ahead', () => {
    const [top] = rivalries([
      led('vedant', 'archit', 1000, 1), led('vedant', 'archit', 500, 2),
      led('archit', 'vedant', 500, 3), led('anmol', 'harshal', 500, 4),
    ]);
    expect([top.a, top.b].sort()).toEqual(['archit', 'vedant']);
    expect(top.moved).toBe(2000);
    expect(top.leader).toBe('archit');
  });

  it('dead level has no leader', () => {
    const [top] = rivalries([led('a', 'b', 500, 1), led('b', 'a', 500, 2)]);
    expect(top.leader).toBeNull();
  });
});

describe('the unlucky table', () => {
  const fx = (id: string, home: string, away: string): FixtureRow =>
    ({ id, home_club_id: home, away_club_id: away, status: 'RECORDED', kickoff_utc: ago(5), is_same_owner: false });
  const owner = (c: string) => ({ arsenal: 'archit', 'real-madrid': 'vedant', napoli: 'vedant' }[c]);

  it('counts one-goal defeats separately from hidings', () => {
    const res: ResultRow[] = [
      { fixture_id: 'a', h90: 1, a90: 0 },
      { fixture_id: 'b', h90: 4, a90: 0 },
      { fixture_id: 'c', h90: 1, a90: 1 },
    ];
    const rows = unluckyTable(
      [fx('a', 'arsenal', 'real-madrid'), fx('b', 'arsenal', 'napoli'), fx('c', 'arsenal', 'napoli')],
      res, owner,
    );
    const v = rows.find((r) => r.player === 'vedant')!;
    expect(v.narrow).toBe(1);
    expect(v.heavy).toBe(1);
  });

  it('same-owner fixtures never count', () => {
    const f = { ...fx('a', 'real-madrid', 'napoli'), is_same_owner: true };
    const rows = unluckyTable([f], [{ fixture_id: 'a', h90: 1, a90: 0 }], owner);
    expect(rows.every((r) => r.narrow === 0)).toBe(true);
  });
});

describe('who is exposed', () => {
  const owner = (c: string) => ({ arsenal: 'archit', 'real-madrid': 'vedant' }[c]);
  const sched = (id: string, days: number): FixtureRow =>
    ({ id, home_club_id: 'arsenal', away_club_id: 'real-madrid', status: 'SCHEDULED', kickoff_utc: new Date(NOW + days * 864e5).toISOString(), is_same_owner: false });

  it('counts only the next seven days, both owners', () => {
    const rows = exposedThisWeek([sched('a', 2), sched('b', 4), sched('c', 20)], owner, NOW);
    expect(rows.find((r) => r.player === 'archit')?.fixtures).toBe(2);
    expect(rows.find((r) => r.player === 'vedant')?.fixtures).toBe(2);
    expect(rows.find((r) => r.player === 'anmol')?.fixtures).toBe(0);
  });
});

describe('moment of the week', () => {
  it('is the biggest single transfer inside the window', () => {
    const m = momentOfWeek([led('v', 'a', 500, 1, 'small'), led('v', 'a', 1000, 2, 'big'), led('v', 'a', 5000, 30, 'old')], NOW - 7 * 864e5);
    expect(m?.description).toBe('big');
  });
  it('a quiet week has no moment', () => {
    expect(momentOfWeek([led('v', 'a', 500, 30)], NOW - 7 * 864e5)).toBeNull();
  });
});

describe('title race maths', () => {
  it('counts wins needed to close the gap', () => {
    expect(winsToCatch(3000)).toBe(6);
    expect(winsToCatch(250)).toBe(1);
    expect(winsToCatch(0)).toBe(0);
    expect(winsToCatch(-500)).toBe(0);
  });
});

describe('running titles', () => {
  it('reads position and form together', () => {
    expect(runningTitle({ rank: 1, of: 4, net: 3000, form: 'WWWLD' })).toBe('Unbeaten And Unbearable');
    expect(runningTitle({ rank: 1, of: 4, net: 3000, form: 'WLWDW' })).toBe('The Landlord');
    expect(runningTitle({ rank: 4, of: 4, net: -3500, form: 'LLLWL' })).toBe('The Donor');
    expect(runningTitle({ rank: 4, of: 4, net: -500, form: 'WDWLW' })).toBe('The Cautionary Tale');
    expect(runningTitle({ rank: 2, of: 4, net: 500, form: 'LLLDW' })).toBe('In Freefall');
    expect(runningTitle({ rank: 3, of: 4, net: 0, form: 'WDLDW' })).toBe('Break Even And Boring');
  });
});

describe('season landmarks', () => {
  const day = (n: number) => Date.parse(SEASON_START) + n * 864e5;

  it('marks the arbitrary days', () => {
    expect(landmark(day(100), 0, 0)).toContain('One hundred days');
    expect(landmark(day(55), 0, 0)).toBeNull();
  });

  // The roundup runs on Sundays only, so an exact-day check could never fire
  // for a mark that does not land on one. Day 200 of this season is a
  // Tuesday: `days === 200` was unreachable and silently did nothing.
  it('fires on the first roundup at or past the mark, not only on the day', () => {
    expect(landmark(day(202), 0, 0)).toContain('Two hundred days');
    expect(landmark(day(206), 0, 0)).toContain('Two hundred days');
  });

  it('fires each landmark once, not for a whole month after it', () => {
    expect(landmark(day(107), 0, 0)).toBeNull();
    expect(landmark(day(99), 0, 0)).toBeNull();
  });

  it('counts the run-in down rather than landing on it exactly', () => {
    const end = Date.parse('2027-05-31T00:00:00Z');
    const left = (n: number) => end - n * 864e5;
    expect(landmark(left(5), 0, 0)).toContain('Final week.');
    expect(landmark(left(26), 0, 0)).toContain('One month left.');
    expect(landmark(left(96), 0, 0)).toContain('A hundred days left');
  });

  it('marks halfway when it is crossed, which an odd fixture count never hits exactly', () => {
    // 63 paying fixtures: played*2 === total can never be true.
    expect(landmark(day(55), 32, 63, 31)).toContain('Halfway');
    expect(landmark(day(55), 32, 63, 32)).toBeNull();   // already marked last week
    expect(landmark(day(55), 30, 63, 29)).toBeNull();   // not there yet
  });
});

describe('the roundup message', () => {
  it('carries the table, the week and the landmark in one message', () => {
    const t = buildWeeklyText({
      weekLabel: '1 Nov',
      table: [
        { name: 'Archit', title: 'The Landlord', net: 3000, form: 'WWDWW' },
        { name: 'Vedant', title: 'The Donor', net: -3500, form: 'LLLLW' },
      ],
      rivalry: { a: 'Archit', b: 'Vedant', moved: 2500, leader: 'Archit' },
      moment: { description: 'Barcelona 1–2 Real Madrid', amount: 500, from: 'Anmol', to: 'Vedant' },
      unlucky: { name: 'Anmol', narrow: 3 },
      exposed: [{ name: 'Vedant', fixtures: 3 }, { name: 'Archit', fixtures: 0 }],
      chase: { chaser: 'Harshal', leader: 'Archit', wins: 5 },
      landmark: 'Halfway. Everything so far, again, in reverse.',
    });
    expect(t.startsWith('THE WEEK · 1 Nov')).toBe(true);
    expect(t).toContain('Archit — The Landlord');
    expect(t).toContain('+₹3,000');
    expect(t).toContain('Moment of the week');
    expect(t).toContain('Hottest rivalry');
    expect(t).toContain('lost 3 by a single goal');
    expect(t).toContain('needs 5 more wins');
    expect(t).toContain('Archit has nothing on.');
    expect(t).toContain('Halfway');
  });

  it('a dead week still produces a table', () => {
    const t = buildWeeklyText({
      weekLabel: '8 Nov',
      table: [{ name: 'Archit', title: 'The Landlord', net: 3000, form: '—' }],
      rivalry: null, moment: null, unlucky: null, exposed: [], chase: null, landmark: null,
    });
    expect(t).toContain('THE WEEK');
    expect(t).not.toContain('Moment of the week');
  });
});
