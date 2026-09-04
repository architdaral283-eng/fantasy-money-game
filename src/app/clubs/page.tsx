import { pageData } from '@/lib/pages/data';

/** `/clubs` — 16 clubs + the 2/4 asymmetry + counted-fixtures inversion. */
export default function Clubs() {
  return (
    <>
      <h2>Club Ownership — Locked</h2>
      <p>No trades, no swaps, no replacements. Fixed for the season.</p>
      <table className="record">
        <thead><tr><th>League</th><th>Club</th><th>Owner</th><th>Pick</th><th>In 2026–27 UCL</th></tr></thead>
        <tbody>
          {pageData.clubs.map((c) => (
            <tr key={c.id}><td>{c.league}</td><td><strong>{c.name}</strong></td><td>{c.owner}</td>
            <td className="num">{c.pick}</td><td>{c.inUcl ? 'Yes' : '—'}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="card">
        <h4>The one asymmetry in this draft</h4>
        <p>Bayer Leverkusen and Juventus are not in the Champions League. Both are Archit&apos;s. Archit therefore has two clubs in Europe&apos;s top competition where everyone else has four — and can only reach the ₹6,000 Champions League trophy through Arsenal or Atletico Madrid.</p>
      </div>
      <h3>Champions League exposure</h3>
      <table className="record">
        <thead><tr><th>Player</th><th>In the UCL</th><th>Outside it</th><th>Counted UCL fixtures</th></tr></thead>
        <tbody>
          <tr><td>Archit</td><td className="num">2 / 4</td><td className="sans">Bayer Leverkusen, Juventus</td><td className="num">7</td></tr>
          <tr><td>Vedant</td><td className="num">4 / 4</td><td className="sans">—</td><td className="num">9</td></tr>
          <tr><td>Harshal</td><td className="num">4 / 4</td><td className="sans">—</td><td className="num">10</td></tr>
          <tr><td>Anmol</td><td className="num">4 / 4</td><td className="sans">—</td><td className="num">4</td></tr>
        </tbody>
      </table>
    </>
  );
}
