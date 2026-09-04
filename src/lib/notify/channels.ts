// Notification channels — §7.1. Telegram active, WhatsApp behind a feature flag.
export interface NotifyParams {
  text: string;
  buttons?: { id: string; title: string }[];
}

export interface NotificationChannel {
  readonly key: 'whatsapp' | 'telegram';
  send(playerId: string, templateKey: string, params: NotifyParams): Promise<{ messageId: string }>;
}

export class TelegramAdapter implements NotificationChannel {
  readonly key = 'telegram' as const;
  constructor(private botToken: string) {}
  async send(playerId: string, templateKey: string, params: NotifyParams): Promise<{ messageId: string }> {
    // playerId here is the telegram_chat_id; resolved by the caller from players table.
    const body: Record<string, unknown> = {
      chat_id: playerId,
      text: `*${templateKey}*\n${params.text}`,
      parse_mode: 'Markdown',
    };
    if (params.buttons?.length) {
      body.reply_markup = {
        inline_keyboard: [params.buttons.map((b) => ({ text: b.title, callback_data: b.id }))],
      };
    }
    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`telegram ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { result?: { message_id?: number } };
    return { messageId: String(json.result?.message_id ?? 'unknown') };
  }
}

export class WhatsAppCloudAdapter implements NotificationChannel {
  readonly key = 'whatsapp' as const;
  constructor(
    private accessToken: string,
    private phoneNumberId: string,
  ) {}
  async send(playerId: string, templateKey: string, params: NotifyParams): Promise<{ messageId: string }> {
    // Meta Cloud API: template messages only outside the 24h window (§7.2).
    // Interactive reply buttons (max 3) for approval requests.
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: playerId, // E.164
      type: 'template',
      template: {
        name: templateKey,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: params.text.slice(0, 1024) }] }],
      },
    };
    const res = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`whatsapp ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { messageId: json.messages?.[0]?.id ?? 'unknown' };
  }
}

/** Approval message body — must decide without opening the app (§6). */
export function approvalMessageText(args: {
  competition: string; home: string; away: string;
  homeOwner: string; awayOwner: string; scoreline: string; status: string;
  margin: number; amount: number; winner: string; loser: string;
  balances: Record<string, number>; singleSource: boolean;
}): string {
  const b = Object.entries(args.balances).map(([p, v]) => `${p}: ₹${v}`).join(', ');
  return [
    `${args.competition}: ${args.home} (${args.homeOwner}) ${args.scoreline} ${args.away} (${args.awayOwner})`,
    `Status ${args.status} · margin ${args.margin} · ₹${args.amount} ${args.winner} ← ${args.loser}`,
    `Balances after: ${b}${args.singleSource ? ' · SINGLE SOURCE' : ''}`,
  ].join('\n');
}
