'use client';
import { playerName } from '@/lib/pages/data';
import { useLiveData } from '@/lib/pages/live';

export default function Ledger() {
  const { ledger, loading } = useLiveData();
  return (
    <>
      <h2>Financial Ledger</h2>
      <p>Every entry, append-only, filterable by player/competition/date. Corrections appear inline, linked to what they correct. A superseded row is never hidden.{loading ? ' Loading…' : ''}</p>
      <table className="record">
        <thead><tr><th>#</th><th>Date</th><th>Event</th><th>From</th><th>To</th><th>₹</th></tr></thead>
        <tbody>
          {ledger.length === 0
            ? <tr><td colSpan={6}>No entries yet. The four balances sum to ₹0.</td></tr>
            : ledger.map((e) => (
              <tr key={e.id}><td className="num">{e.id}</td><td className="sans">{e.occurred_on}</td>
              <td className="sans">{e.event_type} — {e.description}</td>
              <td>{playerName(e.from_player_id)}</td><td>{playerName(e.to_player_id)}</td>
              <td className="num">₹{e.amount_inr.toLocaleString('en-IN')}</td></tr>
            ))}
        </tbody>
      </table>
    </>
  );
}
