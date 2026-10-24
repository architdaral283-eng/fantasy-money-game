'use client';
import { clubName, playerName } from '@/lib/pages/data';
import { ownerOf } from '@/lib/domain/constants';
import { useLiveData } from '@/lib/pages/live';

const COMP: Record<string, string> = {
  epl: 'Premier League', laliga: 'La Liga', bundesliga: 'Bundesliga',
  seriea: 'Serie A', ucl: 'Champions League',
};

export default function Played() {
  const { fixtures, results, wld, ledger, loading } = useLiveData();
  const resByFx = new Map(results.map((r) => [r.fixture_id, r]));
  const played = fixtures.filter((f) => f.status === 'RECORDED');

  // A same-owner fixture has no W/L/D row and moves no money. That is not a
  // draw — labelling Real Madrid 4-1 Leipzig "Draw" was simply wrong.
  const winnerOf = (f: { id: string; home_club_id: string; away_club_id: string }): string => {
    if (ownerOf(f.home_club_id) === ownerOf(f.away_club_id)) return 'Same owner';
    const w = wld.find((r) => r.fixture_id === f.id && r.outcome === 'W');
    return w ? playerName(w.player_id) : 'Draw';
  };
  const amountOf = (fxId: string): string => {
    const rows = ledger.filter((e) => e.fixture_id === fxId);
    if (!rows.length) return '₹0';
    return `₹${rows.reduce((s, r) => s + r.amount_inr, 0).toLocaleString('en-IN')}`;
  };

  return (
    <>
      <h2>Fixtures — Played</h2>
      <p>Date, competition, clubs, score, winning player and ₹ — and for league fixtures whether the reverse is still to come.{loading ? ' Loading…' : ''}</p>
      <table className="record">
        <thead><tr><th>Competition</th><th>Fixture</th><th>Score</th><th>Winner</th><th>₹</th></tr></thead>
        <tbody>
          {played.length === 0
            ? <tr><td colSpan={5}>Nothing recorded yet.</td></tr>
            : played.map((f) => {
              const r = resByFx.get(f.id);
              return (
                <tr key={f.id}>
                  <td>{COMP[f.competition_id] ?? f.competition_id}</td>
                  <td>{clubName(f.home_club_id)} v {clubName(f.away_club_id)}</td>
                  <td className="num">{r ? `${r.h90}-${r.a90}` : '—'}</td>
                  <td>{winnerOf(f)}</td>
                  <td className="num">{amountOf(f.id)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </>
  );
}
