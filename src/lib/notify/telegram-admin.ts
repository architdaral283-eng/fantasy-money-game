// Registering the webhook and the "/" menu.
//
// Both live on Telegram's servers, not in this repo. The bot token lives in
// Vercel and nowhere else — not in .env, not on anyone's Desktop — so this
// runs server-side, triggered by a Commissioner-only /setup, rather than from
// a laptop that would need a copy of the token to do it.

import { playerCommands } from '@/lib/notify/format';

const API = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function call(method: string, body: object): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  try {
    const res = await fetch(API(method), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; description?: string };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  }
}

export interface SetupReport {
  webhook: boolean;
  webhookError?: string;
  allowedUpdates: string[];
  menu: { scope: string; ok: boolean; error?: string }[];
  commands: number;
}

/**
 * Re-register everything Telegram holds on our behalf.
 *
 * Two traps, both of which have cost this project a day:
 *
 * 1. allowed_updates REPLACES the list. Anything omitted silently stops being
 *    delivered, and poll_answer is not in the default set at all — without it
 *    the prediction league collects taps and scores nothing, with no error.
 * 2. setWebhook without secret_token CLEARS the secret, after which every
 *    update arrives without the X-Telegram-Bot-Api-Secret-Token header and
 *    the handler rejects all of them.
 */
export async function registerWithTelegram(appUrl: string): Promise<SetupReport> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const commands = playerCommands();

  const report: SetupReport = { webhook: false, allowedUpdates: [], menu: [], commands: commands.length };

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    report.webhookError = 'TELEGRAM_BOT_TOKEN is not set on the server.';
    return report;
  }
  if (!secret) {
    // Better to leave the working registration alone than to replace it with
    // one that has no secret and rejects every update.
    report.webhookError = 'TELEGRAM_WEBHOOK_SECRET is not set; refusing to clear the webhook secret.';
    return report;
  }

  const hook = await call('setWebhook', {
    url: `${appUrl}/api/webhook/telegram`,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'poll_answer', 'my_chat_member'],
  });
  report.webhook = hook.ok;
  if (!hook.ok) report.webhookError = hook.description;

  try {
    const info = await fetch(API('getWebhookInfo')).then((r) => r.json()) as {
      result?: { allowed_updates?: string[] };
    };
    report.allowedUpdates = info.result?.allowed_updates ?? [];
  } catch { /* reported as empty */ }

  // Every scope, not just the default: a list set for all_private_chats
  // silently overrides the default one, which is how a BotFather edit can
  // look like it did nothing at all.
  for (const scope of ['default', 'all_private_chats', 'all_group_chats'] as const) {
    const r = await call('setMyCommands', { scope: { type: scope }, commands });
    report.menu.push({ scope, ok: r.ok, error: r.ok ? undefined : r.description });
  }

  return report;
}

export function setupReportText(r: SetupReport): string {
  const lines = [
    `Webhook: ${r.webhook ? 'registered' : `FAILED — ${r.webhookError ?? 'unknown'}`}`,
    `Updates: ${r.allowedUpdates.length ? r.allowedUpdates.join(', ') : '(default — poll_answer NOT included)'}`,
    `Menu: ${r.menu.filter((m) => m.ok).length}/${r.menu.length} scopes, ${r.commands} commands`,
  ];
  const failed = r.menu.filter((m) => !m.ok);
  for (const f of failed) lines.push(`  ${f.scope}: ${f.error ?? 'failed'}`);
  if (!r.allowedUpdates.includes('poll_answer')) {
    lines.push('', 'poll_answer is missing. Prediction votes will not be delivered.');
  } else {
    lines.push('', 'Force-quit Telegram to see the new menu; it caches on the device.');
  }
  return lines.join('\n');
}
