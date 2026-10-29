// The Sunday roundup's arithmetic. Pure: rows in, facts out.
//
// Eight of the backlog's features live in one weekly message rather than eight
// separate ones, because the group ceiling is six messages a day and a
// scattered drip reads as noise. Everything here is computed from the ledger
// and wld_records — no provider, no new failure mode.

export interface WldRow { player_id: string; outcome: 'W' | 'L' | 'D'; occurred_at: string; fixture_id: string | null }
export interface LedgerRow { from_player_id: string; to_player_id: string; amount_inr: number; created_at: string; fixture_id?: string | null; description: string }
export interface ResultRow { fixture_id: string; h90: number; a90: number }
export interface FixtureRow { id: string; home_club_id: string; away_club_id: string; status: string; kickoff_utc: string | null; is_same_owner: boolean }

export const PLAYERS = ['archit', 'vedant', 'harshal', 'anmol'] as const;

// ——————————————————————————— form ———————————————————————————

export interface FormRow { player: string; form: string; points: number; w: number; l: number; d: number }

/**
 * The last `n` counted results per player, newest first, and a score for
 * ordering (win 3, draw 1). Usually a different leader to the money table,
 * which is the entire point of showing it.
 */
export function formTable(wld: WldRow[], n = 5): FormRow[] {
  const rows = PLAYERS.map((player) => {
    const mine = wld
      .filter((w) => w.player_id === player)
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .slice(0, n);
    const count = (o: string) => mine.filter((m) => m.outcome === o).length;
    return {
      player,
      form: mine.map((m) => m.outcome).join('') || '—',
      points: count('W') * 3 + count('D'),
      w: count('W'), l: count('L'), d: count('D'),
    };
  });
  return rows.sort((a, b) => b.points - a.points || b.w - a.w);
}

// ——————————————————————————— rivalry heat ———————————————————————————

export interface Rivalry { a: string; b: string; moved: number; net: number; leader: string | null }

/**
 * Which pairing has moved the most money all season, and who is ahead on it.
 * `net` is always stated from `a`'s point of view; `leader` is the one in front.
 */
export function rivalries(ledger: LedgerRow[]): Rivalry[] {
  const key = (x: string, y: string) => [x, y].sort().join('|');
  const acc = new Map<string, { moved: number; net: number }>();
  for (const e of ledger) {
    if (e.from_player_id === e.to_player_id) continue;
    const k = key(e.from_player_id, e.to_player_id);
    const [a] = k.split('|');
    const cur = acc.get(k) ?? { moved: 0, net: 0 };
    cur.moved += e.amount_inr;
    cur.net += e.to_player_id === a ? e.amount_inr : -e.amount_inr;
    acc.set(k, cur);
  }
  return [...acc.entries()]
    .map(([k, v]) => {
      const [a, b] = k.split('|');
      return { a, b, moved: v.moved, net: v.net, leader: v.net === 0 ? null : v.net > 0 ? a : b };
    })
    .sort((x, y) => y.moved - x.moved);
}

// ——————————————————————————— the unlucky table ———————————————————————————

export interface Unlucky { player: string; narrow: number; heavy: number }

/**
 * Defeats by a single goal, per player. Lets the bottom half claim they are
 * unlucky with numbers to back it, which is its own kind of fun.
 */
export function unluckyTable(
  fixtures: FixtureRow[],
  results: ResultRow[],
  ownerOf: (clubId: string) => string | undefined,
): Unlucky[] {
  const byFixture = new Map(results.map((r) => [r.fixture_id, r]));
  const acc = new Map<string, Unlucky>(PLAYERS.map((p) => [p, { player: p, narrow: 0, heavy: 0 }]));
  for (const f of fixtures) {
    if (f.status !== 'RECORDED' || f.is_same_owner) continue;
    const r = byFixture.get(f.id);
    if (!r || r.h90 === r.a90) continue;
    const loser = ownerOf(r.h90 > r.a90 ? f.away_club_id : f.home_club_id);
    if (!loser) continue;
    const row = acc.get(loser);
    if (!row) continue;
    if (Math.abs(r.h90 - r.a90) === 1) row.narrow++; else row.heavy++;
  }
  return [...acc.values()].sort((a, b) => b.narrow - a.narrow);
}

// ——————————————————————————— who is exposed ———————————————————————————

export interface Exposure { player: string; fixtures: number; atRisk: number }

/** Counted fixtures each player has in the next `days`. A quiet week for one
 *  of them is worth everyone else seeing. */
export function exposedThisWeek(
  fixtures: FixtureRow[],
  ownerOf: (clubId: string) => string | undefined,
  nowMs: number,
  days = 7,
): Exposure[] {
  const until = nowMs + days * 864e5;
  const acc = new Map<string, number>(PLAYERS.map((p) => [p, 0]));
  for (const f of fixtures) {
    if (f.status !== 'SCHEDULED' || f.is_same_owner || !f.kickoff_utc) continue;
    const at = Date.parse(f.kickoff_utc);
    if (!(at > nowMs && at <= until)) continue;
    for (const owner of [ownerOf(f.home_club_id), ownerOf(f.away_club_id)]) {
      if (owner && acc.has(owner)) acc.set(owner, (acc.get(owner) ?? 0) + 1);
    }
  }
  return [...acc.entries()]
    .map(([player, fixtures2]) => ({ player, fixtures: fixtures2, atRisk: fixtures2 * 1000 }))
    .sort((a, b) => b.fixtures - a.fixtures);
}

// ——————————————————————————— moment of the week ———————————————————————————

export interface Moment { description: string; amount: number; from: string; to: string; fixtureId: string | null }

/** The single biggest transfer of the week. */
export function momentOfWeek(ledger: LedgerRow[], sinceMs: number): Moment | null {
  const week = ledger.filter((e) => Date.parse(e.created_at) >= sinceMs);
  if (!week.length) return null;
  const top = week.reduce((best, e) => (e.amount_inr > best.amount_inr ? e : best), week[0]);
  return {
    description: top.description, amount: top.amount_inr,
    from: top.from_player_id, to: top.to_player_id,
    fixtureId: top.fixture_id ?? null,
  };
}

// ——————————————————————————— title race maths ———————————————————————————

/**
 * How many wins the chaser needs to catch the leader, if the leader stalls.
 * Arithmetic, not prediction: every counted win swings ₹500 at minimum, so the
 * gap closes ₹1,000 a time only when the leader also loses that fixture.
 */
export function winsToCatch(gapInr: number, perWin = 500): number {
  return gapInr <= 0 ? 0 : Math.ceil(gapInr / perWin);
}

// ——————————————————————————— running titles ———————————————————————————

/**
 * A title per player from current form and position. Recalculated weekly,
 * used wherever a name appears, impossible to escape.
 */
export function runningTitle(opts: { rank: number; of: number; net: number; form: string }): string {
  const { rank, of, net, form } = opts;
  const last3 = form.slice(0, 3);
  if (rank === 1 && /^W{3}/.test(last3)) return 'Unbeaten And Unbearable';
  if (rank === 1) return 'The Landlord';
  if (rank === of && /L{3}/.test(last3)) return 'The Donor';
  if (rank === of) return 'The Cautionary Tale';
  if (/L{3}/.test(last3)) return 'In Freefall';
  if (/^W{3}/.test(last3)) return 'On A Heater';
  if (net === 0) return 'Break Even And Boring';
  return net > 0 ? 'Quietly Up' : 'Quietly Down';
}

// ——————————————————————————— season landmarks ———————————————————————————

export const SEASON_START = '2026-08-21T00:00:00Z';
export const SEASON_END = '2027-05-31T00:00:00Z';

/**
 * A landmark worth marking today, or null.
 *
 * These are checked on a WINDOW, not an exact day, because the only thing
 * that reads them runs once a week. Day 200 of the season is a Tuesday and
 * `days === 200` would never have been true on a Sunday — the landmark could
 * not fire, ever, and nothing would have said so. Same for every countdown
 * mark and for halfway, which `=== ` could not catch either because 63 paying
 * fixtures never divide exactly in two.
 *
 * Each window is seven days wide and they do not overlap, so a landmark fires
 * on the first roundup at or past it and exactly once.
 */
export function landmark(
  nowMs: number,
  playedPaying: number,
  totalPaying: number,
  playedAWeekAgo: number = playedPaying,
): string | null {
  const days = Math.floor((nowMs - Date.parse(SEASON_START)) / 864e5);
  const reached = (mark: number) => days >= mark && days < mark + 7;
  if (reached(100)) return 'One hundred days of this.';
  if (reached(200)) return 'Two hundred days. Nobody has learned anything.';

  const left = Math.ceil((Date.parse(SEASON_END) - nowMs) / 864e5);
  const under = (mark: number) => left <= mark && left > mark - 7;
  if (under(7)) return 'Final week.';
  if (under(30)) return 'One month left.';
  if (under(100)) return 'A hundred days left to fix it.';

  // Halfway is crossed, not landed on: true now and not true last week.
  if (totalPaying > 0 && playedPaying * 2 >= totalPaying && playedAWeekAgo * 2 < totalPaying) {
    return 'Halfway. Everything so far, again, in reverse.';
  }
  return null;
}
