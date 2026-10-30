import { describe, expect, it } from 'vitest';
import { buildScoutBrief, type ScoutBrief } from '@/lib/notify/format';
import { scoutClubOf } from '@/lib/notify/scout-dm';
import type { ClubStanding } from '@/lib/providers/espn-standings';

const dortmund = { name: 'Borussia Dortmund', rank: 2, points: 20, played: 9, w: 6, d: 2, l: 1, gf: 22, ga: 9 };
const bayern = { name: 'Bayern Munich', rank: 1, points: 25, played: 9, w: 8, d: 1, l: 0, gf: 30, ga: 7 };

const brief: ScoutBrief = {
  whenLabel: 'Sat, 31 Oct, 23:00 IST',
  home: 'Bayern Munich',
  away: 'Borussia Dortmund',
  compId: 'bundesliga',
  compName: 'Bundesliga',
  yourClub: 'Bayern Munich',
  theirClub: 'Borussia Dortmund',
  opponent: 'Anmol',
  theirs: dortmund,
  mine: bayern,
  news: [
    { club: 'Borussia Dortmund', headline: 'Schlotterbeck ruled out for three weeks' },
    { club: 'Bayern Munich', headline: 'Musiala returns to full training' },
  ],
};

describe('the scouting DM scouts the opposition club', () => {
  it('names the club being scouted in the header, not the date', () => {
    const t = buildScoutBrief(brief);
    expect(t.startsWith('SCOUTING · Borussia Dortmund')).toBe(true);
  });

  it('gives the opposition its league standing and record', () => {
    const t = buildScoutBrief(brief);
    expect(t).toContain('Borussia Dortmund — Anmol');
    expect(t).toContain('2nd · 20 pts from 9');
    expect(t).toContain('W6 D2 L1 · 22 scored, 9 conceded');
  });

  it('shows your own club on the same terms, for comparison', () => {
    const t = buildScoutBrief(brief);
    expect(t).toContain('Your Bayern Munich');
    expect(t).toContain('1st · 25 pts from 9');
  });

  it('carries team news for both clubs, opposition first', () => {
    const t = buildScoutBrief(brief);
    expect(t).toContain('Team news');
    expect(t.indexOf('Schlotterbeck')).toBeLessThan(t.indexOf('Musiala'));
  });

  // ——— the old report, gone for good ———
  it('carries none of the player scouting it replaced', () => {
    const t = buildScoutBrief(brief);
    expect(t).not.toContain('last five');
    expect(t).not.toContain('Head to head');
    expect(t).not.toContain('Last meeting');
    expect(t).not.toContain('Win and you are');
    expect(t).not.toContain('Lose and you are');
    expect(t).not.toMatch(/You are \d/);
  });

  it('still states the stake', () => {
    expect(buildScoutBrief(brief)).toContain('₹500 on it. ₹1,000 if it is won by four.');
  });

  it('degrades to a usable message when ESPN gave nothing', () => {
    const t = buildScoutBrief({ ...brief, theirs: null, mine: null, news: [] });
    expect(t).toContain('No league table available.');
    expect(t).toContain('No team news for either club this week.');
    expect(t).toContain('Bayern Munich v Borussia Dortmund');
    expect(t).toContain('₹500 on it.');
  });

  it('says "unranked" rather than "0th" before a table exists', () => {
    const t = buildScoutBrief({ ...brief, theirs: { ...dortmund, rank: 0, points: 0, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 } });
    expect(t).toContain('unranked · 0 pts from 0');
    expect(t).not.toContain('0th');
  });
});

describe('scoutClubOf', () => {
  const row = (clubId: string): ClubStanding => ({
    clubId, rank: 2, points: 20, played: 9, w: 6, d: 2, l: 1, gf: 22, ga: 9, diff: 13,
  });

  it('finds the club in a flattened set of league boards', () => {
    const c = scoutClubOf('Borussia Dortmund', 'dortmund', [row('arsenal'), row('dortmund')]);
    expect(c?.name).toBe('Borussia Dortmund');
    expect(c?.points).toBe(20);
  });

  it('is null when no board carried that club', () => {
    expect(scoutClubOf('Juventus', 'juventus', [row('arsenal')])).toBeNull();
  });
});
