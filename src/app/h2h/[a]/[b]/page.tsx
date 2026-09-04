'use client';
import { use } from 'react';
import { playerName, clubName } from '@/lib/pages/data';
import { useLiveData } from '@/lib/pages/live';
import { CLUBS } from '@/lib/domain/constants';

const ownerOf = (clubId: string) => CLUBS.find((c) => c.id === clubId)?.owner ?? '?';

const COMP: Record<string, string> = {
  epl: 'Premier League', laliga: 'La Liga', bundesliga: 'Bundesliga',
  seriea: 'Serie A', ucl: 'Champions League',
  communityshield: 'Community Shield', dflsupercup: 'DFL-Supercup',
};

export default function H2HPair({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = use(params);
  const { fixtures, results, wld, ledger, loading } = useLiveData();
  const resByFx = new Map(results.map((r) => [r.fixture_id, r]));
  const meetings = fixtures.filter((f) => {
    if (f.status !== 'RECORDED') return false;
    const pair = new Set([ownerOf(f.home_club_id), ownerOf(f.away_club_id)]);
    return pair.has(a) && pair.has(b);
  });

  const winnerOf = (fxId: string): string => {
    const w = wld.find((r) => r.fixture_id === fxId && r.outcome === 'W');
    return w ? playerName(w.player_id) : 'Draw';
  };
  const amountOf = (fxId: string): string => {
    const rows = ledger.filter((e) => e.fixture_id === fxId);
    if (!rows.length) return '₹0';
    return `₹${rows.reduce((s, r) => s + r.amount_inr, 0).toLocaleString('en-IN')}`;
  };

  return (
    <>
      <h2>{playerName(a)} v {playerName(b)}</h2>
      <p>League, cup and UCL meetings, with money.{loading ? ' Loading…' : ''}</p>
      <table className="record">
        <thead><tr><th>Competition</th><th>Fixture</th><th>Score</th><th>Winner</th><th>₹</th></tr></thead>
        <tbody>
          {meetings.length === 0
            ? <tr><td colSpan={5}>Nothing played yet.</td></tr>
            : meetings.map((f) => {
              const r = resByFx.get(f.id);
              return (
                <tr key={f.id}>
                  <td>{COMP[f.competition_id] ?? f.competition_id}</td>
                  <td>{clubName(f.home_club_id)} v {clubName(f.away_club_id)}</td>
                  <td className="num">{r ? `${r.h90}-${r.a90}` : '—'}</td>
                  <td>{winnerOf(f.id)}</td>
                  <td className="num">{amountOf(f.id)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </>
  );
}
