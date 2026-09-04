import { ImageResponse } from 'next/og';
import { supabaseService } from '@/lib/db/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/** Standings table as a PNG photo for Telegram/WhatsApp. */
export async function GET() {
  const db = supabaseService();
  const [{ data: bal }, { data: wld }] = await Promise.all([
    db.from('player_balances').select('id,name,net_inr'),
    db.from('wld_records').select('player_id,outcome'),
  ]);
  const rows = ((bal ?? []) as { id: string; name: string; net_inr: number }[])
    .sort((a, b) => Number(b.net_inr) - Number(a.net_inr))
    .map((r) => ({
      ...r,
      w: (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === r.id && x.outcome === 'W').length,
      l: (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === r.id && x.outcome === 'L').length,
      d: (wld ?? []).filter((x: { player_id: string; outcome: string }) => x.player_id === r.id && x.outcome === 'D').length,
    }));
  const total = rows.reduce((s, r) => s + Number(r.net_inr), 0);

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: 900, padding: 48, background: '#F1F4EF', fontFamily: 'Archivo, sans-serif', color: '#10281B' }}>
        <div style={{ fontSize: 20, letterSpacing: 3, color: '#6B7A6E' }}>FANTASY FOOTBALL MONEY GAME 2026/27</div>
        <div style={{ fontSize: 54, fontWeight: 800, margin: '8px 0 24px', letterSpacing: -1 }}>Standings</div>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', fontSize: 32, padding: '14px 0', borderBottom: '2px solid #DCE2D8', background: i % 2 ? '#F1F4EF' : '#FFFFFF' }}>
            <div style={{ width: 60 }}>{i + 1}</div>
            <div style={{ width: 300 }}>{r.name}</div>
            <div style={{ width: 220, color: Number(r.net_inr) >= 0 ? '#10281B' : '#C8102E', fontWeight: 600 }}>
              {Number(r.net_inr) >= 0 ? '+' : '−'}₹{Math.abs(Number(r.net_inr)).toLocaleString('en-IN')}
            </div>
            <div style={{ color: '#6B7A6E' }}>{r.w}W {r.l}L {r.d}D</div>
          </div>
        ))}
        <div style={{ marginTop: 28, fontSize: 24, background: '#10281B', color: '#F1F4EF', padding: '12px 20px', alignSelf: 'flex-start' }}>
          Zero-sum check: ₹{total} {total === 0 ? 'passed' : 'FAILED. Ledger locked.'}
        </div>
      </div>
    ),
    { width: 900, height: 220 + rows.length * 70 + 180 },
  );
}
