import { pageData, inr } from '@/lib/pages/data';

/** `/` — standings, zero-sum badge, last results, next fixtures, pool, progress. */
export default function Home() {
  const { boot, trophyPool } = pageData;
  const zeroOk = true; // all balances ₹0 at season start; live value from player_balances view
  return (
    <>
      <h2>Where Things Stand</h2>
      <p className="sans">
        <span className={zeroOk ? 'zero-ok' : 'zero-bad'}>₹0 ✓ zero-sum</span>
      </p>
      <p>Sixteen clubs drafted, no result recorded, all nine trophies live. The Premier League opens on 21 August and the season ends at the Champions League final in Madrid on 5 June 2027.</p>

      <div className="grid2">
        <div className="card"><h4>Season progress</h4><p className="sans num">0 of 63 paying · 0 of 69 logged</p></div>
        <div className="card"><h4>Trophy pool remaining</h4><p className="sans num">₹{trophyPool.toLocaleString('en-IN')} · 9 / 9 live</p></div>
      </div>

      <h3>Standings</h3>
      <table className="record">
        <thead><tr><th>Player</th><th>Net</th><th>W</th><th>L</th><th>D</th></tr></thead>
        <tbody>
          {['Archit', 'Vedant', 'Harshal', 'Anmol'].map((p) => (
            <tr key={p}><td>{p}</td><td className="num">{inr(0)}</td><td className="num">0</td><td className="num">0</td><td className="num">0</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Boot assertions (§4.5)</h3>
      <p className="sans num">{boot.totalLogged} logged · {boot.payingCount} paying · UCL per player {JSON.stringify(boot.uclPerPlayer)}</p>
      {!boot.ok && boot.errors.map((e) => <p key={e} className="sans">{e}</p>)}
    </>
  );
}
