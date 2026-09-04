export default function Constitution() {
  return (
    <>
      <h2>The Constitution</h2>
      <p>The complete and binding rules of the 2026/27 season — versioned, with amendment history.</p>
      <h3>Match money</h3>
      <table className="record">
        <thead><tr><th>Outcome</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Win by 1–3</td><td className="num">₹500</td></tr>
          <tr><td>Win by 4+</td><td className="num">₹1,000</td></tr>
          <tr><td>Draw</td><td className="num">₹0</td></tr>
        </tbody>
      </table>
      <h3>Trophies</h3>
      <table className="record">
        <thead><tr><th>Competition</th><th>Win / Pay</th></tr></thead>
        <tbody>
          <tr><td>League title ×4</td><td className="num">₹3,000 / ₹1,000</td></tr>
          <tr><td>Champions League</td><td className="num">₹6,000 / ₹2,000</td></tr>
          <tr><td>Domestic cup ×4</td><td className="num">₹1,500 / ₹500</td></tr>
        </tbody>
      </table>
      <h3>Knockouts</h3>
      <p>Whoever advances wins. Extra time counts. A penalty shootout is a win. Two legs, one aggregate result.</p>
      <h3>Amendment history</h3>
      <p className="sans">Ratified 17 August 2026 · Squads locked 20 August 2026 · <strong>Amendment I (Assisted Operating Mode) — pending Archit&apos;s ratification in the Commissioner console.</strong></p>
      <div className="card">
        <h4>Remember</h4>
        <p>The four balances always sum to ₹0. If they don&apos;t, something is wrong.</p>
      </div>
    </>
  );
}
