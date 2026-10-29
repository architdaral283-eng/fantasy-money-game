// Fixtures that get called off.
//
// Nothing handled this before. A postponed match kept status SCHEDULED with
// its original kickoff, so the poller hunted for a result that was never
// coming, the 30-minute warning fired for a match nobody was playing, and a
// prediction poll sat open on it. Four domestic cups and a European winter
// make this a matter of when, not if.

import type { SupabaseClient } from '@supabase/supabase-js';
import { espnScoreboard, espnDateOf, findMatch, isOff, offReason, ESPN_LEAGUE } from '@/lib/providers/espn';
import { buildPostponed } from '@/lib/notify/format';

interface Candidate {
  id: string; home_club_id: string; away_club_id: string;
  competition_id: string; kickoff_utc: string;
  reminder_sent_at: string | null; pre_match_sent_at: string | null;
}

/**
 * Find fixtures the provider says are off, and undo everything we did on the
 * assumption they were on. Returns how many were cleared.
 */
export async function sweepPostponed(db: SupabaseClient, nowMs = Date.now()): Promise<number> {
  const { data: fx } = await db.from('fixtures')
    .select('id,home_club_id,away_club_id,competition_id,kickoff_utc,reminder_sent_at,pre_match_sent_at')
    .eq('status', 'SCHEDULED')
    .gte('kickoff_utc', new Date(nowMs - 6 * 3600 * 1000).toISOString())
    .lte('kickoff_utc', new Date(nowMs + 26 * 3600 * 1000).toISOString());

  const candidates = (fx ?? []) as Candidate[];
  if (!candidates.length) return 0;

  const { data: clubs } = await db.from('clubs').select('id,name');
  const nameOf = (id: string) =>
    ((clubs ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;

  const cache = new Map<string, ReturnType<typeof espnScoreboard>>();
  const board = (compId: string, iso: string) => {
    if (!ESPN_LEAGUE[compId]) return null;
    const key = `${compId}:${espnDateOf(iso)}`;
    if (!cache.has(key)) cache.set(key, espnScoreboard(compId, espnDateOf(iso)));
    return cache.get(key)!;
  };

  let cleared = 0;
  for (const f of candidates) {
    try {
      const p = board(f.competition_id, f.kickoff_utc);
      if (!p) continue;
      const m = findMatch(await p, f.home_club_id, f.away_club_id, f.kickoff_utc);
      if (!m || !isOff(m)) continue;

      // A poll on a match that was never played cannot be settled, and the
      // row is keyed on fixture_id, so leaving it would block a new poll when
      // the tie is replayed. Close it on Telegram, then drop it; predictions
      // cascade.
      const { data: pollRow } = await db.from('prediction_polls')
        .select('poll_id,chat_id,message_id').eq('fixture_id', f.id).maybeSingle();
      const hadPoll = !!pollRow;
      if (pollRow) {
        const { stopPoll } = await import('@/lib/notify/send');
        const poll = pollRow as { chat_id: string; message_id: number };
        await stopPoll(poll.chat_id, poll.message_id).catch(() => false);
        await db.from('prediction_polls').delete().eq('fixture_id', f.id);
      }

      const wasAnnounced = !!(f.reminder_sent_at || f.pre_match_sent_at);
      if (wasAnnounced) {
        const { sendGroup } = await import('@/lib/notify/quiet');
        await sendGroup(db, buildPostponed({
          home: nameOf(f.home_club_id), away: nameOf(f.away_club_id),
          reason: offReason(m), wasAnnounced, hadPoll,
        }), { urgent: true });
      }

      // Clear the date and every "we already told them" flag. The schedule
      // sync fills the new date in later and the whole cycle runs again from
      // scratch — reminder, poll, warning, card.
      await db.from('fixtures').update({
        kickoff_utc: null,
        reminder_sent_at: null,
        pre_match_sent_at: null,
        lineup_sent_at: null,
        provider_fixture_id: null,
      }).eq('id', f.id);
      cleared++;
    } catch { /* one fixture failing must not stop the sweep */ }
  }
  return cleared;
}
