import { describe, it, expect } from 'vitest';
import { inQuietHoursAt, nextDigestAt } from '@/lib/notify/quiet';

// Quiet = the dead window 04:30–16:29 IST. Evenings and nights are always live.
// IST = UTC+5:30.
describe('quiet hours', () => {
  it('holds 04:30 to 16:29 IST', () => {
    expect(inQuietHoursAt(new Date('2026-09-10T23:00:00Z'))).toBe(true); // 04:30 IST
    expect(inQuietHoursAt(new Date('2026-09-11T05:00:00Z'))).toBe(true); // 10:30 IST
    expect(inQuietHoursAt(new Date('2026-09-11T10:59:00Z'))).toBe(true); // 16:29 IST
  });

  it('live through evenings and UCL nights', () => {
    expect(inQuietHoursAt(new Date('2026-09-10T18:00:00Z'))).toBe(false); // 23:30 IST
    expect(inQuietHoursAt(new Date('2026-09-10T21:00:00Z'))).toBe(false); // 02:30 IST
    expect(inQuietHoursAt(new Date('2026-09-11T11:00:00Z'))).toBe(false); // 16:30 IST boundary
  });

  it('digest releases at next 16:30 IST', () => {
    const at = nextDigestAt(new Date('2026-09-11T00:00:00Z')); // 05:30 IST
    expect(at.toISOString()).toBe('2026-09-11T11:00:00.000Z'); // 16:30 IST same day
  });
});
