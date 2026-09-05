import { describe, it, expect } from 'vitest';
import { inQuietHoursAt, nextDigestAt } from '@/lib/notify/quiet';

// 23:30–04:00 IST. IST = UTC+5:30, so 18:00 UTC = 23:30 IST.
describe('quiet hours', () => {
  it('holds late night through 04:00 IST', () => {
    expect(inQuietHoursAt(new Date('2026-09-10T18:00:00Z'))).toBe(true); // 23:30 IST
    expect(inQuietHoursAt(new Date('2026-09-10T20:00:00Z'))).toBe(true); // 01:30 IST
    expect(inQuietHoursAt(new Date('2026-09-10T22:30:00Z'))).toBe(false); // 04:00 IST boundary
    expect(inQuietHoursAt(new Date('2026-09-11T02:00:00Z'))).toBe(false); // 07:30 IST
  });

  it('sends during the day IST', () => {
    expect(inQuietHoursAt(new Date('2026-09-10T10:00:00Z'))).toBe(false); // 15:30 IST
  });

  it('digest releases at next 04:00 IST', () => {
    const at = nextDigestAt(new Date('2026-09-10T20:00:00Z')); // 01:30 IST
    expect(at.toISOString()).toBe('2026-09-10T22:30:00.000Z'); // 04:00 IST same night
  });
});
