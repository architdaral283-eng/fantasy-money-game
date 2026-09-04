import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { approveProposal } from '@/lib/ledger/writer';
import { fanOutPhoto, fanOutText, notifyArchitApproval } from '@/lib/notify/send';
import { parseCommand, parseOneLine } from '@/lib/parse/one-line';
import { submitManualLine } from '@/lib/entry/submit';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app';

async function tgApi(method: string, body: object) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

/**
 * Telegram webhook: player linking, one-line fallback reporting (§7.3),
 * read commands, and Approve/Reject inline buttons (§6).
 * Approve → write ledger → standings photo to all linked chats.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (process.env.TELEGRAM_WEBHOOK_SECRET && url.searchParams.get('secret') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as {
    message?: { text?: string; chat?: { id?: number } };
    callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number }; message_id?: number }; from?: { id?: number } };
  } | null;
  if (!update) return NextResponse.json({ ok: true });
  const db = supabaseService();

  // ——— inline button taps ———
  if (update.callback_query?.data) {
    const [action, approvalId] = (update.callback_query.data as string).split(':');
    const fromId = update.callback_query.from?.id;
    const { data: archit } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
    if (String(archit?.telegram_chat_id ?? '') !== String(fromId ?? '')) {
      await tgApi('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: 'Commissioner only.', show_alert: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'reject') {
      await db.from('pending_approvals').update({ status: 'REJECTED', decided_at: new Date().toISOString(), decided_by: 'archit' }).eq('id', approvalId);
      await tgApi('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: 'Rejected.' });
      return NextResponse.json({ ok: true });
    }
    if (action === 'approve') {
      try {
        const r = await approveProposal(db, approvalId, 'archit');
        await tgApi('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: `Recorded (${r.entries} rows).` });
        // standings photo to everyone
        const pngRes = await fetch(`${APP_URL}/api/og/standings`);
        const png = await pngRes.arrayBuffer();
        const { data: approval } = await db.from('pending_approvals').select('proposed_payload').eq('id', approvalId).single();
        const pp = (approval?.proposed_payload ?? {}) as { homeClubId?: string; awayClubId?: string };
        await fanOutPhoto(db, 'result_recorded',
          `Recorded. ${pp.homeClubId ?? ''} v ${pp.awayClubId ?? ''}. Standings attached.`,
          async () => png);
      } catch (e) {
        await tgApi('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: `Failed: ${(e as Error).message}`, show_alert: true });
      }
      return NextResponse.json({ ok: true });
    }
  }

  // ——— text messages ———
  const text = update.message?.text?.trim() ?? '';
  const chatId = update.message?.chat?.id;
  if (!text || !chatId) return NextResponse.json({ ok: true });
  const reply = (t: string) => tgApi('sendMessage', { chat_id: chatId, text: t.slice(0, 4000) });

  if (text === '/start') {
    await reply('Fantasy Football Money Game bot.\n\nLink yourself: send "link <your name>" (archit, vedant, harshal, anmol).\nRead the table: send "standings".\nReport a score: "Arsenal 2-0 Manchester City - Premier League" (goes to Archit for approval).');
    return NextResponse.json({ ok: true });
  }
  const link = text.toLowerCase().match(/^link\s+(archit|vedant|harshal|anmol)$/);
  if (link) {
    await db.from('players').update({ telegram_chat_id: String(chatId), preferred_channel: 'telegram' }).eq('id', link[1]);
    await db.from('audit_log').insert({ action: 'LINK_TELEGRAM', subject_type: 'PLAYER', subject_id: link[1] });
    await reply(`Linked as ${link[1]}. You'll get results, reminders and standings photos here.`);
    return NextResponse.json({ ok: true });
  }
  const cmd = parseCommand(text);
  if (cmd === 'standings') {
    const { data: bal } = await db.from('player_balances').select('*');
    const lines = ((bal ?? []) as { name: string; net_inr: number }[])
      .sort((a, b) => b.net_inr - a.net_inr)
      .map((r, i) => `${i + 1}. ${r.name}: ₹${Number(r.net_inr).toLocaleString('en-IN')}`);
    await reply(lines.length ? `Standings\n${lines.join('\n')}` : 'No entries yet — all square at ₹0.');
    return NextResponse.json({ ok: true });
  }
  if (cmd) {
    await reply(`"${cmd}" on the website for now — full chat commands coming. Try "standings".`);
    return NextResponse.json({ ok: true });
  }
  const parsed = parseOneLine(text);
  if ('error' in parsed) {
    await reply(`${parsed.error} Send "standings" to read the table.`);
    return NextResponse.json({ ok: true });
  }
  // player-reported score: becomes a PENDING proposal like any other. Archit still taps.
  const r = await submitManualLine(db, text, 'telegram');
  if (!r.ok) {
    await reply(r.error);
    return NextResponse.json({ ok: true });
  }
  await reply(`Proposal ready. ${r.summary} Waiting on Archit.`);
  await notifyArchitApproval(db, r.approvalId, `Report: ${text}\n${r.summary}`);
  return NextResponse.json({ ok: true });
}
