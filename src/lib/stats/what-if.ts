// The what-if machine. Re-runs the season that actually happened over a
// different draft.
//
// The trick is not to re-score anything. Who won a match and by how much are
// football facts that a different draft would not have changed; the only
// thing that changes is which of the four owned the club that won it. So this
// reads the real outcome and the real amount straight off the ledger and the
// W/L/D records, and only re-points them at different people.
//
// That also means penalty shootouts, two-legged aggregates and extra time all
// come out right without a line of code about any of them — the engine
// already settled those, and this never second-guesses it.

export interface WhatIfFixture { id: string; home_club_id: string; away_club_id: string; status: string }
export interface WhatIfWld { player_id: string; fixture_id: string | null; outcome: string }
export interface WhatIfLedger { fixture_id: string | null; from_player_id: string; to_player_id: string; amount_inr: number }

export interface PlayedFixture {
  fixtureId: string;
  clubs: [string, string];
  /** Club credited with the win. Null for a draw. */
  winnerClubId: string | null;
  loserClubId: string | null;
  /** What actually moved on it. 0 for a draw. */
  amount: number;
}

/** Everything that has been settled, reduced to clubs and rupees. */
export function playedFixtures(
  fixtures: WhatIfFixture[],
  wld: WhatIfWld[],
  ledger: WhatIfLedger[],
  actualOwnerOf: (clubId: string) => string | undefined,
): PlayedFixture[] {
  const out: PlayedFixture[] = [];
  for (const f of fixtures) {
    if (f.status !== 'RECORDED') continue;
    const rows = wld.filter((w) => w.fixture_id === f.id);
    if (!rows.length) continue;

    const homeOwner = actualOwnerOf(f.home_club_id);
    const awayOwner = actualOwnerOf(f.away_club_id);
    // One owner on both sides was logged at ₹0 with no W/L/D. Under a
    // different draft it is an ordinary fixture, but we have no record of who
    // won it, so it cannot be re-run. Left out rather than guessed.
    if (!homeOwner || !awayOwner || homeOwner === awayOwner) continue;

    const winner = rows.find((w) => w.outcome === 'W')?.player_id ?? null;
    const amount = ledger
      .filter((l) => l.fixture_id === f.id)
      .reduce((s, l) => Math.max(s, Math.abs(Number(l.amount_inr) || 0)), 0);

    const winnerClubId = winner === homeOwner ? f.home_club_id : winner === awayOwner ? f.away_club_id : null;
    const loserClubId = winnerClubId === null ? null
      : winnerClubId === f.home_club_id ? f.away_club_id : f.home_club_id;

    out.push({
      fixtureId: f.id,
      clubs: [f.home_club_id, f.away_club_id],
      winnerClubId,
      loserClubId,
      amount: winnerClubId ? amount : 0,
    });
  }
  return out;
}

export interface AltStanding { player: string; net: number; w: number; l: number; d: number }

/** The table this season would have produced under a different ownership map. */
export function recompute(
  played: PlayedFixture[],
  ownerOf: (clubId: string) => string | undefined,
  players: readonly string[],
): AltStanding[] {
  const acc = new Map<string, AltStanding>(players.map((p) => [p, { player: p, net: 0, w: 0, l: 0, d: 0 }]));
  const bump = (p: string, fn: (s: AltStanding) => void) => {
    const s = acc.get(p) ?? { player: p, net: 0, w: 0, l: 0, d: 0 };
    fn(s);
    acc.set(p, s);
  };

  for (const f of played) {
    const a = ownerOf(f.clubs[0]);
    const b = ownerOf(f.clubs[1]);
    if (!a || !b) continue;
    // Constitution §10: one owner on both sides is logged at ₹0 with no
    // change to W/L/D. Nobody pays themselves.
    if (a === b) continue;

    if (!f.winnerClubId || !f.loserClubId) {
      bump(a, (s) => { s.d++; });
      bump(b, (s) => { s.d++; });
      continue;
    }
    const win = ownerOf(f.winnerClubId);
    const lose = ownerOf(f.loserClubId);
    if (!win || !lose) continue;
    bump(win, (s) => { s.net += f.amount; s.w++; });
    bump(lose, (s) => { s.net -= f.amount; s.l++; });
  }

  return [...acc.values()].sort((x, y) => y.net - x.net || x.player.localeCompare(y.player));
}

/** Deterministic, seedable. Math.random cannot be reproduced or tested. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An alternative draft, shuffled WITHIN each league.
 *
 * The real draft gives every player one club from each of the four leagues,
 * so a shuffle that ignored leagues would not be a different draft — it would
 * be a different game.
 */
export function shuffleAssignment(
  clubs: { id: string; league: string }[],
  players: readonly string[],
  rand: () => number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const leagues = [...new Set(clubs.map((c) => c.league))];
  for (const lg of leagues) {
    const inLeague = clubs.filter((c) => c.league === lg);
    const order = [...players];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    inLeague.forEach((c, i) => { out[c.id] = order[i % order.length]; });
  }
  return out;
}

/** The draft as it actually went. */
export function actualAssignment(clubs: { id: string; owner: string }[]): Record<string, string> {
  return Object.fromEntries(clubs.map((c) => [c.id, c.owner]));
}

/** Zero-sum is the invariant the real game halts on. It must hold here too. */
export function sumsToZero(rows: AltStanding[]): boolean {
  return rows.reduce((s, r) => s + r.net, 0) === 0;
}
