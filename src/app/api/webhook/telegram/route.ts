import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { approveProposal } from '@/lib/ledger/writer';
import {
  fanOutPhoto, groupId, sendHtml, editText, pinMessage, answerCallback, notifyArchitApproval,
} from '@/lib/notify/send';
import { parseCommand, parseOneLine } from '@/lib/parse/one-line';
import { submitManualLine } from '@/lib/entry/submit';
import { buildPinText } from '@/lib/notify/panel';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app';

type Player = { id: string; name: string; role: string; telegram_chat_id: string | null };

async function playerByTg(db: ReturnType<typeof supabaseService>, tgId: number | undefined): Promise<Player | null> {
  if (!tgId) return null;
  const { data } = await db.from('players').select('id,name,role,telegram_chat_id').eq('telegram_chat_id', String(tgId)).single();
  return (data as Player | null) ?? null;
}

function ist(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

function istTime(): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

const PIN_KEYS: Record<string, string> = {
  fixtures: 'p:fixtures', h2h: 'p:h2h', trophies: 'p:trophies', back: 'p:back',
};
function pinKeyboard(): { text: string; callback_data: string }[][] {
  return [[
    { text: 'Fixtures', callback_data: PIN_KEYS.fixtures },
    { text: 'Head to head', callback_data: PIN_KEYS.h2h },
  ], [
    { text: 'Trophies', callback_data: PIN_KEYS.trophies },
    { text: 'Open site', callback_data: 'p:site' },
  ]];
}
function backKeyboard(): { text: string; callback_data: string }[][] {
  return [[{ text: 'Back', callback_data: PIN_KEYS.back }]];
}

/** Current pin text + next fixture. Shared by post/edit/brief. */
async function pinState(db: ReturnType<typeof supabaseService>) {
  const [{ data: bal }, { data: wld }, { data: fx }, { data: clubs }] = await Promise.all([
    db.from('player_balances').select('id,name,net_inr'),
    db.from('wld_records').select('player_id,outcome'),
    db.from('fixtures').select('id,competition_id,home_club_id,away_club_id,kickoff_utc,status').eq('status', 'SCHEDULED').order('kickoff_utc', { nullsFirst: false }),
    db.from('clubs').select('id,name,owner_id'),
  ]);
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const rows = ((bal ?? []) as { id: string; name: string; net_inr: number }[])
    .sort((a, b) => Number(b.net_inr) - Number(a.net_inr))
    .map((r) => ({
      name: r.name, net: Number(r.net_inr),
      w: (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === r.id && x.outcome === 'W').length,
      l: (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === r.id && x.outcome === 'L').length,
      d: (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === r.id && x.outcome === 'D').length,
    }));
  const { count: played } = await db.from('fixtures').select('id', { count: 'exact', head: true }).eq('status', 'RECORDED');
  const upcoming = ((fx ?? []) as { home_club_id: string; away_club_id: string; kickoff_utc: string | null }[]).find((f) => f.kickoff_utc && Date.parse(f.kickoff_utc) > Date.now());
  const next = upcoming && upcoming.kickoff_utc ? {
    home: cmap.get(upcoming.home_club_id)?.name ?? upcoming.home_club_id,
    away: cmap.get(upcoming.away_club_id)?.name ?? upcoming.away_club_id,
    ownerA: cmap.get(upcoming.home_club_id)?.owner_id ?? '?',
    ownerB: cmap.get(upcoming.away_club_id)?.owner_id ?? '?',
    whenIST: ist(upcoming.kickoff_utc),
  } : null;
  return buildPinText(rows, played ?? 0, 63, next, istTime());
}

/** Edit the pinned panel; recreate + re-pin if gone. */
export async function refreshPin(db: ReturnType<typeof supabaseService>): Promise<void> {
  const gid = await groupId(db);
  if (!gid) return;
  const text = await pinState(db);
  const { data: cfg } = await db.from('config').select('value').eq('key', 'pinned_message_id').single();
  const mid = (cfg?.value as { id?: number })?.id;
  if (mid) {
    const ok = await editText(gid, mid, text, pinKeyboard());
    if (ok) return;
  }
  const sent = await sendHtml(gid, text, pinKeyboard());
  if (sent) {
    await pinMessage(gid, sent);
    await db.from('config').upsert({ key: 'pinned_message_id', value: { id: sent } }, { onConflict: 'key' });
  }
}

async function tgApi(method: string, body: object) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

interface Update {
  update_id: number;
  message?: { message_id: number; text?: string; chat?: { id?: number; type?: string } ; from?: { id?: number } };
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number }; message_id?: number }; from?: { id?: number } };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (process.env.TELEGRAM_WEBHOOK_SECRET && url.searchParams.get('secret') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update || typeof update.update_id !== 'number') return NextResponse.json({ ok: true });
  const db = supabaseService();

  // dedup: Telegram redelivers on timeout — process each update_id once
  const { error: dupErr } = await db.from('processed_updates').insert({ update_id: update.update_id });
  if (dupErr) return NextResponse.json({ ok: true, deduped: true });

  // ——— callbacks: answer FIRST (3s budget), then work ———
  if (update.callback_query?.data) {
    const cq = update.callback_query;
    const finish = (text?: string, alert = false) => answerCallback(cq.id ?? '', text, alert);
    const [kind, arg] = (cq.data as string).split(':');
    const me = await playerByTg(db, cq.from?.id);

    // pin panel navigation (any linked player)
    if (kind === 'p') {
      if (!me) { await finish('This bot is private.'); return NextResponse.json({ ok: true }); }
      await finish();
      const chatId = cq.message?.chat?.id;
      const mid = cq.message?.message_id;
      if (!chatId || !mid) return NextResponse.json({ ok: true });
      if (arg === 'back') {
        await editText(chatId, mid, await pinState(db), pinKeyboard());
      } else if (arg === 'fixtures') {
        const { data: fx } = await db.from('fixtures').select('home_club_id,away_club_id,competition_id,kickoff_utc').eq('status', 'SCHEDULED').order('kickoff_utc').limit(8);
        const { data: clubs } = await db.from('clubs').select('id,name');
        const cmap = new Map(((clubs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        const list = ((fx ?? []) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string | null }[])
          .map((f) => `${cmap.get(f.home_club_id) ?? f.home_club_id} v ${cmap.get(f.away_club_id) ?? f.away_club_id} (${f.competition_id}, ${f.kickoff_utc ? ist(f.kickoff_utc) : 'TBC'})`).join('\n');
        await editText(chatId, mid, `Next counted fixtures\n\n<pre>${list || 'None scheduled.'}</pre>`, backKeyboard());
      } else if (arg === 'trophies') {
        const { data: tr } = await db.from('trophies').select('competition_id,status');
        const { data: comps } = await db.from('competitions').select('id,name,trophy_winner_prize').gt('trophy_winner_prize', 0);
        const cmap = new Map(((comps ?? []) as { id: string; name: string; trophy_winner_prize: number }[]).map((c) => [c.id, c]));
        const list = ((tr ?? []) as { competition_id: string; status: string }[])
          .map((t) => `${cmap.get(t.competition_id)?.name ?? t.competition_id}: ${t.status}`).join('\n');
        await editText(chatId, mid, `Trophies\n\n<pre>${list}</pre>\n\nPool ₹24,000.`, backKeyboard());
      } else if (arg === 'site') {
        await finish(APP_URL);
      } else if (arg === 'h2h') {
        await editText(chatId, mid, `Head to head lives on the site:\n${APP_URL}/h2h`, backKeyboard());
      }
      return NextResponse.json({ ok: true });
    }

    // approval callbacks: Commissioner only
    if (kind === 'approve' || kind === 'reject') {
      if (!me || me.role !== 'COMMISSIONER') {
        await finish('Only the Commissioner can approve results.', true);
        return NextResponse.json({ ok: true });
      }
      await finish(kind === 'approve' ? 'Working on it.' : 'Rejected.');
      const architChat = me.telegram_chat_id;
      const dmMid = cq.message?.message_id;
      const stamp = istTime();
      if (kind === 'reject') {
        await db.from('pending_approvals').update({ status: 'REJECTED', decided_at: new Date().toISOString(), decided_by: 'archit' }).eq('id', arg);
        if (architChat && dmMid) await editText(architChat, dmMid, `REJECTED ${stamp} IST`);
        return NextResponse.json({ ok: true });
      }
      // approve
      try {
        const r = await approveProposal(db, arg, 'archit');
        void r;
        const { data: approval } = await db.from('pending_approvals').select('proposed_payload').eq('id', arg).single();
        const pp = (approval?.proposed_payload ?? {}) as { homeClubId?: string; awayClubId?: string };
        if (architChat && dmMid) await editText(architChat, dmMid, `APPROVED ${stamp} IST\n${pp.homeClubId ?? ''} v ${pp.awayClubId ?? ''}`);
        // group post + pin refresh + photo
        const gid = await groupId(db);
        if (gid) {
          await sendHtml(gid, `Recorded. ${pp.homeClubId ?? ''} v ${pp.awayClubId ?? ''}.`);
          await refreshPin(db);
        } else {
          await refreshPin(db);
        }
        try {
          const pngRes = await fetch(`${APP_URL}/api/og/standings`);
          const png = await pngRes.arrayBuffer();
          await fanOutPhoto(db, 'result_recorded', `Recorded. ${pp.homeClubId ?? ''} v ${pp.awayClubId ?? ''}. Standings attached.`, async () => png);
        } catch { /* photo is best-effort; ledger already written */ }
      } catch (e) {
        const msg = (e as Error).message;
        if (/Already decided/.test(msg) && architChat && dmMid) {
          await editText(architChat, dmMid, `Already decided. Nothing written twice.`);
        } else if (architChat) {
          await sendHtml(architChat, `Approval failed. ${msg}`);
        }
      }
      return NextResponse.json({ ok: true });
    }
    await finish();
    return NextResponse.json({ ok: true });
  }

  // ——— messages ———
  const text = update.message?.text?.trim() ?? '';
  const chat = update.message?.chat;
  const chatId = chat?.id;
  const isGroup = chat?.type === 'group' || chat?.type === 'supergroup';
  if (!text || !chatId) return NextResponse.json({ ok: true });
  const me = await playerByTg(db, update.message?.from?.id);
  const reply = (t: string, kb?: { text: string; callback_data: string }[][]) =>
    tgApi('sendMessage', { chat_id: chatId, text: t.slice(0, 4000), parse_mode: 'HTML', ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}) });

  // group registration / leave
  const gid = await groupId(db);
  if (isGroup) {
    const cmd0 = text.split(' ')[0].replace(/@\w+$/, '');
    if (cmd0 === '/setgroup') {
      if (!me || me.role !== 'COMMISSIONER') { await reply('Commissioner only.'); return NextResponse.json({ ok: true }); }
      await db.from('config').upsert({ key: 'telegram_group_chat_id', value: { id: String(chatId) } }, { onConflict: 'key' });
      await reply('Group registered. Use /pin to post the standings panel.');
      return NextResponse.json({ ok: true });
    }
    if (!gid || String(gid) !== String(chatId)) {
      await reply('This bot is private.');
      await tgApi('leaveChat', { chat_id: chatId });
      return NextResponse.json({ ok: true });
    }
  }
  if (!me) {
    await reply('This bot is private.');
    return NextResponse.json({ ok: true });
  }
  const cmdline = text.split(' ')[0].replace(/@\w+$/, '');
  const rest = text.slice(cmdline.length).trim();

  const HELP_ALL = `Commands: /standings /me /balance [player] /next [club] /last [n] /trophies /report <line> /rules /help`;
  const HELP_COMM = `Commissioner: /pending /health /pin`;

  if (cmdline === '/start') {
    await reply(`Record office bot. Link by name is already done for all four of you.\n\n${HELP_ALL}\n${me.role === 'COMMISSIONER' ? HELP_COMM : ''}`);
    return NextResponse.json({ ok: true });
  }
  if (/^link\s+/i.test(text)) {
    if (isGroup) { await reply('Link from your DM with me, not the group.'); return NextResponse.json({ ok: true }); }
    const m = text.toLowerCase().match(/^link\s+(archit|vedant|harshal|anmol)$/);
    if (!m) { await reply('Send "link" plus your name. archit, vedant, harshal or anmol.'); return NextResponse.json({ ok: true }); }
    await db.from('players').update({ telegram_chat_id: String(chatId), preferred_channel: 'telegram' }).eq('id', m[1]);
    await reply(`Linked as ${m[1]}. Results, reminders and standings photos arrive here.`);
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/help') {
    await reply(me.role === 'COMMISSIONER' ? `${HELP_ALL}\n${HELP_COMM}` : HELP_ALL);
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/standings' || cmdline === '/table') {
    await reply(`<pre>${stripHtml(await pinState(db)).slice(0, 1500)}</pre>`);
    try {
      const pngRes = await fetch(`${APP_URL}/api/og/standings`);
      const buf = Buffer.from(await pngRes.arrayBuffer());
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append('photo', new Blob([buf], { type: 'image/png' }), 'standings.png');
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
    } catch { /* text already sent */ }
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/balance') {
    const who = (rest.toLowerCase() || me.id);
    const { data: b } = await db.from('player_balances').select('*');
    const row = ((b ?? []) as { id: string; name: string; net_inr: number }[]).find((r) => r.id === who || r.name.toLowerCase() === who);
    await reply(row ? `${row.name}: ${row.net_inr >= 0 ? '+' : '−'}₹${Math.abs(Number(row.net_inr)).toLocaleString('en-IN')}` : 'No such player.');
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/me') {
    const pid = me.id;
    const [{ data: b }, { data: w }, { data: mine }] = await Promise.all([
      db.from('player_balances').select('*').eq('id', pid).single(),
      db.from('wld_records').select('outcome').eq('player_id', pid),
      db.from('clubs').select('name,league').eq('owner_id', pid),
    ]);
    const net = Number((b as { net_inr?: number } | null)?.net_inr ?? 0);
    const n = (o: string) => ((w ?? []) as { outcome: string }[]).filter((r) => r.outcome === o).length;
    const clubs = ((mine ?? []) as { name: string; league: string }[]).map((c) => `${c.name} (${c.league})`).join(', ');
    await reply(`${me.name}: ${net >= 0 ? '+' : '−'}₹${Math.abs(net).toLocaleString('en-IN')}, ${n('W')}W ${n('L')}L ${n('D')}D\nClubs: ${clubs}`);
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/next' || cmdline === '/fixtures') {
    const { data: fx } = await db.from('fixtures').select('home_club_id,away_club_id,competition_id,kickoff_utc').eq('status', 'SCHEDULED').order('kickoff_utc').limit(6);
    const { data: clubs } = await db.from('clubs').select('id,name');
    const cmap = new Map(((clubs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const list = ((fx ?? []) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string | null }[])
      .map((f) => `${cmap.get(f.home_club_id) ?? f.home_club_id} v ${cmap.get(f.away_club_id) ?? f.away_club_id} (${f.competition_id}, ${f.kickoff_utc ? ist(f.kickoff_utc) : 'TBC'})`).join('\n');
    await reply(`Next counted fixtures\n\n${list || 'None scheduled.'}`);
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/last') {
    const n = Math.min(Math.max(parseInt(rest || '5', 10) || 5, 1), 10);
    const { data: rows } = await db.from('ledger_entries').select('description,from_player_id,to_player_id,amount_inr').order('id', { ascending: false }).limit(n);
    const list = ((rows ?? []) as { description: string; from_player_id: string; to_player_id: string; amount_inr: number }[])
      .map((r) => `${r.description}: ₹${r.amount_inr} ${r.from_player_id} to ${r.to_player_id}`).join('\n');
    await reply(list || 'Nothing recorded yet.');
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/trophies') {
    const { data: tr } = await db.from('trophies').select('competition_id,status');
    const list = ((tr ?? []) as { competition_id: string; status: string }[]).map((t) => `${t.competition_id}: ${t.status}`).join('\n');
    await reply(`Trophies\n\n${list}\n\nPool ₹24,000.`);
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/report') {
    if (!rest) { await reply('Send "/report" plus the line. Arsenal 2-0 Manchester City - Premier League'); return NextResponse.json({ ok: true }); }
    const r = await submitManualLine(db, rest, `telegram:${me.id}`);
    if (!r.ok) { await reply(r.error); return NextResponse.json({ ok: true }); }
    const who = me.name;
    const ggid = await groupId(db);
    if (ggid && String(ggid) === String(chatId)) {
      await reply(`${who} reported the result. Waiting on Archit.`);
    } else {
      await reply(`Proposal ready. ${r.summary} Waiting on Archit.`);
    }
    const { data: approval } = await db.from('pending_approvals').select('proposed_payload').eq('id', r.approvalId).single();
    const pp = (approval?.proposed_payload ?? {}) as { homeClubId?: string; awayClubId?: string };
    await notifyArchitApproval(db, r.approvalId, `Report from ${who}: ${rest}\n${r.summary}`);
    void pp;
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/pending') {
    if (me.role !== 'COMMISSIONER') { await reply('Commissioner only.'); return NextResponse.json({ ok: true }); }
    const { data: pend } = await db.from('pending_approvals').select('id,subject_type,proposed_payload,created_at').eq('status', 'PENDING').order('created_at').limit(10);
    if (!pend?.length) { await reply('Queue empty.'); return NextResponse.json({ ok: true }); }
    for (const p of (pend as { id: string; subject_type: string; proposed_payload: { homeClubId?: string; awayClubId?: string } }[])) {
      await tgApi('sendMessage', {
        chat_id: chatId, text: `${p.subject_type}: ${p.proposed_payload.homeClubId ?? ''} v ${p.proposed_payload.awayClubId ?? ''}`,
        reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: `approve:${p.id}` }, { text: 'Reject', callback_data: `reject:${p.id}` }]] },
      });
    }
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/health') {
    if (me.role !== 'COMMISSIONER') { await reply('Commissioner only.'); return NextResponse.json({ ok: true }); }
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ count: fd }, { data: last }, { count: pendN }] = await Promise.all([
      db.from('api_call_log').select('id', { count: 'exact', head: true }).gte('called_at', since),
      db.from('api_call_log').select('called_at').order('called_at', { ascending: false }).limit(1),
      db.from('pending_approvals').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    ]);
    await reply(`Provider calls 24h: ${fd ?? 0}. Last poll: ${(last as { called_at?: string }[] | null)?.[0]?.called_at ?? 'never'}. Pending: ${pendN ?? 0}.`);
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/pin') {
    if (me.role !== 'COMMISSIONER') { await reply('Commissioner only.'); return NextResponse.json({ ok: true }); }
    await refreshPin(db);
    await reply('Panel refreshed.');
    return NextResponse.json({ ok: true });
  }
  if (cmdline === '/rules') {
    await reply('Win by 1-3 pays ₹500. Win by 4+ pays ₹1000. Draws pay ₹0. Knockouts: whoever advances wins. Two legs count as one aggregate.');
    return NextResponse.json({ ok: true });
  }

  // fallback: one-line score?
  const parsed = parseOneLine(text);
  if ('error' in parsed) {
    const cmd = parseCommand(text);
    if (cmd) { await reply('That lives on the site. Try /standings.'); return NextResponse.json({ ok: true }); }
    await reply(`${parsed.error} Example: Arsenal 2-0 Manchester City - Premier League`);
    return NextResponse.json({ ok: true });
  }
  const r = await submitManualLine(db, text, `telegram:${me.id}`);
  if (!r.ok) { await reply(r.error); return NextResponse.json({ ok: true }); }
  await reply(`Proposal ready. ${r.summary} Waiting on Archit.`);
  await notifyArchitApproval(db, r.approvalId, `Report from ${me.name}: ${text}\n${r.summary}`);
  return NextResponse.json({ ok: true });
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}
