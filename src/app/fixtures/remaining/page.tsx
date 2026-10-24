'use client';
import { pageData, clubName } from '@/lib/pages/data';
import { useLiveData } from '@/lib/pages/live';

// Static competition label -> live competitions.id. The key MUST include the
// competition: Arsenal v Manchester City exists both as a played Community
// Shield tie and as a genuinely upcoming Premier League fixture, so matching on
// the club pair alone would hide a real fixture.
const COMP_ID: Record<string, string> = {
  'Premier League': 'epl', 'La Liga': 'laliga', 'Bundesliga': 'bundesliga', 'Serie A': 'seriea',
};

export default function Remaining() {
  const leagues = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A'];
  const { fixtures, loading } = useLiveData();
  const recorded = new Set(
    fixtures.filter((f) => f.status === 'RECORDED')
      .map((f) => `${f.competition_id}|${f.home_club_id}|${f.away_club_id}`),
  );
  const unplayed = (compId: string, home: string, away: string) => !recorded.has(`${compId}|${home}|${away}`);
  return (
    <>
      <h2>Fixtures — Remaining</h2>
      <p>Still to play. Recorded fixtures drop off this list. Domestic cup ties join it only once actually drawn. <span className="sans">NOT_POSSIBLE items appear struck through.</span>{loading ? ' Loading…' : ''}</p>
      {leagues.map((lg) => (
        <div key={lg}>
          <h3>{lg}</h3>
          <table className="record">
            <thead><tr><th>Home</th><th>Away</th><th>Owners</th></tr></thead>
            <tbody>
              {pageData.leagueFixtures.filter((f) => f.competition === lg && unplayed(COMP_ID[lg], f.home, f.away)).map((f, i) => (
                <tr key={i}><td>{clubName(f.home)}</td><td>{clubName(f.away)}</td><td className="sans">{f.homeOwner} v {f.awayOwner}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <h3>Champions League — League Phase</h3>
      <table className="record">
        <thead><tr><th>Home</th><th>Away</th><th>Owners</th><th>Counts?</th></tr></thead>
        <tbody>
          {pageData.uclFixtures.filter((f) => unplayed('ucl', f.home, f.away)).map((f, i) => (
            <tr key={i}><td>{clubName(f.home)}</td><td>{clubName(f.away)}</td>
            <td className="sans">{f.homeOwner} v {f.awayOwner}</td>
            <td className="sans">{f.sameOwner ? 'Same owner — ₹0, not counted' : 'Paying'}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
