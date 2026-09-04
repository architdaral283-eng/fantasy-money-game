import { inr } from '@/lib/pages/data';

export default function Standings() {
  return (
    <>
      <h2>Standings</h2>
      <p>Ranked by net balance. W/L/D, match earnings, trophy earnings, net.</p>
      <table className="record">
        <thead><tr><th>#</th><th>Player</th><th>Net</th><th>W</th><th>L</th><th>D</th><th>Match ₹</th><th>Trophy ₹</th></tr></thead>
        <tbody>
          {['Archit', 'Vedant', 'Harshal', 'Anmol'].map((p, i) => (
            <tr key={p}><td className="num">{i + 1}</td><td>{p}</td><td className="num">{inr(0)}</td>
            <td className="num">0</td><td className="num">0</td><td className="num">0</td>
            <td className="num">{inr(0)}</td><td className="num">{inr(0)}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
