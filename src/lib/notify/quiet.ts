// Quiet hours, ceiling, digest — pure time helpers + queue engine.
// Quiet window 23:30–08:00 IST. Trophy decisions always send immediately.
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendHtml, fanOutPhoto } from '@/lib/notify/send';

export const QUIET_START_MIN = 23 * 60 + 30; // 23:30 IST
export const QUIET_END_MIN = 8 * 60; // 08:00 IST
export const GROUP_DAILY_CEILING = 6;

export function istMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

/** Pure: is this instant inside quiet hours. */
export function inQuietHoursAt(d: Date): boolean {
  const mins = istMinutes(d);
  return mins >= QUIET_START_MIN || mins < QUIET_END_MIN;
}

/** Next 08:00 IST as a Date (digest release point). */
export function nextDigestAt(from: Date): Date {
  const istNow = new Date(from.getTime() + 5.5 * 3600 * 1000);
  const y = istNow.getUTCFullYear(), m = istNow.getUTCMonth(), d = istNow.getUTCDate();
  let release = Date.UTC(y, m, d, 8, 0, 0) - 5.5 * 3600 * 1000;
  if (release <= from.getTime()) release += 24 * 3600 * 1000;
  return new Date(release);
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
    if (inQuietHoursAt(new Date())) {
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

/** Release everything due: one digest per destination. Called from the poller each run. */
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
    const texts = items.map((i) => i.payload.text ?? i.payload.caption ?? '').filter(Boolean);
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
      } else if (dest === 'photos' && fetchPng) {
        const { linkedPlayers } = await import('@/lib/notify/send');
        const tg = (await import('@/lib/notify/channels')).TelegramAdapter;
        void linkedPlayers; void tg;
      }
      await db.from('message_queue').update({ sent_at: new Date().toISOString() }).in('id', items.map((i) => i.id));
      released += items.length;
    } catch { /* next run retries */ }
  }
  return { released };
}
