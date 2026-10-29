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
import { effectiveTransfers, describeFixture } from '@/lib/ledger/effective';
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
    db.from('ledger_entries').select('id,from_player_id,to_player_id,amount_inr,created_at,fixture_id,description,event_type'),
    db.from('fixtures').select('id,home_club_id,away_club_id,status,kickoff_utc,is_same_owner'),
    db.from('results').select('fixture_id,h90,a90,h120,a120'),
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name,net_inr'),
  ]);

  const clubRows = (clubs ?? []) as { id: string; name: string; owner_id: string }[];
  const clubName = (id: string) => clubRows.find((c) => c.id === id)?.name ?? id;
  const owners = new Map(clubRows.map((c) => [c.id, c.owner_id]));
  const ownerOf = (clubId: string) => owners.get(clubId);
  const names = new Map(((bal ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const nets = new Map(((bal ?? []) as { id: string; net_inr: number }[]).map((b) => [b.id, Number(b.net_inr)]));
  const nameOf = (id: string) => names.get(id) ?? id;

  const W = (wld ?? []) as WldRow[];
  // Netted per fixture first. Raw rows count every reversal and duplicate
  // correction as money that moved — eight of the season's first 24 rows are
  // corrections, and Bayern v Dortmund alone holds seven for one ₹500 result.
  // Unnetted, the hottest rivalry would have been announced at ₹3,500.
  const L = effectiveTransfers((led ?? []) as LedgerRow[]) as unknown as LedgerRow[];
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

  const paying = F.filter((f) => !f.is_same_owner);
  const playedPaying = paying.filter((f) => f.status === 'RECORDED').length;
  const totalPaying = paying.length;
  // Halfway has to be CROSSED, so the landmark needs last week's count too.
  const playedAWeekAgo = paying.filter((f) =>
    f.status === 'RECORDED' && f.kickoff_utc !== null && Date.parse(f.kickoff_utc) < weekAgo).length;

  const weekLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })
    .format(new Date(nowMs));

  const text = buildWeeklyText({
    weekLabel,
    table,
    rivalry: riv ? { a: nameOf(riv.a), b: nameOf(riv.b), moved: riv.moved, leader: riv.leader ? nameOf(riv.leader) : null } : null,
    moment: moment ? {
      ...moment,
      // The ledger's own wording is an audit string: "barcelona v real-madrid
      // (LA_LIGA)". People get club names and the score.
      description: (moment.fixtureId && describeFixture(moment.fixtureId, F, R, clubName)) || moment.description,
      from: nameOf(moment.from), to: nameOf(moment.to),
    } : null,
    unlucky: unlucky ? { name: nameOf(unlucky.player), narrow: unlucky.narrow } : null,
    exposed: exposed.map((e) => ({ name: nameOf(e.player), fixtures: e.fixtures })),
    chase,
    landmark: landmark(nowMs, playedPaying, totalPaying, playedAWeekAgo),
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

  return NextResponse.json({
    ok: true, players: table.length, rivalry: !!riv, moment: !!moment,
    landmark: landmark(nowMs, playedPaying, totalPaying, playedAWeekAgo),
  });
}
