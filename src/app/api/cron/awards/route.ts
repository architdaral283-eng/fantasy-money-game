// Owner, Club and Flop of the Month, on the 1st.
//
// Everything here is read off the ledger, which is append-only and cannot be
// argued with. Club attribution needs the fixture and its result, because the
// ledger row knows who paid whom but not which club did the damage.
//
// One message. The table lives in the pinned panel and goes out with every
// result, so repeating it here would spend a slot on something already visible.

import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { sendGroup } from '@/lib/notify/quiet';
import { groupId } from '@/lib/notify/send';
import { buildMonthlyAwards } from '@/lib/notify/format';
import { monthlyAwards, monthBounds, type MonthLedgerRow } from '@/lib/awards/monthly';
import { PLAYERS } from '@/lib/stats/weekly';

export const maxDuration = 60;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const gid = await groupId(db);
  if (!gid) return NextResponse.json({ ok: false, reason: 'No group registered. Send /setgroup in the group first.' });

  const bounds = monthBounds(Date.now());

  const [{ data: led }, { data: fx }, { data: res }, { data: clubs }, { data: bal }] = await Promise.all([
    db.from('ledger_entries').select('from_player_id,to_player_id,amount_inr,created_at,fixture_id,description'),
    db.from('fixtures').select('id,home_club_id,away_club_id'),
    db.from('results').select('fixture_id,h90,a90'),
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
  ]);

  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const pmap = new Map(((bal ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const pname = (id: string) => pmap.get(id) ?? id;

  const a = monthlyAwards(
    PLAYERS,
    (led ?? []) as MonthLedgerRow[],
    (fx ?? []) as { id: string; home_club_id: string; away_club_id: string }[],
    (res ?? []) as { fixture_id: string; h90: number; a90: number }[],
    bounds.from, bounds.to,
  );

  const clubLine = (s: { id: string; amount: number } | null) => {
    if (!s) return null;
    const c = cmap.get(s.id);
    return { name: c?.name ?? s.id, owner: pname(c?.owner_id ?? ''), amount: s.amount };
  };

  const text = buildMonthlyAwards({
    label: bounds.label,
    owner: a.owner ? { name: pname(a.owner.id), amount: a.owner.amount } : null,
    flop: a.flop ? { name: pname(a.flop.id), amount: a.flop.amount } : null,
    club: clubLine(a.club),
    worstClub: clubLine(a.worstClub),
    biggest: a.biggest ? {
      description: a.biggest.description,
      amount: a.biggest.amount,
      from: pname(a.biggest.from),
      to: pname(a.biggest.to),
    } : null,
    moved: a.moved,
    results: a.results,
  });

  // One message, not four: the recap image carries the awards, the month's
  // swing and each player's form, with the written version as its caption.
  // urgent, because a once-a-month message must not be held back by a busy
  // day and released at 16:30 in a batch with yesterday's leftovers.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app';
  let image = false;
  try {
    const r = await fetch(`${appUrl}/api/og/recap`, { cache: 'no-store' });
    const png = await r.arrayBuffer();
    // A Satori error produces a 0-byte PNG and no exception. That is how the
    // standings photo was broken for weeks before anyone noticed, so the size
    // is checked rather than trusted.
    if (!r.ok || png.byteLength < 1000) throw new Error(`og/recap ${r.status}, ${png.byteLength} bytes`);
    const { sendGroupPhoto } = await import('@/lib/notify/quiet');
    await sendGroupPhoto(db, text, async () => png, { urgent: true });
    image = true;
  } catch {
    // Text still goes out. A missing picture is a worse month, not a lost one.
    await sendGroup(db, text, { urgent: true });
  }

  return NextResponse.json({ ok: true, month: bounds.label, moved: a.moved, results: a.results, image });
}
