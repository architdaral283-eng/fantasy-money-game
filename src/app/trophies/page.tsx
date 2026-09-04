import { pageData } from '@/lib/pages/data';

export default function Trophies() {
  // nine trophies only — one-off super cups pay match money, never silverware
  const cups = pageData.competitions.filter((c) => !c.oneOff);
  return (
    <>
      <h2>Trophy Tracker</h2>
      <p>Nine trophies, ₹{pageData.trophyPool.toLocaleString('en-IN')} in the pool, none decided. A trophy won by a club nobody owns pays nothing and simply leaves the season.</p>
      <table className="record">
        <thead><tr><th>Competition</th><th>Winning club</th><th>Owner</th><th>Prize</th><th>Status</th></tr></thead>
        <tbody>
          {cups.map((c) => (
            <tr key={c.id}><td>{c.name}</td><td className="sans">—</td><td className="sans">—</td>
            <td className="num">₹{c.winnerPrize.toLocaleString('en-IN')}</td><td>Live</td></tr>
          ))}
        </tbody>
      </table>
      <p className="sans">One-off super cups (Community Shield, DFL-Supercup) pay match money only — no trophy.</p>
    </>
  );
}
