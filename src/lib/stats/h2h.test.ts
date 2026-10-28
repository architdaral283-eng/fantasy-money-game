import { describe, it, expect } from 'vitest';
import { h2hTally, h2hText, lastMeeting, lastMeetingText, type H2HDatedFixture } from '@/lib/stats/h2h';

const owner = (c: string) => ({
  arsenal: 'archit', 'man-utd': 'archit',
  'real-madrid': 'vedant', napoli: 'vedant',
  bayern: 'harshal', liverpool: 'anmol',
}[c]);

const fx = (id: string, home: string, away: string, kickoff: string | null, status = 'RECORDED'): H2HDatedFixture =>
  ({ id, home_club_id: home, away_club_id: away, status, kickoff_utc: kickoff });
const wl = (fixture: string, winner: string, loser: string) =>
  [{ player_id: winner, fixture_id: fixture, outcome: 'W' }, { player_id: loser, fixture_id: fixture, outcome: 'L' }];
const drew = (fixture: string, a: string, b: string) =>
  [{ player_id: a, fixture_id: fixture, outcome: 'D' }, { player_id: b, fixture_id: fixture, outcome: 'D' }];

describe('head to head record', () => {
  it('counts one outcome per fixture, not one per row', () => {
    const t = h2hTally('archit', 'vedant',
      [fx('a', 'arsenal', 'real-madrid', '2026-10-01T18:00:00Z')],
      owner, wl('a', 'archit', 'vedant'));
    expect(t).toEqual({ games: 1, aWins: 1, bWins: 0, draws: 0 });
  });
  it('names the leader first whichever way round the clubs were', () => {
    const t = { games: 4, aWins: 1, bWins: 3, draws: 0 };
    expect(h2hText('Archit', 'Vedant', t)).toBe('Vedant leads 3–1');
  });
});

describe('the last meeting', () => {
  const fixtures = [
    fx('old', 'arsenal', 'real-madrid', '2026-09-01T18:00:00Z'),
    fx('new', 'man-utd', 'napoli', '2026-10-24T18:00:00Z'),
    fx('other', 'bayern', 'liverpool', '2026-10-26T18:00:00Z'),
  ];
  const wld = [...wl('old', 'archit', 'vedant'), ...wl('new', 'vedant', 'archit')];
  const results = [
    { fixture_id: 'old', h90: 1, a90: 0 },
    { fixture_id: 'new', h90: 1, a90: 5 },
  ];

  it('picks the newest fixture between those two owners', () => {
    const m = lastMeeting('archit', 'vedant', fixtures, owner, wld, results)!;
    expect(m.fixtureId).toBe('new');
    expect(m.winner).toBe('vedant');
    expect(m.loser).toBe('archit');
  });

  it('charges 1,000 when it was won by four or more', () => {
    const m = lastMeeting('archit', 'vedant', fixtures, owner, wld, results)!;
    expect(m.stake).toBe(1000);
  });

  it('charges 500 for a tight one', () => {
    const m = lastMeeting('archit', 'vedant', [fixtures[0]], owner, wld, results)!;
    expect(m.stake).toBe(500);
  });

  it('a draw moved nothing', () => {
    const m = lastMeeting('archit', 'vedant', [fixtures[0]], owner, drew('old', 'archit', 'vedant'), results)!;
    expect(m.stake).toBe(0);
    expect(m.winner).toBeNull();
  });

  it('a null kickoff sorts behind a dated one', () => {
    const m = lastMeeting('archit', 'vedant',
      [fx('undated', 'arsenal', 'napoli', null), ...fixtures], owner,
      [...wld, ...wl('undated', 'archit', 'vedant')], results)!;
    expect(m.fixtureId).toBe('new');
  });

  it('ignores same-owner fixtures and unplayed ones', () => {
    expect(lastMeeting('archit', 'vedant',
      [fx('internal', 'arsenal', 'man-utd', '2026-10-01T18:00:00Z'),
       fx('soon', 'arsenal', 'napoli', '2026-11-01T18:00:00Z', 'SCHEDULED')],
      owner, [], [])).toBeNull();
  });

  it('is null when they have never played', () => {
    expect(lastMeeting('harshal', 'anmol', [fixtures[0]], owner, wld, results)).toBeNull();
  });

  it('survives a missing result row', () => {
    const m = lastMeeting('archit', 'vedant', [fixtures[1]], owner, wld, [])!;
    expect(m.h90).toBeNull();
    expect(m.stake).toBe(500);
  });
});

describe('the last-meeting line', () => {
  const club = (id: string) => ({ 'man-utd': 'Manchester United', napoli: 'Napoli' }[id] ?? id);
  const player = (id: string) => ({ archit: 'Archit', vedant: 'Vedant' }[id] ?? id);
  const base = { fixtureId: 'new', homeClubId: 'man-utd', awayClubId: 'napoli', h90: 1, a90: 3, at: '2026-10-24T18:00:00Z' };

  it('names the score, the date and the money', () => {
    const t = lastMeetingText({ ...base, winner: 'vedant', loser: 'archit', stake: 1000 }, club, player, 'Sat 24 Oct', false);
    expect(t).toBe('Last meeting: Manchester United 1–3 Napoli, Sat 24 Oct. Vedant took ₹1,000 off Archit.');
  });

  it('calls the identical fixture a rematch', () => {
    const t = lastMeetingText({ ...base, winner: 'vedant', loser: 'archit', stake: 500 }, club, player, 'Sat 24 Oct', true);
    expect(t.startsWith('Rematch: Manchester United 1–3 Napoli')).toBe(true);
  });

  it('says so when nothing moved', () => {
    const t = lastMeetingText({ ...base, h90: 1, a90: 1, winner: null, loser: null, stake: 0 }, club, player, 'Sat 24 Oct', false);
    expect(t).toBe('Last meeting: Manchester United 1–1 Napoli, Sat 24 Oct. Nothing moved.');
  });

  it('drops the date when there is none', () => {
    const t = lastMeetingText({ ...base, winner: 'vedant', loser: 'archit', stake: 500 }, club, player, null, false);
    expect(t).toBe('Last meeting: Manchester United 1–3 Napoli. Vedant took ₹500 off Archit.');
  });
});
