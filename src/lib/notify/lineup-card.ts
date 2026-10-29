// Posting the pre-match lineup card to the group.
//
// It follows the 30-minute warning rather than racing it: ESPN publishes team
// sheets about an hour out, so without a gate the card would have arrived
// BEFORE the warning it is supposed to accompany.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Render and post the card. Returns false when ESPN has not published the
 * sheets yet — the normal answer early in the window, and the reason the
 * caller must not mark the fixture done on a false.
 */
export async function postLineupCard(db: SupabaseClient, fixtureId: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app';
  const res = await fetch(`${appUrl}/api/og/lineup?fixture=${encodeURIComponent(fixtureId)}`, { cache: 'no-store' });
  // 404 is "not published yet", not a failure.
  if (!res.ok) return false;
  const png = await res.arrayBuffer();
  if (png.byteLength < 1000) return false;

  const { sendGroupPhoto } = await import('@/lib/notify/quiet');
  // urgent: a lineup held by the ceiling or by quiet hours would be released
  // at 16:30 the following day, long after the match it describes.
  await sendGroupPhoto(db, '', async () => png, { urgent: true });
  return true;
}
