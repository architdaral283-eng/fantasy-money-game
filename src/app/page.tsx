'use client';
import { pageData, inr, playerName } from '@/lib/pages/data';
import { useLiveData, balancesOf } from '@/lib/pages/live';

/** `/` — standings, zero-sum badge, last results, progress, pool. */
export default function Home() {
  const { ledger, fixtures, loading } = useLiveData();
  const bal = balancesOf(ledger);
  const sum = Object.values(bal).reduce((s, v) => s + v, 0);
  const zeroOk = sum === 0;
  const recorded = fixtures.filter((f) => f.status === 'RECORDED');
  const payingPlayed = recorded.filter((f) => !f.is_same_owner).length;

  return (
    <>
      <h2>Where Things Stand</h2>
      <p className="sans">
        <span className={zeroOk ? 'zero-ok' : 'zero-bad'}>₹{sum} {zeroOk ? '✓ zero-sum' : '✗ ALERT'}</span>
      </p>
      <p>Sixteen clubs drafted, all nine trophies live. The Premier League opens on 21 August and the season ends at the Champions League final in Madrid on 5 June 2027.</p>

      <div className="grid2">
        <div className="card"><h4>Season progress</h4><p className="sans num">{loading ? '…' : `${payingPlayed} of 63 paying · ${recorded.length} of 69 logged`}</p></div>
        <div className="card"><h4>Trophy pool remaining</h4><p className="sans num">₹{pageData.trophyPool.toLocaleString('en-IN')} · 9 / 9 live</p></div>
      </div>

      <h3>Standings</h3>
      <table className="record">
        <thead><tr><th>Player</th><th>Net</th><th>W</th><th>L</th><th>D</th></tr></thead>
        <tbody>
          {(['archit', 'vedant', 'harshal', 'anmol'] as const).map((p) => (
            <tr key={p}><td>{playerName(p)}</td><td className="num">{inr(bal[p] ?? 0)}</td>
            <td className="num">0</td><td className="num">0</td><td className="num">0</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Boot assertions (§4.5)</h3>
      <p className="sans num">{pageData.boot.totalLogged} logged · {pageData.boot.payingCount} paying · UCL per player {JSON.stringify(pageData.boot.uclPerPlayer)}</p>
    </>
  );
}
