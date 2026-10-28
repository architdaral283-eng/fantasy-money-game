import { describe, it, expect } from 'vitest';
import { nearMiss, stakeFor, minuteNum } from '@/lib/stats/near-miss';
import { buildNearMiss, ordinal } from '@/lib/notify/format';

const g = (minute: string, player: string, clubId: string) => ({ minute, player, clubId });
const base = { homeClubId: 'arsenal', awayClubId: 'real-madrid' };

describe('minute parsing', () => {
  it('reads stoppage time as the base minute', () => {
    expect(minuteNum("90+3'")).toBe(90);
    expect(minuteNum('45')).toBe(45);
    expect(minuteNum('')).toBe(0);
  });
});

describe('the stake rule', () => {
  it('is 500 normally, 1,000 at four goals, nothing for a draw', () => {
    expect(stakeFor(2, 1)).toBe(500);
    expect(stakeFor(3, 1)).toBe(1000);
    expect(stakeFor(2, 2)).toBe(0);
    expect(stakeFor(4, 0)).toBe(1000);
  });
});

describe('the goal that decided it', () => {
  it('flags an 89th-minute winner that broke a draw', () => {
    const m = nearMiss({ ...base, h90: 1, a90: 2, goals: [g('20', 'Saka', 'arsenal'), g('44', 'Vinicius', 'real-madrid'), g("89'", 'Mbappe', 'real-madrid')] })!;
    expect(m.kind).toBe('flip');
    expect(m.before).toEqual({ h: 1, a: 1 });
    expect(m.stakeBefore).toBe(0);
    expect(m.stakeAfter).toBe(500);
    expect(m.gainedClubId).toBe('real-madrid');
    expect(m.lostClubId).toBe('arsenal');
  });

  it('flags a last-minute equaliser that rescued a defeat', () => {
    const m = nearMiss({ ...base, h90: 1, a90: 1, goals: [g('10', 'Vinicius', 'real-madrid'), g("90+4'", 'Saka', 'arsenal')] })!;
    expect(m.kind).toBe('flip');
    expect(m.minute).toBe(90);
    expect(m.gainedClubId).toBe('arsenal');
    expect(m.stakeBefore).toBe(500);
    expect(m.stakeAfter).toBe(0);
  });

  it('flags a fourth goal that doubled the bill without changing the winner', () => {
    const m = nearMiss({ ...base, h90: 3, a90: 1, goals: [g('5', 'A', 'arsenal'), g('15', 'B', 'arsenal'), g('60', 'C', 'real-madrid'), g("88'", 'D', 'arsenal')] })!;
    expect(m.kind).toBe('bonus');
    expect(m.stakeBefore).toBe(500);
    expect(m.stakeAfter).toBe(1000);
    expect(m.gainedClubId).toBe('arsenal');
  });

  it('says nothing when the late goal changed nothing', () => {
    expect(nearMiss({ ...base, h90: 3, a90: 0, goals: [g('5', 'A', 'arsenal'), g('15', 'B', 'arsenal'), g("90'", 'C', 'arsenal')] })).toBeNull();
  });

  it('says nothing when the decider was early', () => {
    expect(nearMiss({ ...base, h90: 1, a90: 0, goals: [g('12', 'A', 'arsenal')] })).toBeNull();
  });

  it('says nothing when the feed gave no goals', () => {
    expect(nearMiss({ ...base, h90: 2, a90: 1, goals: [] })).toBeNull();
  });

  it('refuses to guess when the goals do not add up to the score', () => {
    expect(nearMiss({ ...base, h90: 0, a90: 1, goals: [g("90'", 'A', 'arsenal')] })).toBeNull();
    expect(nearMiss({ ...base, h90: 1, a90: 0, goals: [g("90'", 'A', 'someone-else')] })).toBeNull();
  });
});

describe('the near-miss DM', () => {
  const n = { home: 'Arsenal', away: 'Real Madrid', h90: 1, a90: 2, minute: 89, scorer: 'Mbappe', before: { h: 1, a: 1 }, opponent: 'Vedant' };

  it('tells the loser what it cost', () => {
    const t = buildNearMiss({ ...n, kind: 'flip', delta: -500 });
    expect(t).toContain("NEAR MISS · 89'");
    expect(t).toContain('nothing was moving');
    expect(t).toContain('cost you ₹500 to Vedant');
  });

  it('tells the winner what it won', () => {
    const t = buildNearMiss({ ...n, kind: 'flip', delta: 500 });
    expect(t).toContain('took ₹500 off Vedant');
  });

  it('explains a doubled bill', () => {
    const t = buildNearMiss({ ...n, h90: 3, a90: 1, before: { h: 2, a: 1 }, kind: 'bonus', delta: -500 });
    expect(t).toContain('The fourth goal doubled it');
  });

  it('counts ordinals properly', () => {
    expect([1, 2, 3, 4, 11, 21, 89].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '21st', '89th']);
  });
});
