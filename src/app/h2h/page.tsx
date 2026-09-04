import { RIVALRIES, playerName } from '@/lib/pages/data';

export default function H2H() {
  return (
    <>
      <h2>Head-to-Head Ledger</h2>
      <p>Every pair owns a club in all four leagues, so every rivalry meets <strong>eight times</strong> in league football alone — before a single cup tie.</p>
      <table className="record">
        <thead><tr><th>Rivalry</th><th>League fixtures</th><th>Played</th><th>A wins</th><th>B wins</th><th>Draws</th><th>Net to A</th></tr></thead>
        <tbody>
          {RIVALRIES.map(([a, b]) => (
            <tr key={`${a}-${b}`}>
              <td><a href={`/h2h/${a}/${b}`}>{playerName(a)} v {playerName(b)}</a></td>
              <td className="num">8</td><td className="num">0</td><td className="num">0</td>
              <td className="num">0</td><td className="num">0</td><td className="num">₹0</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
