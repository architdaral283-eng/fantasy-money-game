import { describe, it, expect } from 'vitest';
import { badges } from '@/lib/stats/badges';
import { rivalryTrophies, pairings, heldBy } from '@/lib/stats/rivalry-trophies';
import { buildBadges, buildRivalryTrophies } from '@/lib/notify/format';

const clubs = [
  { id: 'arsenal', name: 'Arsenal', owner_id: 'archit', draft_pick: 1 },
  { id: 'napoli', name: 'Napoli', owner_id: 'archit', draft_pick: 4 },
  { id: 'real-madrid', name: 'Real Madrid', owner_id: 'vedant', draft_pick: 1 },
  { id: 'bayern', name: 'Bayern', owner_id: 'vedant', draft_pick: 4 },
  { id: 'liverpool', name: 'Liverpool', owner_id: 'harshal', draft_pick: 2 },
];
const fixtures = [
  { id: 'f1', home_club_id: 'napoli', away_club_id: 'real-madrid' },
  { id: 'f2', home_club_id: 'arsenal', away_club_id: 'bayern' },
  { id: 'f3', home_club_id: 'arsenal', away_club_id: 'real-madrid' },
  { id: 'f4', home_club_id: 'napoli', away_club_id: 'liverpool' },
];
const w = (fixture: string, player: string, outcome: 'W' | 'L' | 'D', day: number) => ({
  player_id: player, fixture_id: fixture, outcome,
  occurred_at: `2026-10-${String(day).padStart(2, '0')}T18:00:00Z`,
});
const nameOf = (id: string) => ({ archit: 'Archit', vedant: 'Vedant', harshal: 'Harshal' }[id] ?? id);
const base = { player: 'archit', ledger: [], fixtures, clubs, nameOf };
const find = (rows: ReturnType<typeof badges>, id: string) => rows.find((b) => b.id === id)!;

describe('achievements', () => {
  it('gives Giant Killer for a fourth pick beating a first', () => {
    const b = badges({ ...base, wld: [w('f1', 'archit', 'W', 5)] });
    expect(find(b, 'giant-killer').earned).toBe(true);
    expect(find(b, 'giant-killer').detail).toContain('Napoli (pick 4) beat Real Madrid (pick 1)');
  });

  it('does not give it for a first pick beating a fourth', () => {
    const b = badges({ ...base, wld: [w('f2', 'archit', 'W', 5)] });
    expect(find(b, 'giant-killer').earned).toBe(false);
  });

  it('gives Donor for four straight defeats and Hat-trick for three wins', () => {
    const losses = badges({ ...base, wld: [
      w('f1', 'archit', 'L', 1), w('f2', 'archit', 'L', 2),
      w('f3', 'archit', 'L', 3), w('f4', 'archit', 'L', 4),
    ] });
    expect(find(losses, 'donor')).toMatchObject({ earned: true, detail: '4 in a row' });

    const wins = badges({ ...base, wld: [
      w('f1', 'archit', 'W', 1), w('f2', 'archit', 'W', 2), w('f3', 'archit', 'W', 3),
    ] });
    expect(find(wins, 'hat-trick').earned).toBe(true);
    expect(find(wins, 'donor').earned).toBe(false);
  });

  it('reads a streak in date order, not row order', () => {
    const b = badges({ ...base, wld: [
      w('f4', 'archit', 'L', 9), w('f1', 'archit', 'L', 6),
      w('f3', 'archit', 'L', 8), w('f2', 'archit', 'L', 7),
    ] });
    expect(find(b, 'donor').earned).toBe(true);
  });

  it('gives Clean Month only for a month with results and no defeat', () => {
    const clean = badges({ ...base, wld: [w('f1', 'archit', 'W', 5), w('f2', 'archit', 'D', 12)] });
    expect(find(clean, 'clean-month')).toMatchObject({ earned: true, detail: 'October 2026' });

    const spoiled = badges({ ...base, wld: [w('f1', 'archit', 'W', 5), w('f2', 'archit', 'L', 12)] });
    expect(find(spoiled, 'clean-month').earned).toBe(false);
  });

  it('does not give Clean Month for a single result', () => {
    expect(find(badges({ ...base, wld: [w('f1', 'archit', 'W', 5)] }), 'clean-month').earned).toBe(false);
  });

  it('gives Bank Job and Charity on a four-goal game only', () => {
    const b = badges({ ...base, wld: [w('f1', 'archit', 'W', 5)], ledger: [
      { from_player_id: 'vedant', to_player_id: 'archit', amount_inr: 1000, created_at: '2026-10-05T18:00:00Z' },
      { from_player_id: 'archit', to_player_id: 'harshal', amount_inr: 500, created_at: '2026-10-06T18:00:00Z' },
    ] });
    expect(find(b, 'bank-job')).toMatchObject({ earned: true, detail: 'off Vedant' });
    expect(find(b, 'charity').earned).toBe(false);
  });

  it('gives Nemesis and Doormat at three against the same man', () => {
    const beats = badges({ ...base, wld: [
      w('f1', 'archit', 'W', 1), w('f2', 'archit', 'W', 2), w('f3', 'archit', 'W', 3),
    ] });
    expect(find(beats, 'nemesis')).toMatchObject({ earned: true, detail: 'Vedant, 3 times' });

    const losses = badges({ ...base, wld: [
      w('f1', 'archit', 'L', 1), w('f2', 'archit', 'L', 2), w('f3', 'archit', 'L', 3),
    ] });
    expect(find(losses, 'doormat')).toMatchObject({ earned: true, detail: 'Vedant, 3 times' });
  });

  it('gives Spectator after three without a win, and withdraws it on the first', () => {
    const none = badges({ ...base, wld: [
      w('f1', 'archit', 'L', 1), w('f2', 'archit', 'D', 2), w('f3', 'archit', 'L', 3),
    ] });
    expect(find(none, 'spectator')).toMatchObject({ earned: true, detail: '3 played, 0 won' });

    const one = badges({ ...base, wld: [
      w('f1', 'archit', 'L', 1), w('f2', 'archit', 'D', 2), w('f3', 'archit', 'W', 3),
    ] });
    expect(find(one, 'spectator').earned).toBe(false);
  });

  it("ignores other players' rows entirely", () => {
    const b = badges({ ...base, wld: [
      w('f1', 'vedant', 'L', 1), w('f2', 'vedant', 'L', 2),
      w('f3', 'vedant', 'L', 3), w('f4', 'vedant', 'L', 4),
    ] });
    expect(b.every((x) => !x.earned)).toBe(true);
  });

  it('survives a fixture the clubs table does not know', () => {
    const b = badges({ ...base, wld: [w('ghost', 'archit', 'W', 5)] });
    expect(find(b, 'giant-killer').earned).toBe(false);
  });
});

describe('head-to-head trophies', () => {
  const players = ['archit', 'vedant', 'harshal', 'anmol'] as const;
  const ownerOf = (c: string) => clubs.find((x) => x.id === c)?.owner_id;
  const fx = fixtures.map((f) => ({ ...f, status: 'RECORDED' }));

  it('has one per pairing, six for four players, in a stable order', () => {
    expect(pairings(players)).toHaveLength(6);
    expect(pairings(players)[0]).toEqual(['anmol', 'archit']);
    expect(pairings(['b', 'a'])).toEqual([['a', 'b']]);
  });

  it('gives the trophy to whoever leads', () => {
    const rows = rivalryTrophies(players, fx, ownerOf, [
      { player_id: 'archit', fixture_id: 'f1', outcome: 'W' },
      { player_id: 'vedant', fixture_id: 'f1', outcome: 'L' },
      { player_id: 'archit', fixture_id: 'f2', outcome: 'W' },
      { player_id: 'vedant', fixture_id: 'f2', outcome: 'L' },
    ]);
    const pair = rows.find((r) => r.a === 'archit' && r.b === 'vedant')!;
    expect(pair.holder).toBe('archit');
    expect(pair.aWins).toBe(2);
  });

  it('leaves it vacant when level, and when they have never played', () => {
    const rows = rivalryTrophies(players, fx, ownerOf, [
      { player_id: 'archit', fixture_id: 'f1', outcome: 'W' },
      { player_id: 'vedant', fixture_id: 'f1', outcome: 'L' },
      { player_id: 'archit', fixture_id: 'f2', outcome: 'L' },
      { player_id: 'vedant', fixture_id: 'f2', outcome: 'W' },
    ]);
    expect(rows.find((r) => r.a === 'archit' && r.b === 'vedant')!.holder).toBeNull();
    expect(rows.find((r) => r.b === 'harshal' && r.a === 'anmol')!.games).toBe(0);
  });

  it('counts how many one man holds', () => {
    const rows = rivalryTrophies(players, fx, ownerOf, [
      { player_id: 'archit', fixture_id: 'f1', outcome: 'W' },
      { player_id: 'vedant', fixture_id: 'f1', outcome: 'L' },
      { player_id: 'archit', fixture_id: 'f4', outcome: 'W' },
      { player_id: 'harshal', fixture_id: 'f4', outcome: 'L' },
    ]);
    expect(heldBy(rows, 'archit')).toHaveLength(2);
    expect(heldBy(rows, 'vedant')).toHaveLength(0);
  });
});

describe('the badge and trophy messages', () => {
  it('shows what you have and names what you do not', () => {
    const t = buildBadges([
      { name: 'Giant Killer', blurb: 'x', earned: true, detail: 'Napoli beat Real Madrid' },
      { name: 'Donor', blurb: 'x', earned: true, detail: '5 in a row' },
      { name: 'Hat-trick', blurb: 'x', earned: false },
    ])!;
    expect(t).toContain('BADGES · 2 of 3');
    expect(t).toContain('5 in a row');
    expect(t).toContain('Still missing: Hat-trick.');
  });

  it('has a line for an empty cabinet', () => {
    const t = buildBadges([{ name: 'Donor', blurb: 'x', earned: false }])!;
    expect(t).toContain('Not even the bad ones');
  });

  it('prints the six pairings and counts yours', () => {
    const t = buildRivalryTrophies([
      { a: 'Archit', b: 'Vedant', holder: 'Archit', aWins: 3, bWins: 1, draws: 0, games: 4 },
      { a: 'Archit', b: 'Harshal', holder: null, aWins: 0, bWins: 0, draws: 0, games: 0 },
    ], 'Archit');
    expect(t).toContain('HEAD TO HEAD · 2 trophies');
    expect(t).toContain('3–1');
    expect(t).toContain('vacant');
    expect(t).toContain('You hold 1 of 2.');
  });
});
