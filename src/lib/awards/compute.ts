// Awards (live, never hand-entered — §12) + settlement (§/settle).
export interface LedgerRow {
  to_player_id: string; from_player_id: string; amount_inr: number; event_type: 'MATCH' | 'TROPHY' | 'CORRECTION';
}
export interface WldRow { player_id: string; outcome: 'W' | 'L' | 'D'; occurred_at: string }

export interface Awards {
  mostWins: string | null; mostLosses: string | null; mostDraws: string | null;
  longestWinStreak: { player: string | null; n: number };
  longestLosingStreak: { player: string | null; n: number };
  highestMatchEarnings: string | null; highestTrophyEarnings: string | null;
  highestOverallEarnings: string | null; mostMoneyLost: string | null;
  mostSuccessfulPlayer: string | null;
}

function net(rows: LedgerRow[], p: string, filter?: (r: LedgerRow) => boolean): number {
  return rows.filter((r) => !filter || filter(r)).reduce(
    (s, r) => s + (r.to_player_id === p ? r.amount_inr : 0) - (r.from_player_id === p ? r.amount_inr : 0), 0);
}
function gross(rows: LedgerRow[], p: string, dir: 'in' | 'out'): number {
  return rows.reduce((s, r) => s + (dir === 'in' && r.to_player_id === p ? r.amount_inr : dir === 'out' && r.from_player_id === p ? r.amount_inr : 0), 0);
}

export function computeAwards(players: string[], ledger: LedgerRow[], wld: WldRow[]): Awards {
  const wins = (p: string) => wld.filter((r) => r.player_id === p && r.outcome === 'W').length;
  const losses = (p: string) => wld.filter((r) => r.player_id === p && r.outcome === 'L').length;
  const draws = (p: string) => wld.filter((r) => r.player_id === p && r.outcome === 'D').length;
  const maxBy = (f: (p: string) => number) =>
    players.reduce<string | null>((best, p) => (best == null || f(p) > f(best) ? p : best), null);

  const streak = (p: string, want: 'W' | 'L'): number => {
    const seq = [...wld].filter((r) => r.player_id === p).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    let best = 0, cur = 0;
    for (const r of seq) { cur = r.outcome === want ? cur + 1 : 0; best = Math.max(best, cur); }
    return best;
  };

  return {
    mostWins: maxBy(wins), mostLosses: maxBy(losses), mostDraws: maxBy(draws),
    longestWinStreak: { player: maxBy((p) => streak(p, 'W')), n: Math.max(0, ...players.map((p) => streak(p, 'W'))) },
    longestLosingStreak: { player: maxBy((p) => streak(p, 'L')), n: Math.max(0, ...players.map((p) => streak(p, 'L'))) },
    highestMatchEarnings: maxBy((p) => net(ledger, p, (r) => r.event_type === 'MATCH')),
    highestTrophyEarnings: maxBy((p) => net(ledger, p, (r) => r.event_type === 'TROPHY')),
    highestOverallEarnings: maxBy((p) => gross(ledger, p, 'in')),
    mostMoneyLost: maxBy((p) => gross(ledger, p, 'out')),
    mostSuccessfulPlayer: maxBy((p) => net(ledger, p)),
  };
}

/** Minimum-transaction settlement — greedy largest-creditor/largest-debtor (n=4, §/settle). */
export function settle(balances: Record<string, number>): { from: string; to: string; amount: number }[] {
  const debtors = Object.entries(balances).filter(([, v]) => v < 0).map(([k, v]) => ({ p: k, amt: -v })).sort((a, b) => b.amt - a.amt);
  const creditors = Object.entries(balances).filter(([, v]) => v > 0).map(([k, v]) => ({ p: k, amt: v })).sort((a, b) => b.amt - a.amt);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const amt = Math.min(d.amt, c.amt);
    out.push({ from: d.p, to: c.p, amount: amt });
    d.amt -= amt; c.amt -= amt;
    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }
  return out;
}
