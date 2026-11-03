import { describe, expect, it } from 'vitest';
import {
  buildFixtureList, buildLedgerList, buildTrophies, buildSettle, buildHelp, buildRules,
  buildWeeklyText, buildPredictionTable, buildBadges, buildRivalryTrophies,
  buildClubForm, buildPositions, PRE_WIDTH,
} from '@/lib/notify/format';

// ———————————————————————————————————————————————————————————————————————
// Telegram wraps a <pre> block at roughly 30 characters on a phone. The
// monthly positions table went out at 34 and every points value landed on
// its own line, which is how this test exists.
//
// Each case is the WORST REALISTIC input: the longest club and player names
// the constitution allows and the largest figures in the game. A table that
// fits these fits anything.
//
// buildDigestText is deliberately absent — see the last test.
// ———————————————————————————————————————————————————————————————————————

const P = ['Harshal', 'Vedant', 'Archit', 'Anmol'];
const preLines = (out: string): string[] =>
  [...out.matchAll(/<pre>([\s\S]*?)<\/pre>/g)]
    .flatMap((m) => m[1].split('\n'))
    .filter((l) => l.trim() !== '');

const cases: [string, string][] = [
  ['/next', buildFixtureList([
    { home: 'Manchester United', away: 'Borussia Dortmund', compId: 'ucl', ownerA: 'Harshal', ownerB: 'Harshal', timeIST: '01:30', dateIST: 'Sun 26 Oct' },
    { home: 'Real Madrid', away: 'Barcelona', compId: 'laliga', ownerA: 'Vedant', ownerB: 'Anmol', timeIST: '23:15', dateIST: 'Sun 26 Oct' },
  ], 'Next up')],
  ['/ledger', buildLedgerList([
    { from: 'Harshal', to: 'Vedant', amount: 24000, description: 'Borussia Dortmund 4–0 Manchester United, UCL' },
  ], 'Last results', '1 recent')],
  ['/trophies', buildTrophies([
    { name: 'UEFA Champions League', status: 'Decided', eachOtherPays: 2000 },
    { name: 'Premier League', status: 'Live', eachOtherPays: 1000 },
  ])],
  ['/settle', buildSettle([{ from: 'Harshal', to: 'Vedant', amount: 24000 }])],
  ['/help', buildHelp(true)],
  ['/rules', buildRules()],
  ['Sunday roundup', buildWeeklyText({
    weekLabel: 'Week of 26 Oct',
    table: P.map((name, i) => ({ name, title: ['The Landlord', 'The Nearly Man', 'The Tourist', 'The Tenant'][i], net: [24000, 1500, -1500, -24000][i], form: 'WWLDL' })),
    rivalry: { a: 'Harshal', b: 'Vedant', moved: 2000, leader: 'Harshal' },
    moment: { description: 'Borussia Dortmund 4–0 Manchester United', amount: 1000, from: 'Vedant', to: 'Anmol' },
    unlucky: { name: 'Harshal', narrow: 3 }, exposed: [{ name: 'Harshal', fixtures: 4 }],
    chase: { chaser: 'Vedant', leader: 'Harshal', wins: 3 }, landmark: null,
  })],
  ['/predictions', buildPredictionTable(P.map((name, i) => ({ name, played: 24, hits: 18 - i, points: 36 - i, pct: 100 - i })), 24)],
  ['/me badges', buildBadges([
    { name: 'Thrashing Merchant', blurb: '', earned: true, detail: 'four wins by four or more' },
  ]) ?? ''],
  ['rivalry trophies', buildRivalryTrophies([
    { a: 'Harshal', b: 'Vedant', holder: 'Harshal', aWins: 14, bWins: 12, draws: 1, games: 27 },
  ], 'Harshal')],
  ['/clubform', buildClubForm(
    P.map((name) => ({ name, points: 100, gf: 100, ga: 100, diff: -100, clubs: 4 })),
    { club: 'Borussia Dortmund', owner: 'Anmol', diff: 25 },
    { club: 'Manchester United', owner: 'Vedant', diff: -18 })],
  ['monthly positions', buildPositions([
    { label: 'Premier League', lines: [{ rank: 17, club: 'Aston Villa', owner: 'Harshal', points: 100 }] },
  ], 'Tue, 3 Nov') ?? ''],
];

describe('every aligned table fits a phone', () => {
  it.each(cases)('%s stays inside the width budget', (_name, out) => {
    const lines = preLines(out);
    expect(lines.length).toBeGreaterThan(0);
    // Report the offenders, not just a number, so a failure says what broke.
    const over = lines.filter((l) => l.length > PRE_WIDTH).map((l) => `${l.length}: ${l}`);
    expect(over).toEqual([]);
  });

  it('the budget is the one Telegram actually imposes', () => {
    expect(PRE_WIDTH).toBe(30);
  });

  it('shortens club names so a result description fits', () => {
    const out = buildLedgerList(
      [{ from: 'Vedant', to: 'Anmol', amount: 500, description: 'Borussia Dortmund 4–0 Manchester United, UCL' }],
      'Last results',
    );
    expect(out).toContain('Dortmund 4–0 Man Utd');
    expect(out).not.toContain('Borussia Dortmund');
  });

  it('does not half-match a club name inside a longer one', () => {
    // 'Manchester United' must not be shortened via 'Manchester City'.
    const out = buildLedgerList(
      [{ from: 'Vedant', to: 'Anmol', amount: 500, description: 'Manchester United 1–0 Manchester City' }],
      'Last results',
    );
    expect(out).toContain('Man Utd 1–0 Man City');
  });
});

describe('the news brief is prose, and exempt', () => {
  it('is allowed to exceed the budget, because a headline cannot be truncated', () => {
    // A real headline is 60–70 characters. Forcing it into 30 would mean
    // cutting the news itself. It wraps like prose, which is untidy rather
    // than meaningless — unlike a column table, where wrapping separates a
    // number from its row and destroys the meaning.
    expect(PRE_WIDTH).toBeLessThan(
      'Man City guilty of all charges of Premier League financial breaches'.length,
    );
  });
});
