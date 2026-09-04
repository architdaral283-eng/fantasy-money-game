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
export async function fanOutText(db: SupabaseClient, templateKey: string, text: string, buttons?: { id: string; title: string }[], opts: { urgent?: boolean } = {}): Promise<void> {
  const { quietNow, nextDigestAt } = await import('@/lib/notify/quiet');
  const quiet = !opts.urgent && (await quietNow(db).catch(() => false));
  const tg = telegram();
  for (const p of await linkedPlayers(db)) {
    if (quiet) {
      await db.from('message_queue').insert({ dest: `player:${p.id}`, template_key: templateKey, payload: { text }, not_before: nextDigestAt(new Date()).toISOString() });
      continue;
    }
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

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

async function botCall(method: string, body: object): Promise<{ message_id?: number } | null> {
  const t = botToken();
  if (!t) return null;
  const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { result?: { message_id?: number } };
  return j.result ?? null;
}

export async function answerCallback(id: string, text?: string, alert = false): Promise<void> {
  await botCall('answerCallbackQuery', { callback_query_id: id, ...(text ? { text, show_alert: alert } : {}) });
}

/** Edit a bot message in place (approval outcome, pin refresh). Skips identical content. */
export async function editText(chatId: string | number, messageId: number, text: string, keyboard?: { text: string; callback_data: string }[][]): Promise<boolean> {
  const r = await botCall('editMessageText', {
    chat_id: chatId, message_id: messageId, text: text.slice(0, 4000), parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  return r !== null;
}

export async function pinMessage(chatId: string | number, messageId: number): Promise<void> {
  await botCall('pinChatMessage', { chat_id: chatId, message_id: messageId, disable_notification: true });
}

export async function sendHtml(chatId: string | number, text: string, keyboard?: { text: string; callback_data: string }[][]): Promise<number | null> {
  const r = await botCall('sendMessage', {
    chat_id: chatId, text: text.slice(0, 4000), parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
  return r?.message_id ?? null;
}

export async function groupId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from('config').select('value').eq('key', 'telegram_group_chat_id').single();
  return ((data?.value as { id?: string })?.id ?? null);
}

/** Zero-sum failure: loudest event. Red block to group + immediate Archit DM, any hour. */
export async function zeroSumAlert(db: SupabaseClient, detail: string): Promise<void> {
  const { sendGroup } = await import('@/lib/notify/quiet');
  const tg = telegram();
  const { data: archit } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
  const chatId = (archit as { telegram_chat_id?: string } | null)?.telegram_chat_id;
  if (tg && chatId) {
    try {
      const r = await tg.send(chatId, 'zero_sum_failure', { text: `Ledger locked. Balances do not sum to ₹0. ${detail}` });
      await log(db, 'archit', 'telegram', 'zero_sum_failure', { detail }, 'SENT', r.messageId);
    } catch (e) {
      await log(db, 'archit', 'telegram', 'zero_sum_failure', { detail }, 'FAILED', undefined, (e as Error).message);
    }
  }
  await sendGroup(db, `Ledger locked. Balances do not sum to ₹0. No further writes until it reconciles.`, { urgent: true });
  await db.from('config').upsert({ key: 'ledger_locked', value: { at: new Date().toISOString(), detail } }, { onConflict: 'key' });
}

/** Clear the lock after a successful write. */
export async function clearLedgerLock(db: SupabaseClient): Promise<boolean> {
  const { data } = await db.from('config').select('value').eq('key', 'ledger_locked').single();
  if (!data) return false;
  await db.from('config').delete().eq('key', 'ledger_locked');
  return true;
}
