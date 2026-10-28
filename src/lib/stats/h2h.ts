// Head to head between two owners. Pure counting, separated from IO so the
// ordering bug ("X leads 1–3") can be tested without a database.

import { money } from '@/lib/notify/format';

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

// ---------------------------------------------------------------------------
// The last meeting. The head-to-head record says "Vedant leads 3-1"; it does
// not say what happened the one time that mattered. This does, so a rematch
// arrives carrying its own history.

export interface H2HDatedFixture extends H2HFixture { kickoff_utc: string | null }
export interface H2HResult { fixture_id: string; h90: number; a90: number }

export interface LastMeeting {
  fixtureId: string;
  homeClubId: string;
  awayClubId: string;
  h90: number | null;
  a90: number | null;
  at: string | null;
  /** Owner id who won. Null for a draw, or when no W/L row survives. */
  winner: string | null;
  /** Owner id who paid. Null when nothing moved. */
  loser: string | null;
  /** What it cost: 1,000 if the 90-minute score finished 4+, else 500. 0 on a draw. */
  stake: number;
}

/**
 * Most recent RECORDED fixture between owners a and b. Same-owner fixtures are
 * excluded: no money moved, so there is nothing to avenge.
 */
export function lastMeeting(
  a: string, b: string,
  fixtures: H2HDatedFixture[],
  ownerOf: (clubId: string) => string | undefined,
  wld: H2HWld[],
  results: H2HResult[],
): LastMeeting | null {
  const byFixture = new Map(results.map((r) => [r.fixture_id, r]));
  const met = fixtures.filter((f) => {
    if (f.status !== 'RECORDED') return false;
    const oh = ownerOf(f.home_club_id);
    const oa = ownerOf(f.away_club_id);
    if (oh === undefined || oa === undefined || oh === oa) return false;
    return (oh === a && oa === b) || (oh === b && oa === a);
  });
  if (!met.length) return null;

  // Newest first. A null kickoff parses to NaN, so it sorts to the back
  // rather than to the front — hand-entered rows must not win this race.
  const when = (f: H2HDatedFixture) => Date.parse(f.kickoff_utc ?? '') || 0;
  met.sort((x, y) => when(y) - when(x));
  const f = met[0];

  // One outcome per fixture, read from a's point of view, exactly as the
  // tally does. Reading both rows counts the same result twice.
  const rows = wld.filter((w) => w.fixture_id === f.id);
  const aRow = rows.find((w) => w.player_id === a);
  const bRow = rows.find((w) => w.player_id === b);
  const seen = aRow?.outcome
    ?? (bRow ? (bRow.outcome === 'W' ? 'L' : bRow.outcome === 'L' ? 'W' : 'D') : null);

  const r = byFixture.get(f.id) ?? null;
  const total = r ? r.h90 + r.a90 : null;
  const decided = seen === 'W' || seen === 'L';

  return {
    fixtureId: f.id,
    homeClubId: f.home_club_id,
    awayClubId: f.away_club_id,
    h90: r?.h90 ?? null,
    a90: r?.a90 ?? null,
    at: f.kickoff_utc,
    winner: seen === 'W' ? a : seen === 'L' ? b : null,
    loser: seen === 'W' ? b : seen === 'L' ? a : null,
    stake: !decided ? 0 : total !== null && total >= 4 ? 1000 : 500,
  };
}

/**
 * One line of history for a fixture notice. `samePair` means the identical two
 * clubs are meeting again, which earns the harder word.
 */
export function lastMeetingText(
  m: LastMeeting,
  clubName: (id: string) => string,
  playerName: (id: string) => string,
  dateIST: string | null,
  samePair: boolean,
): string {
  const score = m.h90 !== null && m.a90 !== null ? `${m.h90}\u2013${m.a90}` : 'v';
  const tie = `${clubName(m.homeClubId)} ${score} ${clubName(m.awayClubId)}`;
  const label = samePair ? 'Rematch' : 'Last meeting';
  const head = dateIST ? `${label}: ${tie}, ${dateIST}.` : `${label}: ${tie}.`;
  if (!m.winner || !m.loser || m.stake === 0) return `${head} Nothing moved.`;
  return `${head} ${playerName(m.winner)} took ${money(m.stake)} off ${playerName(m.loser)}.`;
}
