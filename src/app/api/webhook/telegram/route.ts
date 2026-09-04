import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { approveProposal } from '@/lib/ledger/writer';
import {
  fanOutPhoto, groupId, sendHtml, editText, pinMessage, answerCallback, notifyArchitApproval, zeroSumAlert, clearLedgerLock,
} from '@/lib/notify/send';
import { markInbound, sendGroup } from '@/lib/notify/quiet';
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
function pinKeyboard(): { text: string; callback_data?: string; url?: string }[][] {
  return [[
    { text: 'Fixtures', callback_data: PIN_KEYS.fixtures },
    { text: 'Head to head', callback_data: PIN_KEYS.h2h },
  ], [
    { text: 'Trophies', callback_data: PIN_KEYS.trophies },
    { text: 'Open site', url: APP_URL },
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
    const parts = (cq.data as string).split(':');
    const kind = parts[0];
    const arg = parts[1];
    const me = await playerByTg(db, cq.from?.id);
    if (me) await markInbound(db, me.id);

    // correction confirm: correct:<fixtureId>:<homeGoals>:<awayGoals>, Archit only
    if (kind === 'correct') {
      if (!me || me.role !== 'COMMISSIONER') {
        await finish('Only the Commissioner can confirm corrections.', true);
        return NextResponse.json({ ok: true });
      }
      await finish('Applying correction.');
      const apply = await fetch(`${APP_URL}/api/corrections`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixtureId: parts[1], homeGoals: Number(parts[2]), awayGoals: Number(parts[3]), decidedBy: 'archit' }),
      }).then((r) => r.json()).catch(() => ({ error: 'Correction service unreachable.' }));
      const architChat2 = me.telegram_chat_id;
      if (architChat2) await sendHtml(architChat2, apply.error ? `Correction failed. ${apply.error}` : `Done. ${apply.summary}`);
      await refreshPin(db);
      return NextResponse.json({ ok: true });
    }

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
        const { data: approval } = await db.from('pending_approvals').select('subject_type,subject_id,proposed_payload').eq('id', arg).single();
        const pp = (approval?.proposed_payload ?? {}) as { homeClubId?: string; awayClubId?: string };
        const fixture = `${pp.homeClubId ?? ''} v ${pp.awayClubId ?? ''}`;
        if (architChat && dmMid) await editText(architChat, dmMid, `APPROVED ${stamp} IST\n${fixture}`);
        // group silence rule: no result post. The pin edit below is the only
        // group-visible change on a fixture update.
        await refreshPin(db);
        // roast auto-fire: ledger truth + authored line, quiet-aware
        if ((approval as { subject_type?: string; subject_id?: string } | null)?.subject_type === 'FIXTURE') {
          const roast = await fireRoast(db, (approval as { subject_id: string }).subject_id, false).catch(() => null);
          if (roast) await sendGroup(db, roast);
        }
        if (await clearLedgerLock(db)) await refreshPin(db);
        try {
          const pngRes = await fetch(`${APP_URL}/api/og/standings`);
          const png = await pngRes.arrayBuffer();
          await fanOutPhoto(db, 'result_recorded', `Recorded. ${pp.homeClubId ?? ''} v ${pp.awayClubId ?? ''}. Standings attached.`, async () => png);
        } catch { /* photo is best-effort; ledger already written */ }
      } catch (e) {
        const msg = (e as Error).message;
        if (/Already decided/.test(msg) && architChat && dmMid) {
          await editText(architChat, dmMid, `Already decided. Nothing written twice.`);
        } else {
          if (/Zero-sum broken/.test(msg)) await zeroSumAlert(db, msg);
          if (architChat) await sendHtml(architChat, `Approval failed. ${msg}`);
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
  // group silence rule: only slash commands get a response, except answering
  // a question the bot itself just asked (5-minute window). Everything else
  // passes without a sound. Fixture updates surface as the pin edit alone.
  if (isGroup && !text.startsWith('/')) {
    const { data: pend } = await db.from('config').select('value').eq('key', `pending_prompt:${chatId}`).single();
    const pr = (pend?.value as { kind?: string; at?: string } | null);
    if (pr?.kind === 'taunt-player' && pr.at && Date.now() - Date.parse(pr.at) < 5 * 60 * 1000) {
      const who = text.toLowerCase().trim();
      const pid = ['archit', 'vedant', 'harshal', 'anmol'].find((p) => p === who || who.split(/[\s,]+/).includes(p));
      await db.from('config').delete().eq('key', `pending_prompt:${chatId}`);
      if (pid) {
        const me2 = await playerByTg(db, update.message?.from?.id);
        if (!me2) return NextResponse.json({ ok: true });
        const reply2 = (t: string) => tgApi('sendMessage', { chat_id: chatId, text: t.slice(0, 4000), parse_mode: 'HTML' });
        await answerTaunt(db, reply2, pid, String(chatId));
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ ok: true });
  }
  const me = await playerByTg(db, update.message?.from?.id);
  if (me) await markInbound(db, me.id);
  const reply = (t: string, kb?: { text: string; callback_data?: string; url?: string }[][]) =>
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
    // linking must precede the auth gate — otherwise nobody new can ever link.
    if (/^link\s+/i.test(text)) {
      if (isGroup) { await reply('Link from your DM with me, not the group.'); return NextResponse.json({ ok: true }); }
      const m = text.toLowerCase().match(/^link\s+(archit|vedant|harshal|anmol)$/);
      if (!m) { await reply('Send "link" plus your name. archit, vedant, harshal or anmol.'); return NextResponse.json({ ok: true }); }
      await db.from('players').update({ telegram_chat_id: String(chatId), preferred_channel: 'telegram' }).eq('id', m[1]);
      await reply(`Linked as ${m[1]}. Results, reminders and standings photos arrive here.`);
      return NextResponse.json({ ok: true });
    }
    await reply('This bot is private.');
    return NextResponse.json({ ok: true });
  }
  const cmdline = text.split(' ')[0].replace(/@\w+$/, '');
  const rest = text.slice(cmdline.length).trim();

  const HELP_ALL = `Commands: /standings /me /balance /next /last /trophies /stakes /swing /exposure /streak /rewind /taunt /h2h /nemesis /club /ledger /awards /settle /correct /report /rules /help`;
  const HELP_COMM = `Commissioner: /pending /health /pin`;

  if (cmdline === '/start') {
    await reply(`Record office bot. Link by name is already done for all four of you.\n\n${HELP_ALL}\n${me.role === 'COMMISSIONER' ? HELP_COMM : ''}`);
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

  // ——— stakes, projections, social (pure arithmetic over the ledger) ———
  if (['/stakes', '/exposure', '/swing', '/streak', '/rewind', '/taunt', '/h2h', '/nemesis', '/club', '/ledger', '/awards', '/settle', '/quiet', '/correct', '/roastadd', '/roastkill', '/roaststats'].includes(cmdline)) {
    await statsReply(db, reply, cmdline, rest, me.id, me.role, String(chatId), isGroup);
    return NextResponse.json({ ok: true });
  }

  // fallback: one-line score? (DM only — groups stay silent on non-commands)
  const parsed = parseOneLine(text);
  if ('error' in parsed) {
    if (isGroup) return NextResponse.json({ ok: true });
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

export const VALID_SLOTS = new Set([
  'loser', 'winner', 'loser_club', 'winner_club', 'score', 'margin', 'amount',
  'competition', 'loser_pick', 'winner_pick', 'h2h', 'loser_net', 'winner_net',
  'owed', 'streak', 'marquee', 'manager', 'rank',
]);

/** Gather everything the roast engine needs for one recorded fixture. */
async function roastContextFor(db: ReturnType<typeof supabaseService>, fixtureId: string, leadChange: boolean) {
  const { buildContext } = await import('@/lib/roast/context');
  const { activeLosingStreak } = await import('@/lib/stats/projections');
  const [{ data: fx }, { data: res }, { data: clubs }, { data: players }, { data: bals }, { data: wld }, { data: led }, { data: dossiers }, { data: derbies }] = await Promise.all([
    db.from('fixtures').select('id,competition_id,home_club_id,away_club_id').eq('id', fixtureId).single(),
    db.from('results').select('h90,a90,terminal_status').eq('fixture_id', fixtureId).maybeSingle(),
    db.from('clubs').select('id,name,league,owner_id,draft_pick'),
    db.from('players').select('id,name'),
    db.from('player_balances').select('id,net_inr'),
    db.from('wld_records').select('player_id,fixture_id,outcome,occurred_at'),
    db.from('ledger_entries').select('fixture_id,from_player_id,to_player_id,amount_inr'),
    db.from('club_dossiers').select('*'),
    db.from('derbies').select('*'),
  ]);
  if (!fx || !res) return null;
  const F = fx as { competition_id: string; home_club_id: string; away_club_id: string };
  const R = res as { h90: number; a90: number; terminal_status: string };
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; league: string; owner_id: string; draft_pick: number }[]).map((c) => [c.id, c]));
  const pmap = new Map(((players ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const nets: Record<string, number> = {};
  for (const b of (bals ?? []) as { id: string; net_inr: number }[]) nets[b.id] = Number(b.net_inr);
  const home = cmap.get(F.home_club_id);
  const away = cmap.get(F.away_club_id);
  if (!home || !away) return null;
  const homeWon = R.h90 > R.a90;
  const loserId = homeWon ? away.owner_id : home.owner_id;
  const evts = ((wld ?? []) as { player_id: string; outcome: 'W' | 'L' | 'D'; occurred_at: string }[]).map((w) => ({ player: w.player_id, outcome: w.outcome, at: w.occurred_at }));
  // h2h + owed between the two owners across all recorded meetings
  const pair = new Set([home.owner_id, away.owner_id]);
  const ownersOf = (hid: string, aid: string) => new Set([(cmap.get(hid)?.owner_id), (cmap.get(aid)?.owner_id)]);
  void ownersOf;
  let aw = 0, bw = 0, owed = 0;
  const { data: allFx } = await db.from('fixtures').select('id,home_club_id,away_club_id').eq('status', 'RECORDED');
  const wldAll = ((wld ?? []) as { player_id: string; fixture_id: string | null; outcome: string }[]);
  const ledAll = ((led ?? []) as { fixture_id?: string | null; from_player_id: string; to_player_id: string; amount_inr: number }[]);
  const [oA, oB] = [...pair];
  for (const f of (allFx ?? []) as { id: string; home_club_id: string; away_club_id: string }[]) {
    const op = new Set([cmap.get(f.home_club_id)?.owner_id, cmap.get(f.away_club_id)?.owner_id]);
    if (!(op.has(oA) && op.has(oB))) continue;
    const rows = wldAll.filter((w) => w.fixture_id === f.id);
    const aWon = rows.some((w) => w.player_id === oA && w.outcome === 'W');
    const bWon = rows.some((w) => w.player_id === oB && w.outcome === 'W');
    if (aWon && !bWon) aw++;
    else if (bWon && !aWon) bw++;
    for (const e of ledAll.filter((x) => x.fixture_id === f.id)) {
      owed += (e.to_player_id === oA ? e.amount_inr : 0) - (e.from_player_id === oA ? e.amount_inr : 0);
    }
  }
  const h2h = aw === bw ? { aWins: aw, bWins: bw, leader: null as string | null } : { aWins: aw, bWins: bw, leader: aw > bw ? pmap.get(oA) ?? oA : pmap.get(oB) ?? oB };
  const delta: Record<string, number> = {};
  for (const e of ledAll.filter((x) => x.fixture_id === fixtureId)) {
    delta[e.to_player_id] = (delta[e.to_player_id] ?? 0) + e.amount_inr;
    delta[e.from_player_id] = (delta[e.from_player_id] ?? 0) - e.amount_inr;
  }
  const derby = ((derbies ?? []) as { id: string; club_a_id: string; club_b_id: string }[]).find((d) =>
    (d.club_a_id === F.home_club_id && d.club_b_id === F.away_club_id) || (d.club_a_id === F.away_club_id && d.club_b_id === F.home_club_id));
  const doss = ((dossiers ?? []) as { club_id: string; marquee: string; manager: string }[]).find((x) => x.club_id === (homeWon ? away.id : home.id));
  const order = ['archit', 'vedant', 'harshal', 'anmol'].sort((a, b) => (nets[b] ?? 0) - (nets[a] ?? 0));
  const { data: comp } = await db.from('competitions').select('name').eq('id', F.competition_id).single();
  const ctx = buildContext({
    homeClub: { id: home.id, name: home.name, pick: home.draft_pick, owner: home.owner_id, ownerName: pmap.get(home.owner_id) ?? home.owner_id, league: home.league },
    awayClub: { id: away.id, name: away.name, pick: away.draft_pick, owner: away.owner_id, ownerName: pmap.get(away.owner_id) ?? away.owner_id, league: away.league },
    homeGoals: R.h90, awayGoals: R.a90,
    competition: (comp as { name?: string } | null)?.name ?? F.competition_id,
    amount: Math.abs(delta[homeWon ? home.owner_id : away.owner_id] ?? 500),
    derbyId: derby?.id ?? null,
    dossier: { marquee: doss?.marquee ?? 'the marquee signing', manager: doss?.manager ?? 'the manager' },
    nets, fixtureDelta: delta, h2h,
    owed: Math.abs(owed),
    streakLosses: activeLosingStreak(evts, loserId),
    rankOfLoser: order.indexOf(loserId) + 1,
    isShootout: R.terminal_status === 'PEN',
    isLeadChange: leadChange,
  });
  return { ctx, loserId };
}

/** Fire one roast for a fixture: select, render, log. Reroll reuses context, new line. */
export async function fireRoast(db: ReturnType<typeof supabaseService>, fixtureId: string, reroll: boolean): Promise<string | null> {
  const { pickTemplate, renderBody, statPrefix } = await import('@/lib/roast/select');
  const built = await roastContextFor(db, fixtureId, false);
  if (!built) return null;
  const { data: tpl } = await db.from('roast_templates').select('*').eq('retired', false);
  const templates = ((tpl ?? []) as import('@/lib/roast/select').RoastTemplate[]);
  const { data: evts } = await db.from('roast_events').select('*').eq('fixture_id', fixtureId).order('posted_at', { ascending: false }).limit(1);
  const latest = ((evts ?? []) as { id: number; template_ids: number[]; posted_at: string; reroll_count: number }[])[0];
  let exclude: number[] = [];
  let eventId: number | null = null;
  if (reroll && latest && Date.now() - Date.parse(latest.posted_at) < 24 * 3600 * 1000 && latest.reroll_count < 3) {
    exclude = latest.template_ids;
    eventId = latest.id;
  }
  const pool = templates.filter((t) => !exclude.includes(t.id));
  const pick = pickTemplate(pool.length ? pool : templates, built.ctx, Date.now());
  if (!pick) return statPrefix(built.ctx);
  await db.from('roast_templates').update({ use_count: pick.use_count + 1, last_used_at: new Date().toISOString() }).eq('id', pick.id);
  const text = `${statPrefix(built.ctx)}\n\n${renderBody(pick.body, built.ctx)}\n\n#${pick.id}`;
  if (eventId) {
    await db.from('roast_events').update({ template_ids: [...exclude, pick.id], reroll_count: latest.reroll_count + 1 }).eq('id', eventId);
  } else {
    await db.from('roast_events').insert({ fixture_id: fixtureId, template_ids: [pick.id], rendered_text: text.slice(0, 2000) });
  }
  return text;
}

/** /taunt core. pid undefined = latest fixture. pid null = unresolved name: ask once. */
async function answerTaunt(
  db: ReturnType<typeof supabaseService>,
  reply: (t: string, kb?: { text: string; callback_data?: string; url?: string }[][]) => Promise<unknown>,
  pid: string | undefined | null,
  chatId: string,
) {
  if (pid === null) {
    await reply('Name one of the four: archit, vedant, harshal, anmol.');
    await db.from('config').upsert({ key: `pending_prompt:${chatId}`, value: { kind: 'taunt-player', at: new Date().toISOString() } }, { onConflict: 'key' });
    return;
  }
  const { data: players } = await db.from('players').select('id,name');
  const nameOf = (id: string) => ((players ?? []) as { id: string; name: string }[]).find((p) => p.id === id)?.name ?? id;
  const { data: rec } = await db.from('fixtures').select('id,home_club_id,away_club_id').eq('status', 'RECORDED');
  const { data: allClubs } = await db.from('clubs').select('id,owner_id');
  const omap = new Map(((allClubs ?? []) as { id: string; owner_id: string }[]).map((c) => [c.id, c.owner_id]));
  const pool = ((rec ?? []) as { id: string; home_club_id: string; away_club_id: string }[])
    .filter((f) => !pid || omap.get(f.home_club_id) === pid || omap.get(f.away_club_id) === pid);
  if (!pool.length) { await reply(pid ? `${nameOf(pid)} has no counted fixtures yet.` : 'Nothing recorded yet.'); return; }
  const { data: evts } = await db.from('roast_events').select('fixture_id,posted_at').order('posted_at', { ascending: false }).limit(1);
  const latestEv = ((evts ?? []) as { fixture_id: string }[])[0];
  const target = (latestEv && pool.some((f) => f.id === latestEv.fixture_id) && !pid) ? latestEv.fixture_id : pool[pool.length - 1].id;
  const text = await fireRoast(db, target, !pid);
  if (!text) { await reply('The room is quiet. No roast today.'); return; }
  if (!pid) { await reply(text); return; }
  const [{ data: b2 }, { data: mine2 }] = await Promise.all([
    db.from('player_balances').select('id,name,net_inr'),
    db.from('clubs').select('name,league').eq('owner_id', pid),
  ]);
  const table = ((b2 ?? []) as { id: string; name: string; net_inr: number }[])
    .sort((x, y) => Number(y.net_inr) - Number(x.net_inr))
    .map((r, i) => `${i + 1}. ${r.name} ${Number(r.net_inr) >= 0 ? '+' : '−'}₹${Math.abs(Number(r.net_inr)).toLocaleString('en-IN')}`).join('\n');
  const clubsLine = ((mine2 ?? []) as { name: string; league: string }[]).map((c) => `${c.name} (${c.league})`).join(', ');
  await reply(`${text}\n\nStandings:\n${table}\n\nDraft: ${clubsLine}`);
}

async function statsReply(
  db: ReturnType<typeof supabaseService>,
  reply: (t: string, kb?: { text: string; callback_data?: string; url?: string }[][]) => Promise<unknown>,
  cmd: string,
  rest: string,
  callerId: string,
  callerRole?: string,
  chatId?: string,
  isGroup?: boolean,
) {
  const { stakesFor, biggestSwing, ceilingFloor, formString, activeLosingStreak, pickTaunt, inr } = await import('@/lib/stats/projections');
  const { resolveClub } = await import('@/lib/parse/one-line');
  const [{ data: bal }, { data: wld }, { data: fx }, { data: tr }, { data: ledger }, { data: clubs }, { data: comps }] = await Promise.all([
    db.from('player_balances').select('id,name,net_inr'),
    db.from('wld_records').select('player_id,fixture_id,outcome,occurred_at'),
    db.from('fixtures').select('id,competition_id,home_club_id,away_club_id,kickoff_utc,status,is_same_owner'),
    db.from('trophies').select('competition_id,status'),
    db.from('ledger_entries').select('from_player_id,to_player_id,amount_inr,event_type,created_at,description'),
    db.from('clubs').select('id,name,league,owner_id,in_ucl'),
    db.from('competitions').select('id,name,code,trophy_winner_prize,trophy_each_other_pays'),
  ]);
  const bals = new Map(((bal ?? []) as { id: string; name: string; net_inr: number }[]).map((b) => [b.id, { name: b.name, net: Number(b.net_inr) }]));
  const evts = ((wld ?? []) as { player_id: string; outcome: 'W' | 'L' | 'D'; occurred_at: string }[]).map((w) => ({ player: w.player_id, outcome: w.outcome, at: w.occurred_at }));
  const remaining = ((fx ?? []) as { status: string; is_same_owner: boolean; kickoff_utc: string | null }[]).filter((f) => f.status === 'SCHEDULED' && !f.is_same_owner);
  const live = ((tr ?? []) as { competition_id: string; status: string }[]).filter((t) => t.status === 'Live');
  const cmap = new Map(((comps ?? []) as { id: string; name: string; code: string; trophy_winner_prize: number; trophy_each_other_pays: number }[]).map((c) => [c.id, c]));
  const liveT = live.map((t) => {
    const c = cmap.get(t.competition_id);
    return { code: c?.code ?? t.competition_id, name: c?.name ?? t.competition_id, winnerPrize: c?.trophy_winner_prize ?? 0, eachOtherPays: c?.trophy_each_other_pays ?? 0 };
  });
  const nameOf = (id: string) => bals.get(id)?.name ?? id;
  const week = remaining.filter((f) => f.kickoff_utc && Date.parse(f.kickoff_utc) < Date.now() + 7 * 864e5);

  if (cmd === '/stakes') {
    const s = stakesFor(week.length);
    await reply(week.length ? `${week.length} counted fixtures in the next 7 days.\n₹${s.base.toLocaleString('en-IN')} in play. ₹${s.ifBig.toLocaleString('en-IN')} if all go big.` : 'Nothing counted in the next 7 days.');
    return;
  }
  if (cmd === '/exposure') {
    const who = rest.toLowerCase() || callerId;
    const pid = ['archit', 'vedant', 'harshal', 'anmol'].find((p) => p === who || nameOf(p).toLowerCase() === who) ?? callerId;
    const mine = ((clubs ?? []) as { owner_id: string; in_ucl: boolean }[]).filter((c) => c.owner_id === pid);
    const hasUcl = mine.some((c) => c.in_ucl);
    const win = liveT.filter((t) => t.code !== 'UCL' || hasUcl).map((t) => t.winnerPrize);
    const lose = liveT.map((t) => t.eachOtherPays);
    const { best, worst } = ceilingFloor(bals.get(pid)?.net ?? 0, remaining.length, win, lose);
    await reply(`${nameOf(pid)}: ceiling ${inr(best)}, floor ${inr(worst)}, across ${remaining.length} fixtures and ${liveT.length} live trophies. Arithmetic, not prediction.`);
    return;
  }
  if (cmd === '/swing') {
    const s = biggestSwing(liveT);
    await reply(`Biggest swing left: ${s.label}, ₹${s.swing.toLocaleString('en-IN')}.`);
    return;
  }
  if (cmd === '/streak') {
    await reply(['archit', 'vedant', 'harshal', 'anmol'].map((p) => `${nameOf(p)}: ${formString(evts, p)}`).join('\n'));
    return;
  }
  if (cmd === '/rewind') {
    const since = Date.now() - 7 * 864e5;
    const rows = ((ledger ?? []) as { description: string; from_player_id: string; to_player_id: string; amount_inr: number; created_at: string }[]).filter((r) => Date.parse(r.created_at) >= since);
    await reply(rows.map((r) => `${r.description}: ₹${r.amount_inr} ${r.from_player_id} to ${r.to_player_id}`).join('\n') || 'Quiet week. Nothing written.');
    return;
  }
  if (cmd === '/taunt') {
    const clean = rest.replace(/^@\w+\s*/, '').trim().toLowerCase();
    const pid = clean ? ['archit', 'vedant', 'harshal', 'anmol'].find((p) => p === clean || nameOf(p).toLowerCase() === clean) ?? null : undefined;
    await answerTaunt(db, reply, pid, String(chatId));
    return;
  }
  if (cmd === '/roastadd') {
    if (isGroup) { await reply('That one lives in DM. Message me directly.'); return; }
    const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
    if (!m) { await reply('Send "/roastadd" plus club plus text. /roastadd arsenal Your text with {slots}'); return; }
    const { resolveClub } = await import('@/lib/parse/one-line');
    const cid = resolveClub(m[1]);
    if (!cid) { await reply(`Unknown club "${m[1]}".`); return; }
    const slots = [...m[2].matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
    const bad = slots.filter((s) => !VALID_SLOTS.has(s));
    if (bad.length) { await reply(`Unknown slots: ${bad.join(', ')}. Valid: ${[...VALID_SLOTS].join(', ')}`); return; }
    const { data: blocked } = await db.from('blocked_terms').select('term');
    const hit = ((blocked ?? []) as { term: string }[]).find((b) => m[2].toLowerCase().includes(b.term.toLowerCase()));
    if (hit) { await reply('That line trips a content boundary. Killed on sight, no appeal.'); return; }
    const { data: ins } = await db.from('roast_templates').insert({
      body: m[2].slice(0, 600), target: 'LOSER', scope: 'CLUB', club_id: cid,
      conditions: {}, severity: 2, weight: 15, author_player_id: callerId,
    }).select('id').single();
    await reply(ins ? `Line banked as #${(ins as { id: number }).id}. It fires with a 1.5x bonus.` : 'Could not bank that line.');
    return;
  }
  if (cmd === '/roastkill') {
    if (isGroup) { await reply('That one lives in DM. Message me directly.'); return; }
    const id = parseInt(rest, 10);
    if (!id) { await reply('Send "/roastkill" plus the line number shown under the roast.'); return; }
    const { data: done } = await db.from('roast_templates').update({ retired: true }).eq('id', id).select('id');
    await reply(done && (done as unknown[]).length ? `Line #${id} retired. Effective immediately, no ceremony.` : `No line #${id}.`);
    return;
  }
  if (cmd === '/roaststats') {
    const { data: all } = await db.from('roast_templates').select('id,club_id,use_count,retired').eq('retired', false);
    const rows = ((all ?? []) as { id: number; club_id: string | null; use_count: number }[]);
    const per = new Map<string, number>();
    for (const r of rows) per.set(r.club_id ?? 'meta', (per.get(r.club_id ?? 'meta') ?? 0) + 1);
    const thin = [...per.entries()].filter(([, n]) => n < 5).map(([c]) => c);
    const top = [...rows].sort((a, b) => b.use_count - a.use_count).slice(0, 3).map((r) => `#${r.id} x${r.use_count}`).join(', ');
    await reply(`Corpus: ${rows.length} live lines. Most used: ${top || 'none yet'}. Thin pools (under 5): ${thin.join(', ') || 'none'}.`);
    return;
  }
  if (cmd === '/h2h') {
    const parts = rest.toLowerCase().split(/[\s,]+/).filter((x) => x && x !== 'v' && x !== 'vs');
    const ids = parts.map((x) => ['archit', 'vedant', 'harshal', 'anmol'].find((p) => p === x || nameOf(p).toLowerCase() === x)).filter(Boolean) as string[];
    if (ids.length < 2) { await reply('Name two players. /h2h archit vedant'); return; }
    const [a, b] = ids;
    const owners = new Map(((clubs ?? []) as { id: string; owner_id: string }[]).map((c) => [c.id, c.owner_id]));
    const wldAll = (wld ?? []) as { player_id: string; fixture_id: string | null; outcome: string }[];
    const ledAll = (ledger ?? []) as { fixture_id?: string | null; from_player_id: string; to_player_id: string; amount_inr: number }[];
    let aw = 0, bw = 0, dr = 0, netA = 0, games = 0;
    for (const f of (fx ?? []) as { id: string; home_club_id: string; away_club_id: string; status: string }[]) {
      if (f.status !== 'RECORDED') continue;
      const pair = new Set([owners.get(f.home_club_id), owners.get(f.away_club_id)]);
      if (!(pair.has(a) && pair.has(b))) continue;
      games++;
      const rows = wldAll.filter((w) => w.fixture_id === f.id);
      if (rows.length && rows.every((w) => w.outcome === 'D')) { dr++; }
      else {
        for (const w of rows) {
          if (w.player_id === a) { if (w.outcome === 'W') aw++; else bw++; }
          else if (w.player_id === b) { if (w.outcome === 'W') bw++; else aw++; }
        }
      }
      for (const e of ledAll.filter((x) => x.fixture_id === f.id)) {
        netA += (e.to_player_id === a ? e.amount_inr : 0) - (e.from_player_id === a ? e.amount_inr : 0);
      }
    }
    await reply(games === 0
      ? `${nameOf(a)} v ${nameOf(b)}: nothing played yet.`
      : `${nameOf(a)} v ${nameOf(b)}: ${games} played, ${aw}-${bw}-${dr} (W-L-D for ${nameOf(a)}), net ${inr(netA)} to ${nameOf(a)}.`);
    return;
  }
  if (cmd === '/nemesis') {
    const who = rest.toLowerCase() || callerId;
    const pid = ['archit', 'vedant', 'harshal', 'anmol'].find((p) => p === who || nameOf(p).toLowerCase() === who) ?? callerId;
    const taken = new Map<string, number>();
    for (const e of (ledger ?? []) as { from_player_id: string; to_player_id: string; amount_inr: number }[]) {
      if (e.from_player_id !== pid) continue;
      taken.set(e.to_player_id, (taken.get(e.to_player_id) ?? 0) + e.amount_inr);
    }
    if (!taken.size) { await reply(`${nameOf(pid)} has paid nobody. Clean.`); return; }
    const [nem, amt] = [...taken.entries()].sort((x, y) => y[1] - x[1])[0];
    await reply(`${nameOf(pid)} pays most to ${nameOf(nem)}: ₹${amt.toLocaleString('en-IN')} all season.`);
    return;
  }
  if (cmd === '/club') {
    const cid = resolveClub(rest);
    if (!cid) { await reply('Name a club. Yours, ideally.'); return; }
    const club = ((clubs ?? []) as { id: string; name: string; league: string; owner_id: string }[]).find((c) => c.id === cid);
    if (!club) { await reply('No such club.'); return; }
    const fxAll = ((fx ?? []) as { id: string; home_club_id: string; away_club_id: string; status: string }[]).filter((f) => f.home_club_id === cid || f.away_club_id === cid);
    const resRows = await db.from('results').select('fixture_id,h90,a90').then((r) => (r.data ?? []) as { fixture_id: string; h90: number; a90: number }[]);
    const resMap = new Map(resRows.map((r) => [r.fixture_id, r]));
    let w = 0, l = 0, d = 0, earned = 0;
    const fids = new Set(fxAll.map((f) => f.id));
    for (const f of fxAll) {
      const r = resMap.get(f.id);
      if (!r) continue;
      const mine = f.home_club_id === cid ? r.h90 : r.a90;
      const theirs = f.home_club_id === cid ? r.a90 : r.h90;
      if (mine > theirs) w++; else if (mine < theirs) l++; else d++;
    }
    for (const e of (ledger ?? []) as { fixture_id?: string | null; from_player_id: string; to_player_id: string; amount_inr: number }[]) {
      if (e.fixture_id && fids.has(e.fixture_id)) {
        earned += (e.to_player_id === club.owner_id ? e.amount_inr : 0) - (e.from_player_id === club.owner_id ? e.amount_inr : 0);
      }
    }
    const left = fxAll.filter((f) => f.status === 'SCHEDULED').length;
    await reply(`${club.name} (${nameOf(club.owner_id)}): ${w}W ${l}L ${d}D, ${inr(earned)} generated, ${left} to play.`);
    return;
  }
  if (cmd === '/ledger') {
    const n = Math.min(Math.max(parseInt(rest || '5', 10) || 5, 1), 10);
    const rows = ((ledger ?? []) as { description: string; from_player_id: string; to_player_id: string; amount_inr: number }[]).slice(-n).reverse();
    await reply(rows.map((r) => `${r.description}: ₹${r.amount_inr} ${r.from_player_id} to ${r.to_player_id}`).join('\n') || 'Ledger empty.');
    return;
  }
  if (cmd === '/awards') {
    const { computeAwards } = await import('@/lib/awards/compute');
    const a = computeAwards(
      ['archit', 'vedant', 'harshal', 'anmol'],
      ((ledger ?? []) as { to_player_id: string; from_player_id: string; amount_inr: number; event_type: string }[]).map((r) => ({ ...r, event_type: r.event_type as 'MATCH' | 'TROPHY' | 'CORRECTION' })),
      evts.map((e) => ({ player_id: e.player, outcome: e.outcome, occurred_at: e.at })),
    );
    await reply(`Most wins: ${a.mostWins ? nameOf(a.mostWins) : '—'}\nMost losses: ${a.mostLosses ? nameOf(a.mostLosses) : '—'}\nMost successful: ${a.mostSuccessfulPlayer ? nameOf(a.mostSuccessfulPlayer) : '—'}\nFull list on the site.`);
    return;
  }
  if (cmd === '/settle') {
    const { settle } = await import('@/lib/awards/compute');
    const net: Record<string, number> = { archit: 0, vedant: 0, harshal: 0, anmol: 0 };
    for (const p of ['archit', 'vedant', 'harshal', 'anmol']) net[p] = bals.get(p)?.net ?? 0;
    const pays = settle(net);
    await reply(pays.length ? pays.map((x) => `${nameOf(x.from)} pays ${nameOf(x.to)} ₹${x.amount.toLocaleString('en-IN')}`).join('\n') : 'Everyone is square. No payments needed.');
    return;
  }
  if (cmd === '/quiet') {
    if (callerRole !== 'COMMISSIONER') { await reply('Commissioner only.'); return; }
    const mode = rest.toLowerCase();
    if (mode !== 'on' && mode !== 'off') { await reply('Send "/quiet" plus on or off.'); return; }
    await db.from('config').upsert({ key: 'quiet_override', value: { mode } }, { onConflict: 'key' });
    await reply(mode === 'on' ? 'Quiet forced on. Non-urgent messages queue for the morning digest.' : 'Quiet forced off. Everything sends immediately.');
    return;
  }
  if (cmd === '/correct') {
    if (!rest) { await reply('Send "/correct" plus the right line. Bayern Munich 2-1 Dortmund - DFL-Supercup'); return; }
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app'}/api/corrections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line: rest, preview: true, decidedBy: callerId }),
    }).then((r) => r.json()).catch(() => ({ error: 'Correction service unreachable.' }));
    if (res.error || !res.preview) { await reply(res.error ?? 'Could not preview.'); return; }
    await reply(
      `Original: ${res.original.score}. Corrected: ${res.corrected.score}. ${res.corrected.summary} Only Archit can confirm.`,
      [[{ text: 'Confirm correction', callback_data: `correct:${res.fixtureId}:${(res.corrected.score as string).replace('-', ':')}` }]],
    );
    return;
  }
}
