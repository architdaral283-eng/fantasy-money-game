// The Sunday roundup, 21:00 IST.
//
// Carries eight backlog features in ONE message: form table, running titles,
// rivalry heat, moment of the week, the unlucky table, who is exposed next
// week, title-race maths and season landmarks. One message because the group
// ceiling is six a day and eight separate posts would read as noise.
//
// Everything is computed from the ledger and wld_records. No provider call, so
// nothing here can fail because a third party is down.

import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { sendGroup } from '@/lib/notify/quiet';
import { buildWeeklyText } from '@/lib/notify/format';
import {
  formTable, rivalries, unluckyTable, exposedThisWeek, momentOfWeek,
  winsToCatch, runningTitle, landmark,
  type WldRow, type LedgerRow, type ResultRow, type FixtureRow,
} from '@/lib/stats/weekly';

export const maxDuration = 60;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const nowMs = Date.now();
  const weekAgo = nowMs - 7 * 864e5;

  const [{ data: wld }, { data: led }, { data: fx }, { data: res }, { data: clubs }, { data: bal }] = await Promise.all([
    db.from('wld_records').select('player_id,outcome,occurred_at,fixture_id'),
    db.from('ledger_entries').select('from_player_id,to_player_id,amount_inr,created_at,fixture_id,description'),
    db.from('fixtures').select('id,home_club_id,away_club_id,status,kickoff_utc,is_same_owner'),
    db.from('results').select('fixture_id,h90,a90'),
    db.from('clubs').select('id,owner_id'),
    db.from('player_balances').select('id,name,net_inr'),
  ]);

  const owners = new Map(((clubs ?? []) as { id: string; owner_id: string }[]).map((c) => [c.id, c.owner_id]));
  const ownerOf = (clubId: string) => owners.get(clubId);
  const names = new Map(((bal ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const nets = new Map(((bal ?? []) as { id: string; net_inr: number }[]).map((b) => [b.id, Number(b.net_inr)]));
  const nameOf = (id: string) => names.get(id) ?? id;

  const W = (wld ?? []) as WldRow[];
  const L = (led ?? []) as LedgerRow[];
  const F = (fx ?? []) as FixtureRow[];
  const R = (res ?? []) as ResultRow[];

  const form = formTable(W);
  const formOf = new Map(form.map((f) => [f.player, f.form]));

  // Money table, with each player's current title beside the name.
  const ordered = [...nets.entries()].sort((a, b) => b[1] - a[1]);
  const table = ordered.map(([id, net], i) => ({
    name: nameOf(id),
    title: runningTitle({ rank: i + 1, of: ordered.length, net, form: formOf.get(id) ?? '' }),
    net,
    form: formOf.get(id) ?? '—',
  }));

  const riv = rivalries(L)[0] ?? null;
  const moment = momentOfWeek(L, weekAgo);
  const unlucky = unluckyTable(F, R, ownerOf)[0] ?? null;
  const exposed = exposedThisWeek(F, ownerOf, nowMs);

  // Title race: the player directly behind the leader, and what it would take.
  const chase = ordered.length >= 2
    ? { chaser: nameOf(ordered[1][0]), leader: nameOf(ordered[0][0]), wins: winsToCatch(ordered[0][1] - ordered[1][1]) }
    : null;

  const playedPaying = F.filter((f) => f.status === 'RECORDED' && !f.is_same_owner).length;
  const totalPaying = F.filter((f) => !f.is_same_owner).length;

  const weekLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })
    .format(new Date(nowMs));

  const text = buildWeeklyText({
    weekLabel,
    table,
    rivalry: riv ? { a: nameOf(riv.a), b: nameOf(riv.b), moved: riv.moved, leader: riv.leader ? nameOf(riv.leader) : null } : null,
    moment: moment ? { ...moment, from: nameOf(moment.from), to: nameOf(moment.to) } : null,
    unlucky: unlucky ? { name: nameOf(unlucky.player), narrow: unlucky.narrow } : null,
    exposed: exposed.map((e) => ({ name: nameOf(e.player), fixtures: e.fixtures })),
    chase,
    landmark: landmark(nowMs, playedPaying, totalPaying),
  });

  // The prediction league's one line, appended rather than threaded through
  // buildWeeklyText — the roundup already carries eight features and the
  // builder does not need a ninth parameter for one sentence.
  const { predictionSummary } = await import('@/lib/notify/predict');
  const { clubFormSummary } = await import('@/lib/notify/club-form');
  const [predictions, clubForm] = await Promise.all([
    predictionSummary(db).catch(() => null),
    clubFormSummary(db).catch(() => null),
  ]);
  const full = [text, clubForm, predictions]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n\n');

  await sendGroup(db, full, { urgent: true });

  // And each player gets their banker offer by DM. No group cost, one tap,
  // and the week's fixtures are known by Sunday night.
  const { offerBankers } = await import('@/lib/notify/banker');
  const bankerOffers = await offerBankers(db).catch(() => 0);
  return NextResponse.json({
    ok: true, bankerOffers, players: table.length, rivalry: !!riv, moment: !!moment,
    landmark: landmark(nowMs, playedPaying, totalPaying),
  });
}
