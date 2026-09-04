import { pageData, inr } from '@/lib/pages/data';

export default function Me() {
  // TODO: picks up the logged-in player from Supabase Auth; Archit by default in dev.
  const me = pageData.players[0];
  const mine = pageData.clubs.filter((c) => c.owner === me.id);
  return (
    <>
      <h2>Your Season — {me.name}</h2>
      <p className="sans num">Balance {inr(0)} · W 0 · L 0 · D 0</p>
      <h3>Your four clubs</h3>
      <table className="record">
        <thead><tr><th>League</th><th>Club</th><th>Pick</th><th>UCL</th></tr></thead>
        <tbody>
          {mine.map((c) => (
            <tr key={c.id}><td>{c.league}</td><td>{c.name}</td><td className="num">{c.pick}</td><td>{c.inUcl ? 'Yes' : '—'}</td></tr>
          ))}
        </tbody>
      </table>
      <h3>Who you owe / who owes you</h3>
      <p>Nothing outstanding — nobody has paid anybody yet.</p>
    </>
  );
}
