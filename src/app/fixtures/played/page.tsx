export default function Played() {
  return (
    <>
      <h2>Fixtures — Played</h2>
      <p>No counted fixture has been recorded yet. Every recorded fixture will show date, competition, clubs, score, winning club, winning player and ₹ — and for league fixtures whether the reverse is still to come.</p>
      <table className="record">
        <thead><tr><th>Date (IST)</th><th>Competition</th><th>Fixture</th><th>Score</th><th>Winner</th><th>₹</th></tr></thead>
        <tbody><tr><td colSpan={6}>Nothing recorded yet.</td></tr></tbody>
      </table>
    </>
  );
}
