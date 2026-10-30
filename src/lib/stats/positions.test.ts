import { describe, expect, it } from 'vitest';
import { POSITION_COMPS, sectionFor } from '@/lib/stats/positions';
import type { ClubStanding } from '@/lib/providers/espn-standings';

const s = (clubId: string, rank: number, points: number, played = 10): ClubStanding => ({
  clubId, rank, points, played, w: 0, d: 0, l: 0, gf: 0, ga: 0, diff: 0,
});

describe('sectionFor', () => {
  it('orders by rank, best first', () => {
    const sec = sectionFor('epl', 'Premier League', [s('man-city', 4, 19), s('arsenal', 1, 24), s('aston-villa', 11, 12)]);
    expect(sec?.rows.map((r) => r.clubId)).toEqual(['arsenal', 'man-city', 'aston-villa']);
  });

  it('keeps points when ESPN has no rank yet, and sorts those by points', () => {
    const sec = sectionFor('ucl', 'Champions League', [s('inter', 0, 7), s('napoli', 0, 10)]);
    expect(sec?.rows.map((r) => r.clubId)).toEqual(['napoli', 'inter']);
    expect(sec?.rows[0].points).toBe(10);
  });

  it('puts ranked rows ahead of unranked ones', () => {
    const sec = sectionFor('epl', 'Premier League', [s('arsenal', 0, 99), s('man-utd', 7, 15)]);
    expect(sec?.rows.map((r) => r.clubId)).toEqual(['man-utd', 'arsenal']);
  });

  it('drops a club that has neither played nor been ranked', () => {
    const sec = sectionFor('epl', 'Premier League', [s('arsenal', 0, 0, 0), s('man-utd', 7, 15)]);
    expect(sec?.rows.map((r) => r.clubId)).toEqual(['man-utd']);
  });

  it('is null when the board is empty or wholly unplayed', () => {
    expect(sectionFor('epl', 'Premier League', [])).toBeNull();
    expect(sectionFor('epl', 'Premier League', [s('arsenal', 0, 0, 0)])).toBeNull();
  });

  it('covers the four leagues and the Champions League, in printing order', () => {
    expect(POSITION_COMPS.map(([id]) => id)).toEqual(['epl', 'laliga', 'bundesliga', 'seriea', 'ucl']);
  });
});
