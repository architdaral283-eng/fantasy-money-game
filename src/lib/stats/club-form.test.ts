import { describe, it, expect } from 'vitest';
import { parseStandings } from '@/lib/providers/espn-standings';
import { ownerForm, bestAndWorstClub } from '@/lib/stats/club-form';
import { buildClubForm, clubFormLine } from '@/lib/notify/format';

const PLAYERS = ['archit', 'vedant', 'harshal', 'anmol'] as const;
// 359 Arsenal (archit), 382 Man City (harshal), 360 Man Utd (vedant), 362 Villa (anmol)
const entry = (id: number, gp: number, w: number, d: number, l: number, gf: number, ga: number, pts: number, rank: number) => ({
  team: { id },
  stats: [
    { name: 'gamesPlayed', value: gp }, { name: 'wins', value: w },
    { name: 'ties', value: d }, { name: 'losses', value: l },
    { name: 'pointsFor', value: gf }, { name: 'pointsAgainst', value: ga },
    { name: 'points', value: pts }, { name: 'rank', value: rank },
  ],
});

const owners: Record<string, string> = { arsenal: 'archit', 'man-city': 'harshal', 'man-utd': 'vedant', 'aston-villa': 'anmol' };
const ownerOf = (id: string) => owners[id];

describe('reading an ESPN league table', () => {
  it('pulls goals and points off the American stat names', () => {
    const out = parseStandings({ children: [{ standings: { entries: [entry(359, 8, 6, 1, 1, 20, 9, 19, 2)] } }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ clubId: 'arsenal', played: 8, w: 6, gf: 20, ga: 9, diff: 11, points: 19, rank: 2 });
  });

  it('reads a flat table as well as a grouped one', () => {
    expect(parseStandings({ standings: { entries: [entry(359, 8, 6, 1, 1, 20, 9, 19, 2)] } })).toHaveLength(1);
  });

  it('ignores the twelve clubs nobody drafted', () => {
    expect(parseStandings({ children: [{ standings: { entries: [entry(999999, 8, 6, 1, 1, 20, 9, 19, 2)] } }] })).toEqual([]);
  });

  it('survives junk', () => {
    expect(parseStandings(null)).toEqual([]);
    expect(parseStandings({})).toEqual([]);
    expect(parseStandings({ children: [{}] })).toEqual([]);
  });

  it('treats a missing stat as zero rather than NaN', () => {
    const out = parseStandings({ standings: { entries: [{ team: { id: 359 }, stats: [{ name: 'wins', value: 3 }] }] } });
    expect(out[0]).toMatchObject({ w: 3, gf: 0, ga: 0, diff: 0, points: 0 });
  });
});

describe('adding up four clubs each', () => {
  const standings = parseStandings({
    standings: {
      entries: [
        entry(359, 8, 6, 1, 1, 20, 9, 19, 2),    // arsenal  -> archit
        entry(382, 8, 7, 0, 1, 20, 9, 21, 1),    // man city -> harshal
        entry(360, 8, 2, 2, 4, 9, 14, 8, 14),    // man utd  -> vedant
        entry(362, 8, 1, 1, 6, 4, 18, 4, 19),    // villa    -> anmol
      ],
    },
  });

  it('ranks on points, then goal difference', () => {
    const t = ownerForm(standings, ownerOf, PLAYERS);
    expect(t.map((r) => r.player)).toEqual(['harshal', 'archit', 'vedant', 'anmol']);
    expect(t[0]).toMatchObject({ points: 21, gf: 20, ga: 9, diff: 11, clubs: 1 });
  });

  it('lists a player whose clubs are missing from the feed at zero', () => {
    const t = ownerForm([], ownerOf, PLAYERS);
    expect(t).toHaveLength(4);
    expect(t.every((r) => r.clubs === 0)).toBe(true);
  });

  it('names the best and worst single club by goal difference', () => {
    const { best, worst } = bestAndWorstClub(standings);
    expect(best?.clubId).toBe('arsenal');       // +11, ties with city, alphabetical
    expect(worst?.clubId).toBe('aston-villa');  // −14
  });

  it('ignores clubs that have not played rather than calling them worst', () => {
    const withUnplayed = [...standings, { clubId: 'napoli', played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, diff: 0, points: 0, rank: 20 }];
    expect(bestAndWorstClub(withUnplayed).worst?.clubId).toBe('aston-villa');
  });

  it('has no best or worst before a ball is kicked', () => {
    expect(bestAndWorstClub([])).toEqual({ best: null, worst: null });
  });
});

describe('the side-table message', () => {
  const rows = [
    { name: 'Harshal', points: 64, gf: 71, ga: 38, diff: 33, clubs: 4 },
    { name: 'Archit', points: 58, gf: 62, ga: 41, diff: 21, clubs: 4 },
    { name: 'Anmol', points: 39, gf: 44, ga: 58, diff: -14, clubs: 4 },
  ];

  it('prints the table and names the best and worst club', () => {
    const t = buildClubForm(rows,
      { club: 'Manchester City', owner: 'Harshal', diff: 22 },
      { club: 'Aston Villa', owner: 'Anmol', diff: -19 });
    expect(t).toContain('CLUB FORM · league games only');
    expect(t).toContain('Harshal');
    expect(t).toContain('Best club: Manchester City — Harshal, +22.');
    expect(t).toContain('Worst: Aston Villa — Anmol, −19.');
    expect(t).toContain('The money table says something else.');
  });

  it('says so when the feed gave nothing', () => {
    expect(buildClubForm([], null, null)).toContain('No league tables available');
    expect(buildClubForm([{ name: 'Archit', points: 0, gf: 0, ga: 0, diff: 0, clubs: 0 }], null, null))
      .toContain('No league tables available');
  });

  it('compresses to one line for the roundup', () => {
    expect(clubFormLine(rows)).toBe("Club form: Harshal's four lead on 64 points, Anmol's bottom on 39.");
    expect(clubFormLine([rows[0]])).toBeNull();
  });
});
