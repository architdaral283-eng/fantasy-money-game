import { describe, it, expect } from 'vitest';
import { parseScoreboard, findMatch, toNormalised, goalsMatching, espnDateOf } from '@/lib/providers/espn';
import { scorerLines } from '@/lib/notify/format';

// Trimmed from the live feed: ita.1 scoreboard, 24 Oct 2026, event 401874948.
const goal = (min: string, team: string, short: string, extra: Record<string, boolean> = {}) => ({
  clock: { displayValue: min }, team: { id: team }, scoringPlay: true, penaltyKick: false, ownGoal: false, shootout: false,
  athletesInvolved: [{ displayName: short, shortName: short }], ...extra,
});
const card = (min: string, team: string) => ({ clock: { displayValue: min }, team: { id: team }, scoringPlay: false, yellowCard: true, athletesInvolved: [{ shortName: 'R. Marín' }] });
const event = (over: Record<string, unknown> = {}) => ({
  id: '401874948', date: '2026-10-24T16:00Z',
  status: { type: { name: 'STATUS_FULL_TIME', completed: true } },
  competitions: [{
    competitors: [
      { homeAway: 'home', score: '3', team: { id: '114', displayName: 'Napoli' } },
      { homeAway: 'away', score: '3', team: { id: '104', displayName: 'AS Roma' } },
    ],
    details: [
      card("4'", '114'),
      goal("28'", '114', 'F. Anguissa'), goal("48'", '114', 'S. McTominay'),
      goal("69'", '104', 'M. Soulè'), goal("74'", '104', 'L. Balerdi'),
      goal("83'", '114', 'S. McTominay'), goal("89'", '104', 'L. Balerdi'),
      card("30'", '104'),
    ],
  }],
  ...over,
});
const unowned = {
  id: '401874958', date: '2026-10-24T13:00Z', status: { type: { name: 'STATUS_FULL_TIME', completed: true } },
  competitions: [{ competitors: [
    { homeAway: 'home', score: '0', team: { id: '2925' } }, { homeAway: 'away', score: '2', team: { id: '107' } },
  ], details: [] }],
};

describe('ESPN scoreboard parsing', () => {
  it('reads Napoli 3–3 Roma with all six scorers and ignores the cards', () => {
    const [m, ...rest] = parseScoreboard({ events: [unowned, event()] });
    expect(rest).toHaveLength(0); // Cagliari v Bologna is nobody's
    expect(m).toMatchObject({ homeClubId: 'napoli', awayClubId: 'roma', home: 3, away: 3, completed: true, status: 'STATUS_FULL_TIME' });
    expect(m.goals).toHaveLength(6);
    expect(m.goals.filter((g) => g.player === 'S. McTominay')).toHaveLength(2);
  });

  it('drops the scorer list entirely when it does not add up to the score', () => {
    const ev = event();
    ev.competitions[0].details.splice(2, 1); // lose one Napoli goal
    expect(parseScoreboard({ events: [ev] })[0].goals).toEqual([]);
  });

  it('credits own goals to the side that benefits and skips shootout kicks', () => {
    const ev = event();
    ev.competitions[0].competitors[0].score = '1';
    ev.competitions[0].competitors[1].score = '0';
    ev.competitions[0].details = [
      goal("12'", '114', 'G. Mancini', { ownGoal: true }),
      goal('', '104', 'P. Dybala', { shootout: true }),
    ];
    const m = parseScoreboard({ events: [ev] })[0];
    expect(m.goals).toEqual([{ minute: "12'", player: 'G. Mancini', clubId: 'napoli', og: true }]);
  });

  it('survives garbage', () => {
    expect(parseScoreboard(null)).toEqual([]);
    expect(parseScoreboard({ events: 'nope' })).toEqual([]);
    expect(parseScoreboard({ events: [{}, { competitions: [] }] })).toEqual([]);
  });
});

describe('matching and conversion', () => {
  const m = parseScoreboard({ events: [event()] })[0];

  it('finds our fixture in either order, but not the reverse leg months later', () => {
    expect(findMatch([m], 'napoli', 'roma', '2026-10-24T16:00:00Z')).toBe(m);
    expect(findMatch([m], 'roma', 'napoli', '2026-10-24T16:00:00Z')).toBe(m);
    expect(findMatch([m], 'roma', 'napoli', '2027-05-02T00:00:00Z')).toBeNull();
    expect(findMatch([m], 'napoli', 'inter', '2026-10-24T16:00:00Z')).toBeNull();
  });

  it('only a plain full-time finish becomes a result, tagged espn, with no football-data id', () => {
    const n = toNormalised(m, 'SERIE_A', 'League');
    expect(n).toMatchObject({ scoreAt90: { home: 3, away: 3 }, terminalStatus: 'FT', provider: 'espn' });
    expect(n?.providerFixtureId).toBeUndefined();
    expect(toNormalised({ ...m, status: 'STATUS_FINAL_AET' }, 'UCL', 'Final')).toBeNull();
    expect(toNormalised({ ...m, completed: false, status: 'STATUS_SECOND_HALF' }, 'SERIE_A', 'League')).toBeNull();
  });

  it('keeps scorers only when they match the score actually being written', () => {
    expect(goalsMatching(m.goals, 'napoli', 3, 'roma', 3)).toHaveLength(6);
    expect(goalsMatching(m.goals, 'napoli', 3, 'roma', 2)).toEqual([]);
  });

  it('files dates the way ESPN does (US Eastern)', () => {
    expect(espnDateOf('2026-10-24T16:00:00Z')).toBe('20261024');
    expect(espnDateOf('2026-10-25T02:00:00Z')).toBe('20261024');
  });
});

describe('scorer lines', () => {
  it('groups a player\'s goals and puts home first', () => {
    const m = parseScoreboard({ events: [event()] })[0];
    expect(scorerLines(m.goals, { id: 'napoli', name: 'Napoli' }, { id: 'roma', name: 'AS Roma' })).toEqual([
      "Napoli: F. Anguissa 28', S. McTominay 48' 83'",
      "AS Roma: M. Soulè 69', L. Balerdi 74' 89'",
    ]);
  });
  it('marks penalties and own goals, and a 0–0 has no lines', () => {
    const lines = scorerLines(
      [{ minute: "80'", player: 'F. Bernardeschi', clubId: 'roma', pen: true }, { minute: "58'", player: 'D. Carlos', clubId: 'roma', og: true }],
      { id: 'napoli', name: 'Napoli' }, { id: 'roma', name: 'AS Roma' },
    );
    expect(lines).toEqual(["AS Roma: F. Bernardeschi 80' (pen), D. Carlos (og) 58'"]);
    expect(scorerLines([], { id: 'a', name: 'A' }, { id: 'b', name: 'B' })).toEqual([]);
  });
});
