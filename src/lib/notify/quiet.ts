// Quiet hours, ceiling, digest — pure time helpers + queue engine.
// Quiet window 23:30–08:00 IST. Trophy decisions always send immediately.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendHtml, fanOutPhoto } from '@/lib/notify/send';

export const QUIET_START_MIN = 4 * 60 + 30; // 04:30 IST
export const QUIET_END_MIN = 16 * 60 + 30; // 16:30 IST — daytime digest releases here
export const GROUP_DAILY_CEILING = 6;

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

async function groupSentToday(db: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('channel', 'telegram').eq('template_key', 'group').eq('status', 'SENT').gte('sent_at', since);
  return count ?? 0;
}

/** Group send with ceiling + quiet gating.nextDigestAt Urgent (trophy) always sends now. */
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
    // queued photos render fresh at release, then send
    for (const item of items.filter((i) => i.template_key === 'photo')) {
      try {
        if (!fetchPng) continue;
        const png = await fetchPng();
        const { TelegramAdapter } = await import('@/lib/notify/channels');
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) continue;
        const tg = new TelegramAdapter(token);
        if (dest === 'group') {
          const { data: g } = await db.from('config').select('value').eq('key', 'telegram_group_chat_id').single();
          const gid = (g?.value as { id?: string })?.id;
          if (gid) {
            const r = await tg.sendPhoto(gid, item.payload.caption ?? 'Standings', png);
            await db.from('notifications').insert({ player_id: null, channel: 'telegram', template_key: 'photo', payload: { caption: item.payload.caption }, status: 'SENT', provider_message_id: r.messageId });
          }
        }
        await db.from('message_queue').update({ sent_at: new Date().toISOString() }).eq('id', item.id);
        released++;
      } catch { /* next run retries */ }
    }
    const texts = items.filter((i) => i.template_key !== 'photo').map((i) => i.payload.text ?? i.payload.caption ?? '').filter(Boolean);
    if (!texts.length) continue;
    const digest = `Morning digest\n\n${texts.join('\n\n')}`;
    try {
      if (dest === 'group') {
        const { data: g } = await db.from('config').select('value').eq('key', 'telegram_group_chat_id').single();
        const gid = (g?.value as { id?: string })?.id;
        if (gid) await sendHtml(gid, digest);
      } else if (dest.startsWith('player:')) {
        const pid = dest.slice(7);
        const { data: p } = await db.from('players').select('telegram_chat_id').eq('id', pid).single();
        const chatId = (p as { telegram_chat_id?: string } | null)?.telegram_chat_id;
        if (chatId) await sendHtml(chatId, digest);
      }
      await db.from('message_queue').update({ sent_at: new Date().toISOString() }).in('id', items.map((i) => i.id));
      released += items.length;
    } catch { /* next run retries */ }
  }
  return { released };
}
