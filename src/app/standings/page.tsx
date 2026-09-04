'use client';
import { inr, playerName } from '@/lib/pages/data';
import { useLiveData, balancesOf } from '@/lib/pages/live';

export default function Standings() {
  const { ledger, wld, loading } = useLiveData();
  const bal = balancesOf(ledger);
  const count = (p: string, o: 'W' | 'L' | 'D') => wld.filter((r) => r.player_id === p && r.outcome === o).length;
  const net = (p: string, ev: string) => ledger.filter((r) => r.event_type === ev)
    .reduce((s, r) => s + (r.to_player_id === p ? r.amount_inr : 0) - (r.from_player_id === p ? r.amount_inr : 0), 0);
  const order = (['archit', 'vedant', 'harshal', 'anmol'] as string[])
    .sort((a: string, b: string) => (bal[b] ?? 0) - (bal[a] ?? 0));

  return (
    <>
      <h2>Standings</h2>
      <p>Ranked by net balance. W/L/D, match earnings, trophy earnings, net.{loading ? ' Loading…' : ''}</p>
      <table className="record">
        <thead><tr><th>#</th><th>Player</th><th>Net</th><th>W</th><th>L</th><th>D</th><th>Match ₹</th><th>Trophy ₹</th></tr></thead>
        <tbody>
          {order.map((p, i) => (
            <tr key={p}><td className="num">{i + 1}</td><td>{playerName(p)}</td>
            <td className="num">{inr(bal[p] ?? 0)}</td>
            <td className="num">{count(p, 'W')}</td><td className="num">{count(p, 'L')}</td><td className="num">{count(p, 'D')}</td>
            <td className="num">{inr(net(p, 'MATCH'))}</td><td className="num">{inr(net(p, 'TROPHY'))}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
