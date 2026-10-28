// The club form side-table: a second leaderboard, for whoever is losing the
// first one. It measures the clubs you drafted rather than the money they
// won you, so the two tables disagree often — which is the point.

import type { ClubStanding } from '@/lib/providers/espn-standings';

export interface OwnerForm {
  player: string;
  clubs: number;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  diff: number;
  points: number;
}

export function ownerForm(
  standings: ClubStanding[],
  ownerOf: (clubId: string) => string | undefined,
  players: readonly string[],
): OwnerForm[] {
  const acc = new Map<string, OwnerForm>(
    players.map((p) => [p, { player: p, clubs: 0, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, diff: 0, points: 0 }]),
  );
  for (const s of standings) {
    const owner = ownerOf(s.clubId);
    if (!owner) continue;
    const cur = acc.get(owner) ?? { player: owner, clubs: 0, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, diff: 0, points: 0 };
    cur.clubs++;
    cur.played += s.played;
    cur.w += s.w; cur.d += s.d; cur.l += s.l;
    cur.gf += s.gf; cur.ga += s.ga;
    cur.points += s.points;
    cur.diff = cur.gf - cur.ga;
    acc.set(owner, cur);
  }
  // Points, then goal difference, then goals scored — the order every league
  // table in the four countries this game follows actually uses.
  return [...acc.values()].sort((a, b) =>
    b.points - a.points || b.diff - a.diff || b.gf - a.gf || a.player.localeCompare(b.player));
}

/** Best and worst single club by goal difference. Null when nothing is known. */
export function bestAndWorstClub(standings: ClubStanding[]): {
  best: ClubStanding | null; worst: ClubStanding | null;
} {
  const played = standings.filter((s) => s.played > 0);
  if (!played.length) return { best: null, worst: null };
  const byDiff = [...played].sort((a, b) => b.diff - a.diff || a.clubId.localeCompare(b.clubId));
  return { best: byDiff[0], worst: byDiff[byDiff.length - 1] };
}
