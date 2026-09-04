import { settle } from '@/lib/awards/compute';

/** `/settle` — minimum-transaction settlement. */
export default function Settle() {
  const balances = { archit: 0, vedant: 0, harshal: 0, anmol: 0 };
  const payments = settle(balances);
  return (
    <>
      <h2>Settle Up</h2>
      <p>The smallest set of payments that squares everyone. Greedy largest-creditor / largest-debtor matching (sufficient for n=4).</p>
      {payments.length === 0 ? (
        <p className="sans">Everyone is square — no payments needed.</p>
      ) : (
        <table className="record">
          <thead><tr><th>From</th><th>To</th><th>₹</th></tr></thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i}><td>{p.from}</td><td>{p.to}</td><td className="num">₹{p.amount.toLocaleString('en-IN')}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
