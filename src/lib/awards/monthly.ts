// Owner, Club and Flop of the Month. Pure arithmetic over the ledger, which
// is the only record that cannot be argued with.

import { effectiveTransfers, type LedgerLike } from '@/lib/ledger/effective';

export type MonthLedgerRow = LedgerLike;
export interface MonthFixture { id: string; home_club_id: string; away_club_id: string }

export interface Standout { id: string; amount: number }
export interface MonthlyAwards {
  /** Best and worst net swing over the month. */
  owner: Standout | null;
  flop: Standout | null;
  /** Club that earned its owner the most, and the one that cost the most. */
  club: Standout | null;
  worstClub: Standout | null;
  biggest: { description: string; amount: number; from: string; to: string; fixtureId: string | null } | null;
  moved: number;
  results: number;
}

function inWindow(iso: string, fromMs: number, toMs: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= fromMs && t < toMs;
}

export function monthlyAwards(
  players: readonly string[],
  ledger: MonthLedgerRow[],
  fixtures: MonthFixture[],
  ownerOf: (clubId: string) => string | undefined,
  fromMs: number,
  toMs: number,
): MonthlyAwards {
  // Netted per fixture first. Raw rows count every reversal and duplicate
  // correction as money that moved — eight of the season's first 24 rows were
  // corrections.
  const rows = effectiveTransfers(ledger).filter((r) => inWindow(r.created_at, fromMs, toMs));
  if (!rows.length) {
    return { owner: null, flop: null, club: null, worstClub: null, biggest: null, moved: 0, results: 0 };
  }

  const net = new Map<string, number>(players.map((p) => [p, 0]));
  for (const r of rows) {
    net.set(r.to_player_id, (net.get(r.to_player_id) ?? 0) + r.amount_inr);
    net.set(r.from_player_id, (net.get(r.from_player_id) ?? 0) - r.amount_inr);
  }
  const ranked = [...net.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  // Club attribution: the club in the fixture owned by whoever was PAID. Not
  // the 90-minute score, which is level for every tie settled in extra time or
  // on penalties and would credit nobody — and not the description, which is
  // an audit string.
  const fmap = new Map(fixtures.map((f) => [f.id, f]));
  const byClub = new Map<string, number>();
  let resultCount = 0;
  for (const r of rows) {
    if (!r.fixture_id) continue;
    const f = fmap.get(r.fixture_id);
    if (!f) continue;
    resultCount++;
    const sides = [f.home_club_id, f.away_club_id];
    const won = sides.find((c) => ownerOf(c) === r.to_player_id);
    const lost = sides.find((c) => ownerOf(c) === r.from_player_id);
    if (!won || !lost || won === lost) continue;
    byClub.set(won, (byClub.get(won) ?? 0) + r.amount_inr);
    byClub.set(lost, (byClub.get(lost) ?? 0) - r.amount_inr);
  }
  const clubs = [...byClub.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const biggestRow = [...rows].sort((a, b) =>
    b.amount_inr - a.amount_inr || a.created_at.localeCompare(b.created_at))[0];

  return {
    owner: ranked.length && ranked[0][1] > 0 ? { id: ranked[0][0], amount: ranked[0][1] } : null,
    flop: ranked.length && ranked[ranked.length - 1][1] < 0
      ? { id: ranked[ranked.length - 1][0], amount: ranked[ranked.length - 1][1] } : null,
    club: clubs.length && clubs[0][1] > 0 ? { id: clubs[0][0], amount: clubs[0][1] } : null,
    worstClub: clubs.length && clubs[clubs.length - 1][1] < 0
      ? { id: clubs[clubs.length - 1][0], amount: clubs[clubs.length - 1][1] } : null,
    biggest: biggestRow ? {
      description: biggestRow.description,
      amount: biggestRow.amount_inr,
      from: biggestRow.from_player_id,
      to: biggestRow.to_player_id,
      fixtureId: biggestRow.fixture_id,
    } : null,
    moved: rows.reduce((s, r) => s + r.amount_inr, 0),
    results: resultCount,
  };
}

const IST_OFFSET = 5.5 * 3600 * 1000;

/**
 * The IST month before the one containing `ms`, as UTC instants.
 *
 * IST, not UTC: kickoffs are 17:00 IST and later, so a match on the last
 * night of the month lands in the previous UTC day and would be counted
 * against the wrong month. Every other boundary in this codebase — quiet
 * hours, the matchday brief, the day key — is IST, and this is no exception.
 */
export function monthBounds(ms: number): { from: number; to: number; label: string } {
  const ist = new Date(ms + IST_OFFSET);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const thisMonth = new Date(Date.UTC(y, m, 1));
  const prevMonth = new Date(Date.UTC(y, m, 1));
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  return {
    from: prevMonth.getTime() - IST_OFFSET,
    to: thisMonth.getTime() - IST_OFFSET,
    label: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(prevMonth),
  };
}
