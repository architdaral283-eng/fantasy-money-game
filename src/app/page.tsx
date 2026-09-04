'use client';
import { pageData, inr, playerName } from '@/lib/pages/data';
import { useLiveData, balancesOf } from '@/lib/pages/live';

/** `/` — perimeter-board hero, progress, standings. */
export default function Home() {
  const { ledger, fixtures, wld, loading } = useLiveData();
  const bal = balancesOf(ledger);
  const sum = Object.values(bal).reduce((s, v) => s + v, 0);
  const zeroOk = sum === 0;
  const recorded = fixtures.filter((f) => f.status === 'RECORDED');
  const payingPlayed = recorded.filter((f) => !f.is_same_owner).length;
  const count = (p: string, o: 'W' | 'L' | 'D') => wld.filter((r) => r.player_id === p && r.outcome === o).length;
  const order = (['archit', 'vedant', 'harshal', 'anmol'] as const)
    .slice().sort((a, b) => (bal[b] ?? 0) - (bal[a] ?? 0));

  return (
    <>
      <section className="hero">
        <h2>Standings</h2>
        <div className="hero-grid">
          {order.map((p) => {
            const v = bal[p] ?? 0;
            return (
              <div className="hero-cell" key={p}>
                <div className="who">{playerName(p)}</div>
                <div className={`bal ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>{inr(v)}</div>
                <div className="wld">{count(p, 'W')}W {count(p, 'L')}L {count(p, 'D')}D</div>
              </div>
            );
          })}
        </div>
        <div className="hero-foot">
          <span className={`zero ${zeroOk ? '' : 'bad'}`}>
            <span className="ring" aria-hidden="true" />
            <span>₹{sum.toLocaleString('en-IN')} {zeroOk ? 'balances sum to ₹0' : 'balances do not sum to ₹0. Ledger locked.'}</span>
          </span>
        </div>
      </section>

      <div className="grid2">
        <div className="card">
          <h4>Season progress</h4>
          <p className="sans num">{loading ? '…' : `${payingPlayed} of 63 paying, ${recorded.length} of 69 logged`}</p>
          <div className="meter"><span style={{ width: `${Math.round((recorded.length / 69) * 100)}%` }} /></div>
        </div>
        <div className="goalframe">
          <h4 style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 8px' }}>Trophy pool remaining</h4>
          <p className="sans num">₹{pageData.trophyPool.toLocaleString('en-IN')}, 9 of 9 live</p>
          <div className="meter"><span style={{ width: '100%' }} /></div>
        </div>
      </div>

      <h3>Table</h3>
      <table className="record">
        <thead><tr><th>Player</th><th className="num">Net</th><th className="num">W</th><th className="num">L</th><th className="num">D</th></tr></thead>
        <tbody>
          {order.map((p) => {
            const v = bal[p] ?? 0;
            return (
              <tr key={p}><td>{playerName(p)}</td>
              <td className={`num ${v > 0 ? 'credit' : v < 0 ? 'debit' : 'num'}`}>{inr(v)}</td>
              <td className="num">{count(p, 'W')}</td><td className="num">{count(p, 'L')}</td><td className="num">{count(p, 'D')}</td></tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
