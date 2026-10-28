import { describe, it, expect } from 'vitest';
import { buildIcs, icsEscape, fold, icsStamp } from '@/lib/calendar/ics';

describe('ics escaping', () => {
  it('escapes the four special characters', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});

describe('line folding', () => {
  it('leaves short lines alone', () => {
    expect(fold('SUMMARY:Arsenal v Real Madrid')).toBe('SUMMARY:Arsenal v Real Madrid');
  });
  it('folds long lines with a leading space on continuations', () => {
    const out = fold('SUMMARY:' + 'x'.repeat(200));
    const parts = out.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0].length).toBe(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe('SUMMARY:' + 'x'.repeat(200));
  });
  it('never splits a multi-byte character', () => {
    const out = fold('SUMMARY:' + 'é'.repeat(80));
    expect(out).not.toContain('�');
    expect(out.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe('SUMMARY:' + 'é'.repeat(80));
  });
});

describe('timestamps', () => {
  it('writes UTC basic format', () => {
    expect(icsStamp('2026-10-31T18:30:00.000Z')).toBe('20261031T183000Z');
  });
});

describe('the feed', () => {
  const ics = buildIcs([{
    uid: 'fixture-1@fantasy-money-game',
    startUtc: '2026-10-31T20:00:00Z',
    minutes: 120,
    summary: 'Arsenal v Real Madrid — Archit v Vedant',
    description: '₹500 on it; ₹1,000 if it finishes 4+',
    alarmMinutes: 30,
  }], 'Fantasy Money Game', '2026-10-28T12:00:00Z');

  it('opens and closes a valid calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
  });

  it('uses CRLF line endings throughout', () => {
    expect(ics.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r'))).toBe(true);
  });

  it('carries the event, its end, and an alarm', () => {
    expect(ics).toContain('DTSTART:20261031T200000Z');
    expect(ics).toContain('DTEND:20261031T220000Z');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics).toContain('UID:fixture-1@fantasy-money-game');
  });

  it('escapes the semicolon in the description', () => {
    expect(ics).toContain('\\;');
  });

  it('is still valid with no events at all', () => {
    const empty = buildIcs([], 'Empty');
    expect(empty).toContain('BEGIN:VCALENDAR');
    expect(empty).not.toContain('BEGIN:VEVENT');
  });
});
