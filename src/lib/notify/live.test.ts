import { describe, it, expect } from 'vitest';
import { isLive } from '@/lib/providers/espn';
import { buildPinText, countdown } from '@/lib/notify/panel';

const rows = [
  { name: 'Archit', net: 3000, w: 8, l: 2, d: 1 },
  { name: 'Vedant', net: -3000, w: 2, l: 8, d: 1 },
];

describe('what counts as live', () => {
  it('accepts the halves, the break and extra time', () => {
    for (const status of ['STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_HALFTIME', 'STATUS_SECOND_HALF', 'STATUS_EXTRA_TIME', 'STATUS_SHOOTOUT']) {
      expect(isLive({ status, completed: false }), status).toBe(true);
    }
  });

  it('refuses anything finished, however it finished', () => {
    for (const status of ['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_PEN']) {
      expect(isLive({ status, completed: true }), status).toBe(false);
    }
  });

  it('refuses a scheduled or postponed match', () => {
    expect(isLive({ status: 'STATUS_SCHEDULED', completed: false })).toBe(false);
    expect(isLive({ status: 'STATUS_POSTPONED', completed: false })).toBe(false);
  });

  it('refuses a status it has never seen rather than guessing', () => {
    expect(isLive({ status: 'STATUS_SOMETHING_NEW', completed: false })).toBe(false);
  });
});

describe('the pinned panel', () => {
  it('leads with the live match when there is one', () => {
    const t = buildPinText(rows, 12, 63, null, '21:40', [
      { home: 'Arsenal', away: 'Real Madrid', h: 1, a: 2, clock: "67'" },
    ]);
    expect(t.startsWith('● LIVE')).toBe(true);
    expect(t).toContain("Arsenal 1–2 Real Madrid  67'");
    expect(t).toContain('LEAGUE TABLE');
  });

  it('leads with the table when nothing is being played', () => {
    expect(buildPinText(rows, 12, 63, null, '21:40').startsWith('LEAGUE TABLE')).toBe(true);
  });

  it('shows two matches at once', () => {
    const t = buildPinText(rows, 12, 63, null, '21:40', [
      { home: 'Arsenal', away: 'Real Madrid', h: 1, a: 2, clock: "67'" },
      { home: 'Bayern', away: 'Napoli', h: 0, a: 0, clock: 'HT' },
    ]);
    expect(t).toContain('Bayern 0–0 Napoli  HT');
  });

  it('copes with no clock', () => {
    const t = buildPinText(rows, 12, 63, null, '21:40', [
      { home: 'Arsenal', away: 'Real Madrid', h: 1, a: 2, clock: '' },
    ]);
    expect(t).toContain('Arsenal 1–2 Real Madrid');
  });

  it('carries the countdown on the next fixture', () => {
    const t = buildPinText(rows, 12, 63, {
      home: 'Barcelona', away: 'Real Madrid', ownerA: 'Anmol', ownerB: 'Vedant',
      whenIST: '01:30', inText: 'in 2d 14h',
    }, '21:40');
    expect(t).toContain('01:30 IST · in 2d 14h');
  });
});

describe('the countdown', () => {
  it('reads in days, hours and minutes', () => {
    expect(countdown(3 * 864e5 + 2 * 36e5)).toBe('in 3d 2h');
    expect(countdown(5 * 36e5 + 20 * 6e4)).toBe('in 5h 20m');
    expect(countdown(40 * 6e4)).toBe('in 40 min');
    expect(countdown(3 * 36e5)).toBe('in 3h');
    expect(countdown(2 * 864e5)).toBe('in 2d');
  });

  it('goes quiet once kickoff has passed', () => {
    expect(countdown(0)).toBeNull();
    expect(countdown(-5000)).toBeNull();
    expect(countdown(NaN)).toBeNull();
  });

  it('does not say "in 0 min"', () => {
    expect(countdown(20_000)).toBe('any moment');
  });
});
