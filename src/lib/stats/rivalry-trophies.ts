// Head-to-head trophies. Six small rivalries instead of one table, each held
// by whoever currently leads it and lost the moment the other man goes ahead.

import { h2hTally, type H2HFixture, type H2HWld } from '@/lib/stats/h2h';

export interface RivalryTrophy {
  a: string;
  b: string;
  aWins: number;
  bWins: number;
  draws: number;
  games: number;
  /** Whoever leads. Null when level, or when they have never played. */
  holder: string | null;
}

/** Every unordered pairing, in a stable order. */
export function pairings(players: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  const sorted = [...players].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) out.push([sorted[i], sorted[j]]);
  }
  return out;
}

export function rivalryTrophies(
  players: readonly string[],
  fixtures: H2HFixture[],
  ownerOf: (clubId: string) => string | undefined,
  wld: H2HWld[],
): RivalryTrophy[] {
  return pairings(players).map(([a, b]) => {
    const t = h2hTally(a, b, fixtures, ownerOf, wld);
    return {
      a, b,
      aWins: t.aWins, bWins: t.bWins, draws: t.draws, games: t.games,
      // Level is vacant, not shared. A trophy two people hold is a table.
      holder: t.aWins > t.bWins ? a : t.bWins > t.aWins ? b : null,
    };
  });
}

/** How many of the six one player currently holds. */
export function heldBy(rows: RivalryTrophy[], player: string): RivalryTrophy[] {
  return rows.filter((r) => r.holder === player);
}
