// Stakes, projections, social facts — pure arithmetic over ledger state.
// No predictions, no API calls, no LLM. Everything states "if", never "likely".

export interface TrophyLive { code: string; name: string; winnerPrize: number; eachOtherPays: number }
export interface WldEvent { player: string; outcome: 'W' | 'L' | 'D'; at: string }

/** Rupees in play across a set of counted fixtures (base rate; thrashing doubles). */
export function stakesFor(n: number): { base: number; ifBig: number } {
  return { base: n * 500, ifBig: n * 1000 };
}

/** Biggest single swing left: max trophy swing vs max fixture swing (₹2,000). */
export function biggestSwing(trophies: TrophyLive[]): { label: string; swing: number } {
  let best = { label: 'a thrashing (₹1,000 each way)', swing: 2000 };
  for (const t of trophies) {
    const swing = t.winnerPrize + t.eachOtherPays;
    if (swing > best.swing) best = { label: `${t.name} trophy`, swing };
  }
  return best;
}

/** Ceiling/floor for a player. maxFixtureWin = 1000 (thrashing possible). */
export function ceilingFloor(net: number, nFixtures: number, winnable: number[], losableCosts: number[]): { best: number; worst: number } {
  const best = net + nFixtures * 1000 + winnable.reduce((s, v) => s + v, 0);
  const worst = net - nFixtures * 1000 - losableCosts.reduce((s, v) => s + v, 0);
  return { best, worst };
}

export function inr(n: number): string {
  return `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

/** Current form: last-5 string per player, e.g. "WWLWD". */
export function formString(events: WldEvent[], player: string, n = 5): string {
  return events
    .filter((e) => e.player === player)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, n)
    .map((e) => e.outcome)
    .join('') || '—';
}

/** Longest active losing streak for a player (most recent run of L). */
export function activeLosingStreak(events: WldEvent[], player: string): number {
  const seq = events.filter((e) => e.player === player).sort((a, b) => b.at.localeCompare(a.at));
  let n = 0;
  for (const e of seq) {
    if (e.outcome !== 'L') break;
    n++;
  }
  return n;
}

export interface TauntFacts {
  grossLost: number; streak: number; biggestSingleLoss: number; last7: { w: number; l: number };
}

/** Harshest true fact, stated flat. Deterministic template pick — never invented. */
export function pickTaunt(name: string, f: TauntFacts, sinceText: string): string {
  if (f.streak >= 3) return `${name} has lost ${f.streak} counted fixtures in a row.`;
  if (f.last7.l >= 5) return `${name} has lost ${f.last7.l} of their last 7 counted fixtures.`;
  if (f.grossLost >= 4000) return `${name} is ₹${f.grossLost.toLocaleString('en-IN')} down${sinceText}.`;
  if (f.biggestSingleLoss >= 2000) return `${name} once paid ₹${f.biggestSingleLoss.toLocaleString('en-IN')} on a single night.`;
  if (f.grossLost > 0) return `${name} is ₹${f.grossLost.toLocaleString('en-IN')} down${sinceText}.`;
  return `${name} has nothing to be taunted for. Yet.`;
}
