// Seed generation — §4.3 + §4.4 + §4.5.
// Generates the 48 league fixtures from ownership (never hand-entered),
// holds the 21 hand-entered UCL ties, and asserts the derived totals.
// Boot MUST fail if these do not reconcile.

import { CLUBS, UCL_LEAGUE_PHASE_TIES, clubById, ownerOf } from '@/lib/domain/constants';

export interface GeneratedFixture {
  competition: string;
  home: string;
  away: string;
  homeOwner: string;
  awayOwner: string;
  sameOwner: boolean;
}

/** 4 leagues × all ordered pairs of the 4 owned clubs = 48. */
export function generateLeagueFixtures(): GeneratedFixture[] {
  const leagues = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A'];
  const out: GeneratedFixture[] = [];
  for (const league of leagues) {
    const clubs = CLUBS.filter((c) => c.league === league).map((c) => c.id);
    if (clubs.length !== 4) throw new Error(`Expected 4 owned clubs in ${league}`);
    for (const home of clubs) {
      for (const away of clubs) {
        if (home === away) continue;
        out.push({
          competition: league,
          home,
          away,
          homeOwner: ownerOf(home),
          awayOwner: ownerOf(away),
          sameOwner: ownerOf(home) === ownerOf(away),
        });
      }
    }
  }
  return out;
}

export function uclFixtures(): GeneratedFixture[] {
  return UCL_LEAGUE_PHASE_TIES.map((t) => {
    const h = clubById.get(t.home);
    const a = clubById.get(t.away);
    if (!h || !a) throw new Error(`Unknown UCL tie club: ${t.home} v ${t.away}`);
    return {
      competition: 'UEFA Champions League',
      home: t.home,
      away: t.away,
      homeOwner: h.owner,
      awayOwner: a.owner,
      sameOwner: h.owner === a.owner,
    };
  });
}

/** Counted UCL fixtures per player (§4.5): ties excluding same-owner ₹0 ties. */
export function countedUclPerPlayer(): Record<string, number> {
  const counts: Record<string, number> = { archit: 0, vedant: 0, harshal: 0, anmol: 0 };
  for (const f of uclFixtures()) {
    if (f.sameOwner) continue; // ₹0, not counted, no W/L/D (§3.7)
    counts[f.homeOwner] += 1;
    // avoid double-count when... (never same here since sameOwner skipped)
    counts[f.awayOwner] += 1;
  }
  // each non-same-owner tie involves two players; per-player total is
  // appearances across ties. Distinct ties per player:
  // re-count distinctly: a player in N ties counts N.
  const distinct: Record<string, number> = { archit: 0, vedant: 0, harshal: 0, anmol: 0 };
  for (const f of uclFixtures()) {
    if (f.sameOwner) continue;
    const involved = new Set([f.homeOwner, f.awayOwner]);
    for (const p of involved) distinct[p] += 1;
  }
  return distinct;
}

export interface BootCheck {
  leagueCount: number;
  uclCount: number;
  totalLogged: number;
  sameOwnerCount: number;
  payingCount: number;
  uclPerPlayer: Record<string, number>;
  architUclClubs: number;
  ok: boolean;
  errors: string[];
}

export function bootCheck(): BootCheck {
  const errors: string[] = [];
  const league = generateLeagueFixtures();
  const ucl = uclFixtures();
  const sameOwner = ucl.filter((f) => f.sameOwner).length;
  const total = league.length + ucl.length;
  const paying = total - sameOwner;
  const per = countedUclPerPlayer();
  const architUclClubs = CLUBS.filter((c) => c.owner === 'archit' && c.inUcl).length;

  if (league.length !== 48) errors.push(`league fixtures: got ${league.length}, want 48`);
  if (ucl.length !== 21) errors.push(`ucl ties: got ${ucl.length}, want 21`);
  if (total !== 69) errors.push(`logged total: got ${total}, want 69`);
  if (sameOwner !== 6) errors.push(`same-owner: got ${sameOwner}, want 6`);
  if (paying !== 63) errors.push(`paying: got ${paying}, want 63`);
  // §4.5: Harshal 10, Vedant 9, Archit 7, Anmol 4
  const want: Record<string, number> = { harshal: 10, vedant: 9, archit: 7, anmol: 4 };
  for (const [p, w] of Object.entries(want)) {
    if (per[p] !== w) errors.push(`UCL count ${p}: got ${per[p]}, want ${w}`);
  }
  if (architUclClubs !== 2) errors.push(`Archit UCL clubs: got ${architUclClubs}, want 2`);
  // every other player has 4
  for (const p of ['vedant', 'harshal', 'anmol']) {
    const n = CLUBS.filter((c) => c.owner === p && c.inUcl).length;
    if (n !== 4) errors.push(`${p} UCL clubs: got ${n}, want 4`);
  }
  // 6 rivalries × 8 league fixtures
  const pairs = ['archit|vedant', 'archit|harshal', 'archit|anmol', 'vedant|harshal', 'vedant|anmol', 'harshal|anmol'];
  for (const pair of pairs) {
    const [a, b] = pair.split('|');
    const n = league.filter(
      (f) =>
        (f.homeOwner === a && f.awayOwner === b) || (f.homeOwner === b && f.awayOwner === a),
    ).length;
    if (n !== 8) errors.push(`rivalry ${a} v ${b}: got ${n} league fixtures, want 8`);
  }

  return {
    leagueCount: league.length, uclCount: ucl.length,
    totalLogged: total, sameOwnerCount: sameOwner, payingCount: paying,
    uclPerPlayer: per, architUclClubs, ok: errors.length === 0, errors,
  };
}
