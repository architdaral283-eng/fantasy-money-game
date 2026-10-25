import { describe, it, expect } from 'vitest';
import { parseScoreboard, findMatch, toNormalised, goalsMatching, espnDateOf, espnRound, cupDates, espnCupSweep, minuteOf, ESPN_ONLY_COMPS, ENGINE_CODE, ESPN_LEAGUE } from '@/lib/providers/espn';
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

  it('a full-time finish is a 90-minute result, tagged espn, with no football-data id', () => {
    const n = toNormalised(m, 'SERIE_A', 'League');
    expect(n).toMatchObject({ scoreAt90: { home: 3, away: 3 }, scoreAt120: null, terminalStatus: 'FT', provider: 'espn' });
    expect(n?.providerFixtureId).toBeUndefined();
    expect(toNormalised({ ...m, completed: false, status: 'STATUS_SECOND_HALF' }, 'SERIE_A', 'League')).toBeNull();
  });

  it('the same match reported as AET is read as 120 minutes, not 90', () => {
    // all six goals are inside 90', so extra time added nothing
    const n = toNormalised({ ...m, status: 'STATUS_FINAL_AET' }, 'UCL', 'Final')!;
    expect(n.terminalStatus).toBe('AET');
    expect(n.scoreAt90).toEqual({ home: 3, away: 3 });
    expect(n.scoreAt120).toEqual({ home: 3, away: 3 });
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


describe('cups', () => {
  // A cup tie that went to extra time and penalties. ESPN's score is at 120';
  // the 90' score has to come back out of the goal minutes.
  const tie = (over: Record<string, unknown> = {}) => parseScoreboard({ events: [{
    id: '999', date: '2027-02-10T20:00Z',
    status: { type: { name: 'STATUS_FINAL_PEN', completed: true } },
    competitions: [{
      competitors: [
        { homeAway: 'home', score: '2', team: { id: '359' } },   // Arsenal
        { homeAway: 'away', score: '2', team: { id: '382' } },   // Man City
      ],
      notes: [{ headline: 'Quarterfinals' }],
      details: [
        goal("12'", '359', 'B. Saka'),
        goal("90'+4'", '382', 'E. Haaland'),
        goal("105'", '359', 'K. Havertz'),
        goal("118'", '382', 'P. Foden'),
        goal('', '359', 'B. Saka', { shootout: true }),
        goal('', '359', 'M. Ødegaard', { shootout: true }),
        goal('', '382', 'P. Foden', { shootout: true }),
      ],
      ...(over.competitions as object ?? {}),
    }],
    ...over,
  }] })[0];

  it('separates shootout kicks from the score and keeps the round label', () => {
    const m = tie();
    expect(m).toMatchObject({ home: 2, away: 2, shootout: { home: 2, away: 1 }, note: 'Quarterfinals' });
    expect(m.goals).toHaveLength(4); // shootout kicks are not goals
  });

  it('recovers the 90-minute score from the goal minutes, stoppage included', () => {
    const n = toNormalised(tie(), 'FA_CUP', 'Quarter-final')!;
    expect(n).toMatchObject({
      terminalStatus: 'PEN',
      scoreAt90: { home: 1, away: 1 },    // 12' and 90'+4'
      scoreAt120: { home: 2, away: 2 },   // plus 105' and 118'
      shootout: { home: 2, away: 1 },
      provider: 'espn',
    });
  });

  it('scores extra time without penalties as AET', () => {
    const m = { ...tie(), status: 'STATUS_FINAL_AET', shootout: null, home: 2, away: 1 };
    m.goals = m.goals.filter((g) => !(g.clubId === 'man-city' && minuteOf(g) > 90));
    const n = toNormalised(m, 'FA_CUP', 'Quarter-final')!;
    expect(n.terminalStatus).toBe('AET');
    expect(n.scoreAt120).toEqual({ home: 2, away: 1 });
  });

  it('refuses to guess: a level shootout, or extra time with no goal list', () => {
    expect(toNormalised({ ...tie(), shootout: { home: 3, away: 3 } }, 'FA_CUP', 'Final')).toBeNull();
    expect(toNormalised({ ...tie(), goals: [] }, 'FA_CUP', 'Final')).toBeNull();
    expect(toNormalised({ ...tie(), completed: false, status: 'STATUS_SECOND_HALF' }, 'FA_CUP', 'Final')).toBeNull();
  });

  it('humanises ESPN round names', () => {
    expect(espnRound('Quarterfinals')).toBe('Quarter-final');
    expect(espnRound('Semifinals')).toBe('Semi-final');
    expect(espnRound('Final')).toBe('Final');
    expect(espnRound('Round of 16')).toBe('Round of 16');
    expect(espnRound('Round 3')).toBe('Round 3');
    expect(espnRound(null)).toBe('Cup tie');
    // a one-off cup has no round notes, so ESPN hands back the season slug
    expect(espnRound('2026-english-fa-community-shield')).toBe('Cup tie');
    expect(espnRound('2026-franz-beckenbauer-supercup')).toBe('Cup tie');
    expect(espnRound('Final Round')).toBe('Final');
  });

  it('every ESPN-only cup has a league slug and an engine code', () => {
    for (const c of ESPN_ONLY_COMPS) {
      expect(ESPN_LEAGUE[c], c).toBeTruthy();
      expect(ENGINE_CODE[c], c).toBeTruthy();
    }
  });

  it('scans a window around today, de-duplicated', () => {
    const d = cupDates(Date.parse('2026-10-24T12:00:00Z'), 14, 3);
    expect(d).toContain('20261024');
    expect(d).toContain('20261021');
    expect(d).toContain('20261107');
    expect(new Set(d).size).toBe(d.length);
  });
});


describe('cup sweep budget', () => {
  it('scans a bounded window, not a month', () => {
    // 108 sequential requests per sync timed the whole poller out once.
    const perCup = cupDates(Date.now()).length + 1; // + the undated call
    expect(perCup * ESPN_ONLY_COMPS.length).toBeLessThanOrEqual(90);
  });

  it('stops at the deadline instead of running the poller out of time', async () => {
    const origFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; await new Promise((r) => setTimeout(r, 15)); return { ok: true, json: async () => ({ events: [] }) }; }) as unknown as typeof fetch;
    try {
      const dates = Array.from({ length: 40 }, (_, i) => `2026110${i % 10}`);
      await espnCupSweep('facup', dates, { concurrency: 4, deadlineMs: Date.now() + 40 });
      expect(calls).toBeGreaterThan(0);
      expect(calls).toBeLessThan(40); // gave up early rather than finishing
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('de-duplicates the same tie seen on several dates', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ events: [{
      id: 'dup-1', date: '2027-01-10T15:00Z',
      status: { type: { name: 'STATUS_SCHEDULED', completed: false } },
      competitions: [{ competitors: [
        { homeAway: 'home', score: '0', team: { id: '359' } },
        { homeAway: 'away', score: '0', team: { id: '382' } },
      ], details: [] }],
    }] }) })) as unknown as typeof fetch;
    try {
      const out = await espnCupSweep('facup', ['20270110', '20270111', '20270112']);
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ homeClubId: 'arsenal', awayClubId: 'man-city' });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
