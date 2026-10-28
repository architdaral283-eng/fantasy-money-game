import { describe, it, expect } from 'vitest';
import {
  playedFixtures, recompute, shuffleAssignment, actualAssignment, sumsToZero, mulberry32,
} from '@/lib/stats/what-if';

const PLAYERS = ['archit', 'vedant', 'harshal', 'anmol'] as const;
const clubs = [
  { id: 'arsenal', league: 'Premier League', owner: 'archit' },
  { id: 'man-city', league: 'Premier League', owner: 'harshal' },
  { id: 'man-utd', league: 'Premier League', owner: 'vedant' },
  { id: 'aston-villa', league: 'Premier League', owner: 'anmol' },
  { id: 'real-madrid', league: 'La Liga', owner: 'vedant' },
  { id: 'barcelona', league: 'La Liga', owner: 'anmol' },
  { id: 'atletico', league: 'La Liga', owner: 'archit' },
  { id: 'sevilla', league: 'La Liga', owner: 'harshal' },
];
const ownerOf = (id: string) => clubs.find((c) => c.id === id)?.owner;

const fx = (id: string, home: string, away: string, status = 'RECORDED') =>
  ({ id, home_club_id: home, away_club_id: away, status });
const wl = (id: string, winner: string, loser: string) => [
  { player_id: winner, fixture_id: id, outcome: 'W' },
  { player_id: loser, fixture_id: id, outcome: 'L' },
];
const drew = (id: string, a: string, b: string) => [
  { player_id: a, fixture_id: id, outcome: 'D' },
  { player_id: b, fixture_id: id, outcome: 'D' },
];
const paid = (id: string, from: string, to: string, amount: number) =>
  ({ fixture_id: id, from_player_id: from, to_player_id: to, amount_inr: amount });

describe('reducing the season to clubs and rupees', () => {
  const fixtures = [
    fx('f1', 'arsenal', 'real-madrid'),
    fx('f2', 'man-city', 'barcelona'),
    fx('f3', 'man-utd', 'sevilla'),
    fx('f4', 'atletico', 'aston-villa', 'SCHEDULED'),
  ];
  const wld = [...wl('f1', 'archit', 'vedant'), ...drew('f2', 'harshal', 'anmol'), ...wl('f3', 'harshal', 'vedant')];
  const ledger = [paid('f1', 'vedant', 'archit', 1000), paid('f3', 'vedant', 'harshal', 500)];

  it('credits the club, not the man', () => {
    const p = playedFixtures(fixtures, wld, ledger, ownerOf);
    const one = p.find((x) => x.fixtureId === 'f1')!;
    expect(one.winnerClubId).toBe('arsenal');
    expect(one.loserClubId).toBe('real-madrid');
    expect(one.amount).toBe(1000);
  });

  it('keeps draws, with no winner and no money', () => {
    const two = playedFixtures(fixtures, wld, ledger, ownerOf).find((x) => x.fixtureId === 'f2')!;
    expect(two.winnerClubId).toBeNull();
    expect(two.amount).toBe(0);
  });

  it('leaves out anything unplayed', () => {
    expect(playedFixtures(fixtures, wld, ledger, ownerOf).map((p) => p.fixtureId)).not.toContain('f4');
  });

  it('leaves out a fixture one man owned both sides of, rather than guessing it', () => {
    const both = [fx('f9', 'arsenal', 'atletico')];   // archit owns both
    expect(playedFixtures(both, wl('f9', 'archit', 'archit'), [], ownerOf)).toEqual([]);
  });
});

describe('re-running the season', () => {
  const played = [
    { fixtureId: 'f1', clubs: ['arsenal', 'real-madrid'] as [string, string], winnerClubId: 'arsenal', loserClubId: 'real-madrid', amount: 1000 },
    { fixtureId: 'f2', clubs: ['man-city', 'barcelona'] as [string, string], winnerClubId: null, loserClubId: null, amount: 0 },
    { fixtureId: 'f3', clubs: ['man-utd', 'sevilla'] as [string, string], winnerClubId: 'sevilla', loserClubId: 'man-utd', amount: 500 },
  ];

  it('reproduces the real table from the real draft', () => {
    const t = recompute(played, ownerOf, PLAYERS);
    expect(t.find((r) => r.player === 'archit')).toMatchObject({ net: 1000, w: 1, l: 0, d: 0 });
    expect(t.find((r) => r.player === 'vedant')).toMatchObject({ net: -1500, w: 0, l: 2, d: 0 });
    expect(t.find((r) => r.player === 'harshal')).toMatchObject({ net: 500, w: 1, l: 0, d: 1 });
    expect(t.find((r) => r.player === 'anmol')).toMatchObject({ net: 0, d: 1 });
  });

  it('moves the money when the clubs change hands', () => {
    const swapped = (id: string) => (id === 'arsenal' ? 'vedant' : id === 'real-madrid' ? 'archit' : ownerOf(id));
    const t = recompute(played, swapped, PLAYERS);
    expect(t.find((r) => r.player === 'vedant')).toMatchObject({ net: 500, w: 1, l: 1 });
    expect(t.find((r) => r.player === 'archit')).toMatchObject({ net: -1000, w: 0, l: 1 });
  });

  it('pays nobody when one man ends up owning both clubs', () => {
    const hoard = (id: string) => (['arsenal', 'real-madrid'].includes(id) ? 'archit' : ownerOf(id));
    const t = recompute(played, hoard, PLAYERS);
    expect(t.find((r) => r.player === 'archit')).toMatchObject({ net: 0, w: 0, l: 0, d: 0 });
  });

  it('stays zero-sum under every draft', () => {
    expect(sumsToZero(recompute(played, ownerOf, PLAYERS))).toBe(true);
    const rand = mulberry32(7);
    for (let i = 0; i < 25; i++) {
      const alt = shuffleAssignment(clubs, PLAYERS, rand);
      expect(sumsToZero(recompute(played, (id) => alt[id], PLAYERS))).toBe(true);
    }
  });

  it('lists a player who owned nothing involved at zero rather than dropping them', () => {
    const t = recompute([], ownerOf, PLAYERS);
    expect(t).toHaveLength(4);
    expect(t.every((r) => r.net === 0)).toBe(true);
  });
});

describe('alternative drafts', () => {
  it('gives every player exactly one club per league', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      const alt = shuffleAssignment(clubs, PLAYERS, rand);
      for (const lg of ['Premier League', 'La Liga']) {
        const owners = clubs.filter((c) => c.league === lg).map((c) => alt[c.id]);
        expect(new Set(owners).size).toBe(4);
      }
    }
  });

  it('is reproducible from its seed', () => {
    const a = shuffleAssignment(clubs, PLAYERS, mulberry32(99));
    const b = shuffleAssignment(clubs, PLAYERS, mulberry32(99));
    expect(a).toEqual(b);
  });

  it('can hand back the draft that actually happened', () => {
    const actual = actualAssignment(clubs);
    expect(actual['arsenal']).toBe('archit');
    expect(Object.keys(actual)).toHaveLength(clubs.length);
  });
});
