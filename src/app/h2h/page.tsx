'use client';
import { RIVALRIES, playerName } from '@/lib/pages/data';
import { useLiveData } from '@/lib/pages/live';
import { CLUBS } from '@/lib/domain/constants';

const ownerOf = (clubId: string) => CLUBS.find((c) => c.id === clubId)?.owner ?? '?';

export function rivalryStats(
  fixtures: { id: string; home_club_id: string; away_club_id: string; status: string }[],
  wld: { player_id: string; fixture_id: string | null; outcome: string }[],
  ledger: { fixture_id: string | null; from_player_id: string; to_player_id: string; amount_inr: number }[],
  a: string, b: string,
) {
  let played = 0, aw = 0, bw = 0, dr = 0, netA = 0;
  for (const f of fixtures) {
    if (f.status !== 'RECORDED') continue;
    const pair = new Set([ownerOf(f.home_club_id), ownerOf(f.away_club_id)]);
    if (!(pair.has(a) && pair.has(b))) continue;
    played++;
    const rows = wld.filter((w) => w.fixture_id === f.id);
    if (rows.length && rows.every((w) => w.outcome === 'D')) dr++;
    else {
      for (const w of rows) {
        if (w.player_id === a) { if (w.outcome === 'W') aw++; else bw++; }
        else if (w.player_id === b) { if (w.outcome === 'W') bw++; else aw++; }
      }
    }
    for (const e of ledger.filter((x) => x.fixture_id === f.id)) {
      netA += (e.to_player_id === a ? e.amount_inr : 0) - (e.from_player_id === a ? e.amount_inr : 0);
    }
  }
  return { played, aw, bw, dr, netA };
}

export default function H2H() {
  const { fixtures, wld, ledger, loading } = useLiveData();
  return (
    <>
      <h2>Head-to-Head Ledger</h2>
      <p>Every pair owns a club in all four leagues, so every rivalry meets eight times in league football alone — before a single cup tie.{loading ? ' Loading…' : ''}</p>
      <table className="record">
        <thead><tr><th>Rivalry</th><th>Played</th><th>A wins</th><th>B wins</th><th>Draws</th><th>Net to A</th></tr></thead>
        <tbody>
          {RIVALRIES.map(([a, b]) => {
            const s = rivalryStats(fixtures, wld, ledger, a, b);
            return (
              <tr key={`${a}-${b}`}>
                <td><a href={`/h2h/${a}/${b}`}>{playerName(a)} v {playerName(b)}</a></td>
                <td className="num">{s.played}</td><td className="num">{s.aw}</td>
                <td className="num">{s.bw}</td><td className="num">{s.dr}</td>
                <td className="num">₹{s.netA.toLocaleString('en-IN')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
