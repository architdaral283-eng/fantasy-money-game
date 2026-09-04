import { describe, it, expect } from 'vitest';
import { dueReminders } from '@/lib/notify/send';

describe('24h reminders (pure selection)', () => {
  const now = Date.parse('2026-09-10T10:00:00Z');
  const fx = (id: string, kickoff: string | null, status = 'SCHEDULED', sent: string | null = null) => ({
    id, status, kickoff_utc: kickoff, reminder_sent_at: sent,
  });

  it('fires once, only inside the 24h window', () => {
    const due = dueReminders([
      fx('a', '2026-09-11T09:00:00Z'), // 23h away → due
      fx('b', '2026-09-11T11:00:00Z'), // 25h away → not yet
      fx('c', '2026-09-09T10:00:00Z'), // past → no
      fx('d', '2026-09-11T09:00:00Z', 'RECORDED'), // recorded → no
      fx('e', '2026-09-11T09:00:00Z', 'SCHEDULED', '2026-09-10T09:00:00Z'), // already sent → no
      fx('f', null), // no date → no
    ], now);
    expect(due).toEqual(['a']);
  });
});
