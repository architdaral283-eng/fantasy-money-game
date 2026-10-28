// The prediction league. No money: the point is that all four have something
// riding on every match, not just the two who drafted the clubs.
//
// Poll option indices are fixed by how the poll is built: 0 home, 1 draw,
// 2 away. They are stored as given, so the meaning must never be reordered.

export type Outcome = 'H' | 'D' | 'A';

export const HOME = 0;
export const DRAW = 1;
export const AWAY = 2;

/** Points for calling it right. Flat for now; feature 39 doubles it on a banker. */
export const POINTS_CORRECT = 1;

export function outcomeOf(h: number, a: number): Outcome {
  return h > a ? 'H' : a > h ? 'A' : 'D';
}

export function choiceToOutcome(choice: number): Outcome | null {
  return choice === HOME ? 'H' : choice === DRAW ? 'D' : choice === AWAY ? 'A' : null;
}

export interface Vote { player_id: string; choice: number; answered_at: string }
export interface Scored { player: string; choice: number; correct: boolean; points: number }

/**
 * Settle one poll.
 *
 * Votes cast at or after kickoff do not count. The poll is normally stopped
 * 30 minutes before kickoff, but a missed poller tick would otherwise leave it
 * open through the match — and a vote in the 89th minute is not a prediction.
 */
export function scorePoll(votes: Vote[], actual: Outcome, kickoffMs: number): Scored[] {
  const out: Scored[] = [];
  for (const v of votes) {
    const at = Date.parse(v.answered_at);
    if (Number.isFinite(at) && Number.isFinite(kickoffMs) && at >= kickoffMs) continue;
    const called = choiceToOutcome(v.choice);
    if (called === null) continue;
    const correct = called === actual;
    out.push({ player: v.player_id, choice: v.choice, correct, points: correct ? POINTS_CORRECT : 0 });
  }
  return out;
}

export interface ScoreRow { player_id: string; points: number; correct: boolean; scored_at: string }
export interface LeaderRow { player: string; played: number; hits: number; points: number; pct: number }

/** The table. Played is how many polls they actually answered, not how many ran. */
export function leaderboard(rows: ScoreRow[], players: readonly string[], sinceMs = 0): LeaderRow[] {
  const acc = new Map<string, LeaderRow>(
    players.map((p) => [p, { player: p, played: 0, hits: 0, points: 0, pct: 0 }]),
  );
  for (const r of rows) {
    const at = Date.parse(r.scored_at);
    if (Number.isFinite(at) && at < sinceMs) continue;
    const cur = acc.get(r.player_id) ?? { player: r.player_id, played: 0, hits: 0, points: 0, pct: 0 };
    cur.played++;
    if (r.correct) cur.hits++;
    cur.points += Number(r.points) || 0;
    acc.set(r.player_id, cur);
  }
  const out = [...acc.values()];
  for (const r of out) r.pct = r.played ? Math.round((r.hits / r.played) * 100) : 0;
  // Points, then strike rate, then name — so the order never depends on
  // whatever order the rows came back in.
  return out.sort((a, b) => b.points - a.points || b.pct - a.pct || a.player.localeCompare(b.player));
}

/** How many times this player has called one wrong since `sinceMs`. */
export function missesSince(rows: ScoreRow[], player: string, sinceMs: number): number {
  return rows.filter((r) => r.player_id === player && !r.correct && Date.parse(r.scored_at) >= sinceMs).length;
}

/** 'Fourth time this month.' Reads better than '4 times'. */
export function nthTime(n: number): string {
  const words = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  return n > 0 && n < words.length ? words[n] : `${n}th`;
}
