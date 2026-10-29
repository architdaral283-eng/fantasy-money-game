// Quiet hours, ceiling, digest — pure time helpers + queue engine.
// Quiet window 04:30–16:29 IST = the no-polling daytime window (earliest kickoff
// is 17:00 IST). 16:30–04:29 IST is live: group messages send immediately.
// Non-urgent messages raised during quiet hours queue for the 16:30 digest.
// Trophy decisions and pre-match warnings (urgent) always send immediately.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendHtml } from '@/lib/notify/send';

export const QUIET_START_MIN = 4 * 60 + 30; // 04:30 IST
export const QUIET_END_MIN = 16 * 60 + 30; // 16:30 IST — daytime digest releases here
// Sized for the worst real day, now that the count is honest.
//
// Four counted fixtures in 24 hours, each spending a warning, a lineup card,
// a roast carrying its poll verdict and a standings image — sixteen. Add the
// reminders and polls for the next day's four, the 09:00 matchday brief and
// the 23:00 news brief, and a genuinely busy Wednesday reaches about
// twenty-six. On the 1st of a month in a week with a Sunday roundup, higher.
//
// Forty leaves room for that and still does the only job this number was
// ever for: stopping a provider loop or a retry storm emptying itself into
// the group. Nothing over the ceiling is dropped — it queues to 16:30 — but
// a roast arriving a day late is a roast nobody wants.
export const GROUP_DAILY_CEILING = 40;

export function istMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

/** Pure: is this instant inside quiet hours (04:30–16:29 IST, no wraparound). */
export function inQuietHoursAt(d: Date): boolean {
  const mins = istMinutes(d);
  return mins >= QUIET_START_MIN && mins < QUIET_END_MIN;
}

/** Next 16:30 IST as a Date (digest release point). */
export function nextDigestAt(from: Date): Date {
  const istNow = new Date(from.getTime() + 5.5 * 3600 * 1000);
  const y = istNow.getUTCFullYear(), m = istNow.getUTCMonth(), d = istNow.getUTCDate();
  let release = Date.UTC(y, m, d, 16, 30, 0) - 5.5 * 3600 * 1000;
  if (release <= from.getTime()) release += 24 * 3600 * 1000;
  return new Date(release);
}

/** Effective quiet state: Commissioner override wins, else the clock. */
export async function quietNow(db: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await db.from('config').select('value').eq('key', 'quiet_override').single();
    const mode = (data?.value as { mode?: string })?.mode;
    if (mode === 'off') return false;
    if (mode === 'on') return true;
  } catch { /* fall through to clock */ }
  return inQuietHoursAt(new Date());
}

export async function architAwake(db: SupabaseClient, windowMin = 15): Promise<boolean> {
  const { data } = await db.from('config').select('value').eq('key', 'last_inbound_archit').single();
  const at = (data?.value as { at?: string })?.at;
  if (!at) return false;
  return Date.now() - Date.parse(at) < windowMin * 60 * 1000;
}

export async function markInbound(db: SupabaseClient, playerId: string): Promise<void> {
  await db.from('config').upsert({ key: `last_inbound_${playerId}`, value: { at: new Date().toISOString() } }, { onConflict: 'key' });
}

/** Set once, the first time the bot sees an ordinary group message. */
export const CHATTER_KEY = 'group_chatter_seen';

/**
 * An ordinary group message from one of the four.
 *
 * markInbound() used to fire only for commands, DMs and button taps, because
 * ordinary group messages returned early. "Who has gone quiet" was therefore
 * measuring when somebody last typed a slash command, and would have named
 * people as silent while they were talking.
 *
 * The first one ever recorded also proves the bot can see chatter at all: a
 * bot in privacy mode that is not a group admin never receives ordinary
 * messages, and in that case the marker is never set and the silence line
 * never runs.
 */
export async function markChatter(db: SupabaseClient, playerId: string): Promise<void> {
  await markInbound(db, playerId);
  await db.from('config').upsert(
    { key: CHATTER_KEY, value: { first_at: new Date().toISOString() } },
    { onConflict: 'key', ignoreDuplicates: true },
  );
}

/**
 * Everything the group has actually received in 24h.
 *
 * This used to count template_key 'group' only, which is TEXT. Photos log as
 * 'photo' and polls logged nothing at all, so a standings image, a lineup
 * card and a prediction poll were all invisible to the ceiling while still
 * being gated by it — the bot could post twice what it thought it had and
 * the number meant nothing. A message in the group is a message in the
 * group, whatever shape it arrived in.
 */
const GROUP_KINDS = ['group', 'photo', 'poll'];

async function groupSentToday(db: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('channel', 'telegram').in('template_key', GROUP_KINDS).eq('status', 'SENT').gte('sent_at', since);
  return count ?? 0;
}

/** Group send with ceiling + quiet gating. Urgent (trophy, pre-match) always sends now. */
export async function sendGroup(db: SupabaseClient, text: string, opts: { urgent?: boolean } = {}): Promise<void> {
  const { data: g } = await db.from('config').select('value').eq('key', 'telegram_group_chat_id').single();
  const gid = (g?.value as { id?: string })?.id;
  if (!gid) return;
  if (!opts.urgent) {
    if (await quietNow(db)) {
      await db.from('message_queue').insert({ dest: 'group', template_key: 'group', payload: { text }, not_before: nextDigestAt(new Date()).toISOString() });
      return;
    }
    if ((await groupSentToday(db)) >= GROUP_DAILY_CEILING) {
      await db.from('message_queue').insert({ dest: 'group', template_key: 'group', payload: { text }, not_before: nextDigestAt(new Date()).toISOString() });
      return;
    }
  }
  const id = await sendHtml(gid, text);
  await db.from('notifications').insert({ player_id: null, channel: 'telegram', template_key: 'group', payload: { text }, status: id ? 'SENT' : 'FAILED', provider_message_id: id ? String(id) : null });
}

/** Group photo with the same quiet/ceiling discipline as text. PNG renders at send time. */
export async function sendGroupPhoto(db: SupabaseClient, caption: string, fetchPng: () => Promise<ArrayBuffer>, opts: { urgent?: boolean } = {}): Promise<void> {
  const { data: g } = await db.from('config').select('value').eq('key', 'telegram_group_chat_id').single();
  const gid = (g?.value as { id?: string })?.id;
  if (!gid) return;
  if (!opts.urgent && ((await quietNow(db)) || (await groupSentToday(db)) >= GROUP_DAILY_CEILING)) {
    await db.from('message_queue').insert({ dest: 'group', template_key: 'photo', payload: { caption }, not_before: nextDigestAt(new Date()).toISOString() });
    return;
  }
  const { TelegramAdapter } = await import('@/lib/notify/channels');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const tg = new TelegramAdapter(token);
  try {
    const png = await fetchPng();
    const r = await tg.sendPhoto(gid, caption, png);
    await db.from('notifications').insert({ player_id: null, channel: 'telegram', template_key: 'photo', payload: { caption }, status: 'SENT', provider_message_id: r.messageId });
  } catch {
    await db.from('message_queue').insert({ dest: 'group', template_key: 'photo', payload: { caption }, not_before: new Date().toISOString() });
  }
}
export async function drainQueue(db: SupabaseClient, fetchPng?: () => Promise<ArrayBuffer>): Promise<{ released: number }> {
  const { data: due } = await db.from('message_queue').select('*').is('sent_at', null).lte('not_before', new Date().toISOString()).order('created_at').limit(50);
  const rows = (due ?? []) as { id: number; dest: string; template_key: string; payload: { text?: string; caption?: string } }[];
  if (!rows.length) return { released: 0 };
  const byDest = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byDest.get(r.dest) ?? [];
    list.push(r);
    byDest.set(r.dest, list);
  }
  let released = 0;
  for (const [dest, items] of byDest) {
    // Resolve the chat once per destination.
    let chatId: string | null = null;
    if (dest === 'group') {
      const { data: g } = await db.from('config').select('value').eq('key', 'telegram_group_chat_id').single();
      chatId = (g?.value as { id?: string })?.id ?? null;
    } else if (dest.startsWith('player:')) {
      const { data: p } = await db.from('players').select('telegram_chat_id').eq('id', dest.slice(7)).single();
      chatId = (p as { telegram_chat_id?: string } | null)?.telegram_chat_id ?? null;
    }
    if (!chatId) continue;

    // TEXTS FIRST, each as its own message, in the order they were raised.
    // This used to send photos first and glue every text into one "Morning
    // digest" (released at 16:30, so not even morning) — a held result
    // arrived as a standings image followed by a mangled copy of itself.
    for (const item of items.filter((i) => i.template_key !== 'photo')) {
      const text = item.payload.text ?? item.payload.caption ?? '';
      try {
        if (text) await sendHtml(chatId, text);
        await db.from('message_queue').update({ sent_at: new Date().toISOString() }).eq('id', item.id);
        released++;
      } catch { /* next run retries */ }
    }

    // THEN photos, rendered fresh at release so they show the table as it is now.
    for (const item of items.filter((i) => i.template_key === 'photo')) {
      try {
        if (!fetchPng) continue;
        const png = await fetchPng();
        const { TelegramAdapter } = await import('@/lib/notify/channels');
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) continue;
        const r = await new TelegramAdapter(token).sendPhoto(chatId, item.payload.caption ?? '', png);
        if (dest === 'group') {
          await db.from('notifications').insert({ player_id: null, channel: 'telegram', template_key: 'photo', payload: { caption: item.payload.caption }, status: 'SENT', provider_message_id: r.messageId });
        }
        await db.from('message_queue').update({ sent_at: new Date().toISOString() }).eq('id', item.id);
        released++;
      } catch { /* next run retries */ }
    }
  }
  return { released };
}
