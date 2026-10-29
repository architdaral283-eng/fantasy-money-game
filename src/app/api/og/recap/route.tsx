import { ImageResponse } from 'next/og';
import { supabaseService } from '@/lib/db/supabase';
import { monthlyAwards, monthBounds, type MonthLedgerRow } from '@/lib/awards/monthly';
import { formTable, type WldRow, SEASON_START } from '@/lib/stats/weekly';
import { effectiveTransfers, describeFixture } from '@/lib/ledger/effective';
import { recapTree, recapSize, rupees, type RecapData } from '@/lib/images/recap';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * A period recap as ONE image, so a month's awards cost one message slot
 * instead of four.
 *
 *   /api/og/recap                -> the month just gone
 *   /api/og/recap?period=season  -> the season so far
 *
 * The picture lives in @/lib/images/recap so it can be rendered in a test;
 * this file only shapes the data.
 */
export async function GET(req: Request) {
  const db = supabaseService();
  const season = new URL(req.url).searchParams.get('period') === 'season';
  const bounds = season
    ? { from: Date.parse(SEASON_START), to: Date.now(), label: 'Season 2026/27' }
    : monthBounds(Date.now());

  const [{ data: led }, { data: fx }, { data: res }, { data: clubs }, { data: bal }, { data: wld }] = await Promise.all([
    db.from('ledger_entries').select('id,from_player_id,to_player_id,amount_inr,created_at,fixture_id,description,event_type'),
    db.from('fixtures').select('id,home_club_id,away_club_id'),
    db.from('results').select('fixture_id,h90,a90,h120,a120'),
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name,net_inr'),
    db.from('wld_records').select('player_id,fixture_id,outcome,occurred_at'),
  ]);

  const players = (bal ?? []) as { id: string; name: string; net_inr: number }[];
  const pname = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const ledger = (led ?? []) as MonthLedgerRow[];

  const fixtures = (fx ?? []) as { id: string; home_club_id: string; away_club_id: string }[];
  const results = (res ?? []) as { fixture_id: string; h90: number; a90: number; h120: number | null; a120: number | null }[];

  const a = monthlyAwards(
    players.map((p) => p.id),
    ledger,
    fixtures,
    (clubId) => cmap.get(clubId)?.owner_id,
    bounds.from, bounds.to,
  );

  // Movement inside the window, which is not the season net. Netted per
  // fixture first: raw rows count every reversal and correction as money.
  const swing = new Map<string, number>(players.map((p) => [p.id, 0]));
  for (const r of effectiveTransfers(ledger)) {
    const t = Date.parse(r.created_at);
    if (!(t >= bounds.from && t < bounds.to)) continue;
    swing.set(r.to_player_id, (swing.get(r.to_player_id) ?? 0) + r.amount_inr);
    swing.set(r.from_player_id, (swing.get(r.from_player_id) ?? 0) - r.amount_inr);
  }

  const forms = formTable(
    ((wld ?? []) as WldRow[]).filter((w) => {
      const t = Date.parse(w.occurred_at);
      return t >= bounds.from && t < bounds.to;
    }),
    99,
  );

  const rows = players
    .map((p) => ({
      id: p.id,
      name: p.name,
      swing: swing.get(p.id) ?? 0,
      season: Number(p.net_inr),
      form: forms.find((f) => f.player === p.id)?.form ?? '—',
    }))
    .sort((x, y) => y.swing - x.swing || x.name.localeCompare(y.name));

  const clubLine = (s: { id: string; amount: number } | null) =>
    s ? `${cmap.get(s.id)?.name ?? s.id} · ${pname(cmap.get(s.id)?.owner_id ?? '')}` : '—';

  const data: RecapData = {
    title: season ? 'The Season' : 'The Month',
    label: bounds.label,
    rows,
    cards: [
      ['OWNER OF THE MONTH', a.owner ? pname(a.owner.id) : '—', a.owner ? rupees(a.owner.amount) : ''],
      ['FLOP OF THE MONTH', a.flop ? pname(a.flop.id) : '—', a.flop ? rupees(a.flop.amount) : ''],
      ['CLUB OF THE MONTH', clubLine(a.club), a.club ? rupees(a.club.amount) : ''],
      ['WORST CLUB', clubLine(a.worstClub), a.worstClub ? rupees(a.worstClub.amount) : ''],
    ],
    moved: a.moved,
    results: a.results,
    biggest: a.biggest
      ? `Biggest single result: ${(a.biggest.fixtureId && describeFixture(a.biggest.fixtureId, fixtures, results, (id) => cmap.get(id)?.name ?? id)) || a.biggest.description} — ₹${Math.round(a.biggest.amount).toLocaleString('en-IN')}, ${pname(a.biggest.from)} to ${pname(a.biggest.to)}`
      : null,
  };

  return new ImageResponse(recapTree(data), recapSize(rows.length));
}
