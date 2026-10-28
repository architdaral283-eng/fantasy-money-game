import { ImageResponse } from 'next/og';
import { supabaseService } from '@/lib/db/supabase';
import { standingsTree, standingsSize, type StandingsRow } from '@/lib/images/recap';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Standings table as a PNG photo for Telegram.
 *
 * The picture itself lives in @/lib/images/recap so it can be rendered in a
 * test — this image returned 0 bytes on every request for weeks because
 * Satori rejects a bare number child, silently, and nothing checked.
 */
export async function GET() {
  const db = supabaseService();
  const [{ data: bal }, { data: wld }] = await Promise.all([
    db.from('player_balances').select('id,name,net_inr'),
    db.from('wld_records').select('player_id,outcome'),
  ]);
  const count = (id: string, o: string) =>
    (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === id && x.outcome === o).length;

  const rows: StandingsRow[] = ((bal ?? []) as { id: string; name: string; net_inr: number }[])
    .sort((a, b) => Number(b.net_inr) - Number(a.net_inr))
    .map((r) => ({
      id: r.id, name: r.name, net: Number(r.net_inr),
      w: count(r.id, 'W'), l: count(r.id, 'L'), d: count(r.id, 'D'),
    }));
  const total = rows.reduce((s, r) => s + r.net, 0);

  return new ImageResponse(standingsTree(rows, total), standingsSize(rows.length));
}
