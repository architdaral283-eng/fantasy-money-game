import { NextResponse } from 'next/server';
import { parseCommand, parseOneLine } from '@/lib/parse/one-line';

/** Telegram webhook: read commands + one-line fallback reporting (§7.3). */
export async function POST(req: Request) {
  const update = (await req.json().catch(() => null)) as {
    message?: { text?: string; chat?: { id?: number }; from?: { id?: number } };
  } | null;
  const text = update?.message?.text?.trim() ?? '';
  if (!text) return NextResponse.json({ ok: true });
  const cmd = parseCommand(text);
  if (cmd) {
    // TODO: look up standings/fixtures/etc. and reply via TelegramAdapter.
    return NextResponse.json({ ok: true, command: cmd });
  }
  const parsed = parseOneLine(text);
  if ('error' in parsed) {
    // TODO: reply with helpful message, never silent failure.
    return NextResponse.json({ ok: true, error: parsed.error });
  }
  // TODO: insert pending_approval (poller-equivalent, Archit still approves).
  return NextResponse.json({ ok: true, parsed });
}
