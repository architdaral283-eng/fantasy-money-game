import { pageData, clubName } from '@/lib/pages/data';

export default function Remaining() {
  const leagues = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A'];
  return (
    <>
      <h2>Fixtures — Remaining</h2>
      <p>48 league fixtures plus 21 UCL league-phase ties. Domestic cup ties join this list only once actually drawn. <span className="sans">NOT_POSSIBLE items appear struck through.</span></p>
      {leagues.map((lg) => (
        <div key={lg}>
          <h3>{lg}</h3>
          <table className="record">
            <thead><tr><th>Home</th><th>Away</th><th>Owners</th></tr></thead>
            <tbody>
              {pageData.leagueFixtures.filter((f) => f.competition === lg).map((f, i) => (
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
          {pageData.uclFixtures.map((f, i) => (
            <tr key={i}><td>{clubName(f.home)}</td><td>{clubName(f.away)}</td>
            <td className="sans">{f.homeOwner} v {f.awayOwner}</td>
            <td className="sans">{f.sameOwner ? 'Same owner — ₹0, not counted' : 'Paying'}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
