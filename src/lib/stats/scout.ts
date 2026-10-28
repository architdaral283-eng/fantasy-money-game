// Where a fixture leaves you. The group reminder says what the match is; this
// says what it does to your position, which is only interesting to the two
// people with money on it. Hence a DM.

export interface Scenario {
  rank: number;
  of: number;
  net: number;
  /** The player immediately below, and the lead over them. */
  aheadOf: string | null;
  gapAhead: number | null;
  /** The player immediately above, and the deficit to them. */
  behind: string | null;
  gapBehind: number | null;
}

/**
 * Standing for `me` after `swing` rupees move from `them` to `me`. A swing of
 * 0 gives the table as it stands.
 */
export function scenario(nets: Record<string, number>, me: string, them: string, swing: number): Scenario {
  const next: Record<string, number> = { ...nets };
  next[me] = (next[me] ?? 0) + swing;
  next[them] = (next[them] ?? 0) - swing;
  // Ties break on name so the order is stable rather than whatever the object
  // iteration happened to give. Two players level is common at ₹500 a result.
  const order = Object.keys(next).sort((a, b) => next[b] - next[a] || a.localeCompare(b));
  const at = order.indexOf(me);
  const above = at > 0 ? order[at - 1] : null;
  const below = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  return {
    rank: at + 1,
    of: order.length,
    net: next[me],
    aheadOf: below,
    gapAhead: below ? next[me] - next[below] : null,
    behind: above,
    gapBehind: above ? next[above] - next[me] : null,
  };
}

/** The three scenarios a fixture has: as it stands, if you win, if you lose. */
export function impact(nets: Record<string, number>, me: string, them: string, stake = 500): {
  now: Scenario; win: Scenario; lose: Scenario;
} {
  return {
    now: scenario(nets, me, them, 0),
    win: scenario(nets, me, them, stake),
    lose: scenario(nets, me, them, -stake),
  };
}
