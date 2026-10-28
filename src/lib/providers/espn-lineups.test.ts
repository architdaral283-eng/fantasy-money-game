import { describe, it, expect } from 'vitest';
import { parseLineups, inXI } from '@/lib/providers/espn-lineups';
import { buildTeamNews } from '@/lib/notify/format';

// 359 is Arsenal, 360 Manchester United, per TEAM_ID_MAP.
const player = (name: string, starter: boolean) => ({
  starter, athlete: { displayName: name, shortName: name.split(' ').pop() }, position: { abbreviation: 'M' },
});
const squad = (starters: number, bench: number, prefix = 'P') => [
  ...Array.from({ length: starters }, (_, i) => player(`${prefix} Player${i}`, true)),
  ...Array.from({ length: bench }, (_, i) => player(`${prefix} Sub${i}`, false)),
];

describe('reading a lineup off the summary feed', () => {
  it('returns the eleven, the formation and the bench count', () => {
    const out = parseLineups({
      rosters: [
        { team: { id: 359 }, formation: '4-3-3', roster: squad(11, 9, 'A') },
        { team: { id: 360 }, formation: '3-4-2-1', roster: squad(11, 9, 'U') },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ clubId: 'arsenal', formation: '4-3-3', bench: 9 });
    expect(out[0].xi).toHaveLength(11);
    expect(out[1].clubId).toBe('man-utd');
  });

  it('treats an unpublished lineup as nothing yet, not as an empty team', () => {
    expect(parseLineups({ rosters: [{ team: { id: 359 }, roster: [] }] })).toEqual([]);
    expect(parseLineups({ rosters: [{ team: { id: 359 }, roster: squad(0, 20) }] })).toEqual([]);
    expect(parseLineups({ rosters: [{ team: { id: 359 }, roster: squad(7, 13) }] })).toEqual([]);
  });

  it('ignores clubs nobody owns', () => {
    expect(parseLineups({ rosters: [{ team: { id: 999999 }, roster: squad(11, 9) }] })).toEqual([]);
  });

  it('survives junk instead of throwing', () => {
    expect(parseLineups(null)).toEqual([]);
    expect(parseLineups({})).toEqual([]);
    expect(parseLineups({ rosters: [{}] })).toEqual([]);
  });

  it('prefers the short name but falls back to the full one', () => {
    const out = parseLineups({
      rosters: [{
        team: { id: 359 },
        roster: [
          { starter: true, athlete: { displayName: 'Bukayo Saka' } },
          ...squad(10, 2, 'A'),
        ],
      }],
    });
    expect(out[0].xi).toContain('Bukayo Saka');
  });
});

describe('finding a named player in an eleven', () => {
  const xi = ['Raya', 'Saliba', 'Saka', 'Ødegaard'];
  it('matches on surname, however ESPN shortened it', () => {
    expect(inXI(xi, 'Bukayo Saka')).toBe(true);
    expect(inXI(xi, 'Martin Ødegaard')).toBe(true);
  });
  it('says no when he is not there', () => {
    expect(inXI(xi, 'Kai Havertz')).toBe(false);
  });
  it('says no rather than yes when asked about nobody', () => {
    expect(inXI(xi, '')).toBe(false);
  });
});

describe('the team-news DM', () => {
  const base = {
    club: 'Arsenal', opponent: 'Real Madrid', minsToKickoff: 60,
    formation: '4-3-3', xi: ['Raya', 'White', 'Saliba'], bench: 9,
  };

  it('leads with the clock and names the eleven', () => {
    const t = buildTeamNews({ ...base, marquee: 'Bukayo Saka', marqueeStarts: true });
    expect(t).toContain('TEAM NEWS · 60 minutes');
    expect(t).toContain('Arsenal v Real Madrid');
    expect(t).toContain('4-3-3');
    expect(t).toContain('Raya, White, Saliba');
    expect(t).toContain('Bukayo Saka starts.');
  });

  it('says plainly when the best player is out', () => {
    const t = buildTeamNews({ ...base, marquee: 'Bukayo Saka', marqueeStarts: false });
    expect(t).toContain('Bukayo Saka is not in the XI.');
  });

  it('says nothing about a player it has none on file for', () => {
    const t = buildTeamNews({ ...base, marquee: null, marqueeStarts: null });
    expect(t).toContain('9 on the bench.');
    expect(t).not.toContain('XI.');
  });

  it('copes with no formation published', () => {
    const t = buildTeamNews({ ...base, formation: null, marquee: null, marqueeStarts: null });
    expect(t).toContain('Arsenal v Real Madrid');
  });
});
