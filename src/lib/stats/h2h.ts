// Head to head between two owners. Pure counting, separated from IO so the
// ordering bug ("X leads 1–3") can be tested without a database.

export interface H2HFixture { id: string; home_club_id: string; away_club_id: string; status: string }
export interface H2HWld { player_id: string; fixture_id: string | null; outcome: string }
export interface H2HTally { games: number; aWins: number; bWins: number; draws: number }

export function h2hTally(
  a: string, b: string,
  fixtures: H2HFixture[],
  ownerOf: (clubId: string) => string | undefined,
  wld: H2HWld[],
): H2HTally {
  let games = 0, aWins = 0, bWins = 0, draws = 0;
  for (const f of fixtures) {
    if (f.status !== 'RECORDED') continue;
    const pair = new Set([ownerOf(f.home_club_id), ownerOf(f.away_club_id)]);
    if (!(pair.has(a) && pair.has(b))) continue;
    games++;
    // Both players get a row per fixture, so resolve ONE outcome per fixture
    // from a's point of view. Counting per row double-credits every result.
    const rows = wld.filter((w) => w.fixture_id === f.id);
    if (!rows.length) continue;
    const aRow = rows.find((w) => w.player_id === a);
    const bRow = rows.find((w) => w.player_id === b);
    const seen = aRow?.outcome
      ?? (bRow ? (bRow.outcome === 'W' ? 'L' : bRow.outcome === 'L' ? 'W' : 'D') : null);
    if (seen === 'W') aWins++;
    else if (seen === 'L') bWins++;
    else if (seen === 'D') draws++;
  }
  return { games, aWins, bWins, draws };
}

/** "Anmol leads 3–1" / "level at 2–2" / "nothing between them yet". Leader always first. */
export function h2hText(aName: string, bName: string, t: H2HTally): string {
  if (t.games === 0) return 'nothing between them yet';
  if (t.aWins === t.bWins) return `level at ${t.aWins}–${t.bWins}${t.draws ? `, ${t.draws} drawn` : ''}`;
  const leader = t.aWins > t.bWins ? aName : bName;
  const hi = Math.max(t.aWins, t.bWins);
  const lo = Math.min(t.aWins, t.bWins);
  return `${leader} leads ${hi}–${lo}${t.draws ? `, ${t.draws} drawn` : ''}`;
}
