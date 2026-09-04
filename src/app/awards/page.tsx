const AWARDS: [string, string][] = [
  ['Most Wins', 'across all competitions'], ['Most Losses', 'the wooden spoon'],
  ['Most Draws', 'the escape artist'], ['Longest Win Streak', 'consecutive wins'],
  ['Longest Losing Streak', 'consecutive losses'], ['Highest Match Earnings', 'from play alone'],
  ['Highest Trophy Earnings', 'from silverware alone'], ['Highest Overall Earnings', 'gross, before losses'],
  ['Most Money Lost', 'gross outgoings'], ['Biggest Victory', 'largest winning margin'],
  ['Biggest Defeat', 'largest losing margin'], ['Best Club', 'most wins by a single club'],
  ['Worst Club', 'most losses by a single club'], ['Most Valuable Club', 'most ₹ earned for its owner'],
  ['Largest Upset', 'provisional definition — pending Archit\u2019s ratification'],
  ['Most Successful Player', 'highest net balance'],
];

export default function Awards() {
  return (
    <>
      <h2>Season Awards</h2>
      <p>Calculated continuously from the fixture log and ledger — nothing here is entered by hand.</p>
      <div className="grid2">
        {AWARDS.map(([name, sub]) => (
          <div className="card" key={name}><h4>{name}</h4><p className="sans">{sub} — undecided</p></div>
        ))}
      </div>
    </>
  );
}
