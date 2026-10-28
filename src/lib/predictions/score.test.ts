import { describe, it, expect } from 'vitest';
import { outcomeOf, choiceToOutcome, scorePoll, leaderboard, missesSince, nthTime, HOME, DRAW, AWAY } from '@/lib/predictions/score';
import { buildPredictionResult, buildPredictionTable, predictionLine } from '@/lib/notify/format';

const KICKOFF = Date.parse('2026-10-31T20:00:00Z');
const before = (mins: number) => new Date(KICKOFF - mins * 60000).toISOString();
const after = (mins: number) => new Date(KICKOFF + mins * 60000).toISOString();
const PLAYERS = ['archit', 'vedant', 'harshal', 'anmol'] as const;

describe('outcomes and choices', () => {
  it('reads a scoreline', () => {
    expect(outcomeOf(2, 1)).toBe('H');
    expect(outcomeOf(1, 2)).toBe('A');
    expect(outcomeOf(1, 1)).toBe('D');
  });
  it('maps the fixed poll option order', () => {
    expect(choiceToOutcome(HOME)).toBe('H');
    expect(choiceToOutcome(DRAW)).toBe('D');
    expect(choiceToOutcome(AWAY)).toBe('A');
    expect(choiceToOutcome(7)).toBeNull();
  });
});

describe('settling a poll', () => {
  const votes = [
    { player_id: 'archit', choice: HOME, answered_at: before(600) },
    { player_id: 'vedant', choice: AWAY, answered_at: before(90) },
    { player_id: 'harshal', choice: DRAW, answered_at: before(5) },
  ];

  it('awards a point for the right call and nothing for the wrong one', () => {
    const s = scorePoll(votes, 'H', KICKOFF);
    expect(s.find((r) => r.player === 'archit')).toMatchObject({ correct: true, points: 1 });
    expect(s.find((r) => r.player === 'vedant')).toMatchObject({ correct: false, points: 0 });
    expect(s).toHaveLength(3);
  });

  it('throws out a vote cast after kickoff', () => {
    const s = scorePoll([...votes, { player_id: 'anmol', choice: HOME, answered_at: after(89) }], 'H', KICKOFF);
    expect(s.map((r) => r.player)).not.toContain('anmol');
  });

  it('counts a vote in the last second before kickoff', () => {
    const s = scorePoll([{ player_id: 'anmol', choice: HOME, answered_at: new Date(KICKOFF - 1000).toISOString() }], 'H', KICKOFF);
    expect(s).toHaveLength(1);
  });

  it('ignores an option index that is not a result', () => {
    expect(scorePoll([{ player_id: 'anmol', choice: 5, answered_at: before(10) }], 'H', KICKOFF)).toEqual([]);
  });

  it('keeps a vote when the kickoff time is unknown rather than discarding everyone', () => {
    const s = scorePoll(votes, 'H', NaN);
    expect(s).toHaveLength(3);
  });
});

describe('the leaderboard', () => {
  const rows = [
    { player_id: 'archit', points: 1, correct: true, scored_at: '2026-10-05T18:00:00Z' },
    { player_id: 'archit', points: 1, correct: true, scored_at: '2026-10-12T18:00:00Z' },
    { player_id: 'vedant', points: 1, correct: true, scored_at: '2026-10-12T18:00:00Z' },
    { player_id: 'vedant', points: 0, correct: false, scored_at: '2026-10-19T18:00:00Z' },
    { player_id: 'harshal', points: 0, correct: false, scored_at: '2026-10-19T18:00:00Z' },
  ];

  it('ranks on points, then strike rate, then name', () => {
    const t = leaderboard(rows, PLAYERS);
    expect(t.map((r) => r.player)).toEqual(['archit', 'vedant', 'anmol', 'harshal']);
    expect(t[0]).toMatchObject({ played: 2, hits: 2, points: 2, pct: 100 });
    expect(t[1]).toMatchObject({ played: 2, hits: 1, pct: 50 });
  });

  it('lists a player who has never voted at zero rather than omitting them', () => {
    expect(leaderboard(rows, PLAYERS).find((r) => r.player === 'anmol')).toMatchObject({ played: 0, pct: 0 });
  });

  it('windows by date', () => {
    const t = leaderboard(rows, PLAYERS, Date.parse('2026-10-15T00:00:00Z'));
    expect(t.find((r) => r.player === 'archit')?.played).toBe(0);
    expect(t.find((r) => r.player === 'vedant')?.played).toBe(1);
  });

  it('counts misses in a window', () => {
    expect(missesSince(rows, 'vedant', Date.parse('2026-10-01T00:00:00Z'))).toBe(1);
    expect(missesSince(rows, 'archit', Date.parse('2026-10-01T00:00:00Z'))).toBe(0);
  });
});

describe('ordinal words', () => {
  it('spells the small ones', () => {
    expect([1, 2, 4, 10].map(nthTime)).toEqual(['First', 'Second', 'Fourth', 'Tenth']);
    expect(nthTime(14)).toBe('14th');
  });
});

describe('the prediction lines', () => {
  it('names who called it and who backed the loser', () => {
    const t = buildPredictionResult({
      hits: ['Archit', 'Harshal'],
      misses: [{ name: 'Vedant', backed: 'Bayern', nth: 4 }],
    })!;
    expect(t).toContain('Called it: Archit and Harshal.');
    expect(t).toContain('Vedant backed Bayern. Fourth time this month.');
  });

  it('has a line for a result nobody saw coming', () => {
    const t = buildPredictionResult({ hits: [], misses: [{ name: 'Vedant', backed: 'a draw', nth: 2 }] })!;
    expect(t).toContain('Nobody called that one.');
  });

  it('names at most two misses', () => {
    const t = buildPredictionResult({
      hits: ['Archit'],
      misses: [
        { name: 'Vedant', backed: 'Bayern', nth: 4 },
        { name: 'Harshal', backed: 'a draw', nth: 2 },
        { name: 'Anmol', backed: 'Bayern', nth: 1 },
      ],
    })!;
    expect(t).not.toContain('Anmol');
  });

  it('is null when nobody voted', () => {
    expect(buildPredictionResult({ hits: [], misses: [] })).toBeNull();
  });

  it('builds a table, and says something useful when there is none', () => {
    const rows = [
      { name: 'Archit', played: 12, hits: 8, points: 8, pct: 67 },
      { name: 'Vedant', played: 12, hits: 5, points: 5, pct: 42 },
    ];
    const t = buildPredictionTable(rows, 12);
    expect(t).toContain('PREDICTIONS · 12 settled');
    expect(t).toContain('Archit');
    expect(t).toContain('trophy in May');
    expect(buildPredictionTable([], 0)).toContain('Nothing settled yet');
  });

  it('compresses to one line for the roundup, and stays quiet with nothing to say', () => {
    const rows = [
      { name: 'Archit', played: 12, hits: 8, points: 8, pct: 67 },
      { name: 'Vedant', played: 12, hits: 5, points: 5, pct: 42 },
    ];
    expect(predictionLine(rows)).toBe('Predictions: Archit leads on 8, Vedant 5.');
    expect(predictionLine([{ name: 'Archit', played: 0, hits: 0, points: 0, pct: 0 }])).toBeNull();
  });
});
