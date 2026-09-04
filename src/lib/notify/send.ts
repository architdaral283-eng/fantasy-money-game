// Fan-out: send to every linked player, log every send (§7.2 cost/failure visibility).
import type { SupabaseClient } from '@supabase/supabase-js';
import { TelegramAdapter } from '@/lib/notify/channels';

export interface LinkedPlayer { id: string; name: string; telegram_chat_id: string | null }

export async function linkedPlayers(db: SupabaseClient): Promise<LinkedPlayer[]> {
  const { data } = await db.from('players').select('id,name,telegram_chat_id');
  return (data ?? []) as LinkedPlayer[];
}

function telegram(): TelegramAdapter | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t ? new TelegramAdapter(t) : null;
}

async function log(db: SupabaseClient, playerId: string | null, channel: string, templateKey: string, payload: object, status: string, messageId?: string, error?: string) {
  await db.from('notifications').insert({
    player_id: playerId, channel, template_key: templateKey,
    payload, status, provider_message_id: messageId ?? null, error: error ?? null,
  });
}

/** Text to all linked chats (Telegram now; WhatsApp/Discord later behind the flag). */
export async function fanOutText(db: SupabaseClient, templateKey: string, text: string, buttons?: { id: string; title: string }[]): Promise<void> {
  const tg = telegram();
  for (const p of await linkedPlayers(db)) {
    if (!p.telegram_chat_id || !tg) {
      await log(db, p.id, 'telegram', templateKey, { text }, 'SKIPPED', undefined, !tg ? 'no bot token' : 'player not linked');
      continue;
    }
    try {
      const r = await tg.send(p.telegram_chat_id, templateKey, { text, buttons });
      await log(db, p.id, 'telegram', templateKey, { text }, 'SENT', r.messageId);
    } catch (e) {
      await log(db, p.id, 'telegram', templateKey, { text }, 'FAILED', undefined, (e as Error).message);
    }
  }
}

/** Standings PNG to all linked chats. fetchPng builds the image bytes. */
export async function fanOutPhoto(db: SupabaseClient, templateKey: string, caption: string, fetchPng: () => Promise<ArrayBuffer>): Promise<void> {
  const tg = telegram();
  let png: ArrayBuffer | null = null;
  for (const p of await linkedPlayers(db)) {
    if (!p.telegram_chat_id || !tg) {
      await log(db, p.id, 'telegram', templateKey, { caption }, 'SKIPPED', undefined, !tg ? 'no bot token' : 'player not linked');
      continue;
    }
    try {
      png = png ?? (await fetchPng());
      const r = await tg.sendPhoto(p.telegram_chat_id, caption, png);
      await log(db, p.id, 'telegram', templateKey, { caption }, 'SENT', r.messageId);
    } catch (e) {
      await log(db, p.id, 'telegram', templateKey, { caption }, 'FAILED', undefined, (e as Error).message);
    }
  }
}

/** One-tap approval request to Archit only, with inline Approve/Reject buttons. */
export async function notifyArchitApproval(db: SupabaseClient, approvalId: string, text: string): Promise<void> {
  const tg = telegram();
  const { data: archit } = await db.from('players').select('id,telegram_chat_id').eq('id', 'archit').single();
  const chatId = (archit as { telegram_chat_id?: string } | null)?.telegram_chat_id;
  if (!tg || !chatId) {
    await log(db, 'archit', 'telegram', 'result_approval_request', { text }, 'SKIPPED', undefined, !tg ? 'no bot token' : 'archit not linked');
    return;
  }
  try {
    const sent = await tg.send(chatId, 'result_approval_request', {
      text,
      buttons: [
        { id: `approve:${approvalId}`, title: 'Approve' },
        { id: `reject:${approvalId}`, title: 'Reject' },
      ],
    });
    await db.from('pending_approvals').update({ provider_message_id: sent.messageId }).eq('id', approvalId);
    await log(db, 'archit', 'telegram', 'result_approval_request', { text }, 'SENT', sent.messageId);
  } catch (e) {
    await log(db, 'archit', 'telegram', 'result_approval_request', { text }, 'FAILED', undefined, (e as Error).message);
  }
}

/** Pure: which scheduled fixtures need a 24h reminder right now. */
export function dueReminders(
  fixtures: { id: string; status: string; kickoff_utc: string | null; reminder_sent_at: string | null }[],
  nowMs: number,
): string[] {
  const DAY = 24 * 3600 * 1000;
  return fixtures
    .filter((f) => f.status === 'SCHEDULED' && !f.reminder_sent_at && f.kickoff_utc)
    .filter((f) => {
      const k = Date.parse(f.kickoff_utc as string);
      return k > nowMs && k - nowMs <= DAY;
    })
    .map((f) => f.id);
}
