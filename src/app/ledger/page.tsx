export default function Ledger() {
  return (
    <>
      <h2>Financial Ledger</h2>
      <p>Every entry, append-only, filterable by player/competition/date. Corrections appear inline, linked to what they correct. A superseded row is never hidden.</p>
      <table className="record">
        <thead><tr><th>#</th><th>Date</th><th>Event</th><th>From</th><th>To</th><th>₹</th></tr></thead>
        <tbody><tr><td colSpan={6}>No entries yet. The four balances sum to ₹0.</td></tr></tbody>
      </table>
    </>
  );
}
