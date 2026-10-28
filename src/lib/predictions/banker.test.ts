import { describe, it, expect } from 'vitest';
import { weekStartIST, pointsFor, scorePoll, leaderboard, HOME, AWAY, DRAW } from '@/lib/predictions/score';
import { buildBankerOffer } from '@/lib/notify/format';

describe('the IST week', () => {
  it('starts on Monday', () => {
    // 28 Oct 2026 is a Wednesday.
    expect(weekStartIST(Date.parse('2026-10-28T12:00:00Z'))).toBe('2026-10-26');
    expect(weekStartIST(Date.parse('2026-10-26T12:00:00Z'))).toBe('2026-10-26');
  });

  it('keeps Sunday in the week that is ending, not the one starting', () => {
    expect(weekStartIST(Date.parse('2026-11-01T12:00:00Z'))).toBe('2026-10-26');
    expect(weekStartIST(Date.parse('2026-11-02T12:00:00Z'))).toBe('2026-11-02');
  });

  it('reads the boundary in IST, not UTC', () => {
    // 01:30 IST Monday 2 Nov is 20:00 UTC Sunday 1 Nov. A UTC week would
    // file that late-night kickoff under the week before.
    expect(weekStartIST(Date.parse('2026-11-01T20:00:00Z'))).toBe('2026-11-02');
  });

  it('rolls across a month and a year end', () => {
    expect(weekStartIST(Date.parse('2027-01-01T12:00:00Z'))).toBe('2026-12-28');
  });
});

describe('what a banker is worth', () => {
  it('doubles a hit and costs a point on a miss', () => {
    expect(pointsFor(true, true)).toBe(2);
    expect(pointsFor(false, true)).toBe(-1);
    expect(pointsFor(true, false)).toBe(1);
    expect(pointsFor(false, false)).toBe(0);
  });
});

describe('settling with a banker on it', () => {
  const KICKOFF = Date.parse('2026-10-31T20:00:00Z');
  const before = (m: number) => new Date(KICKOFF - m * 60000).toISOString();
  const votes = [
    { player_id: 'archit', choice: HOME, answered_at: before(600) },
    { player_id: 'vedant', choice: AWAY, answered_at: before(90) },
    { player_id: 'anmol', choice: DRAW, answered_at: before(30) },
  ];

  it('pays double to the banker who called it', () => {
    const s = scorePoll(votes, 'H', KICKOFF, new Set(['archit']));
    expect(s.find((r) => r.player === 'archit')).toMatchObject({ points: 2, banker: true });
    expect(s.find((r) => r.player === 'vedant')).toMatchObject({ points: 0, banker: false });
  });

  it('takes a point off the banker who did not', () => {
    const s = scorePoll(votes, 'H', KICKOFF, new Set(['vedant']));
    expect(s.find((r) => r.player === 'vedant')).toMatchObject({ points: -1, correct: false, banker: true });
  });

  it('lets a leaderboard go negative, because a banker can', () => {
    const t = leaderboard([
      { player_id: 'vedant', points: -1, correct: false, scored_at: '2026-10-31T22:00:00Z' },
      { player_id: 'vedant', points: 0, correct: false, scored_at: '2026-11-01T22:00:00Z' },
    ], ['vedant']);
    expect(t[0]).toMatchObject({ points: -1, played: 2, hits: 0, pct: 0 });
  });

  it('is an ordinary poll when nobody bankered it', () => {
    expect(scorePoll(votes, 'H', KICKOFF).every((r) => r.banker === false)).toBe(true);
  });
});

describe('the banker offer', () => {
  const rows = [
    { id: 'f1', label: 'Barcelona v Real Madrid', when: 'Sat 31 Oct, 01:30' },
    { id: 'f2', label: 'Arsenal v Bayern', when: 'Sun 1 Nov, 22:00' },
  ];

  it('explains the trade and lists the week', () => {
    const t = buildBankerOffer(rows, null);
    expect(t).toContain('BANKER · this week');
    expect(t).toContain('two points instead of one');
    expect(t).toContain('Barcelona v Real Madrid');
    expect(t).toContain('Nothing picked yet.');
  });

  it('says what you are already on', () => {
    expect(buildBankerOffer(rows, 'Arsenal v Bayern')).toContain('Currently on Arsenal v Bayern.');
  });

  it('has something to say in an empty week', () => {
    expect(buildBankerOffer([], null)).toContain('Nobody plays anybody.');
  });
});
