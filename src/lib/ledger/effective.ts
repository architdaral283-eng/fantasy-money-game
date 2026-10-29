// What actually changed hands, per fixture.
//
// The ledger is append-only, so a corrected result keeps all of its history:
// the original, a reversal, the correction, and — when a correction was
// applied twice — reversals of the duplicates. Bayern v Dortmund holds SEVEN
// rows for one ₹500 result. Balances are right because the rows net out.
//
// Anything that sums amounts, picks the biggest single row, or counts results
// must net per fixture first, or it reports correction noise as money that
// moved. Before this existed, the Sunday roundup would have announced Anmol v
// Harshal as the hottest rivalry at ₹3,500 — seven times the real figure.

export interface LedgerLike {
  id?: number;
  fixture_id?: string | null;
  from_player_id: string;
  to_player_id: string;
  amount_inr: number;
  created_at?: string;
  description?: string;
  event_type?: string | null;
}

export interface Transfer {
  fixture_id: string | null;
  from_player_id: string;
  to_player_id: string;
  amount_inr: number;
  /**
   * When the result was FIRST recorded. A correction made later must not make
   * an old result look like this week's news.
   */
  created_at: string;
  /** The wording of the row that stands, not of the one that was undone. */
  description: string;
  event_type: string | null;
}

const at = (r: LedgerLike) => Date.parse(r.created_at ?? '') || 0;

export function effectiveTransfers(rows: LedgerLike[]): Transfer[] {
  const out: Transfer[] = [];
  const byFixture = new Map<string, LedgerLike[]>();

  for (const r of rows) {
    if (!r.fixture_id) {
      // Trophies and anything else not tied to a fixture: never corrected
      // through the fixture path, so they pass through as they are.
      out.push({
        fixture_id: null,
        from_player_id: r.from_player_id,
        to_player_id: r.to_player_id,
        amount_inr: Number(r.amount_inr) || 0,
        created_at: r.created_at ?? '',
        description: r.description ?? '',
        event_type: r.event_type ?? null,
      });
      continue;
    }
    const list = byFixture.get(r.fixture_id) ?? [];
    list.push(r);
    byFixture.set(r.fixture_id, list);
  }

  for (const [fixtureId, unsorted] of byFixture) {
    // Insertion order: ids when present, otherwise time.
    const rs = [...unsorted].sort((a, b) =>
      (a.id !== undefined && b.id !== undefined ? a.id - b.id : 0) || at(a) - at(b));

    const net = new Map<string, number>();
    for (const r of rs) {
      const amt = Number(r.amount_inr) || 0;
      net.set(r.to_player_id, (net.get(r.to_player_id) ?? 0) + amt);
      net.set(r.from_player_id, (net.get(r.from_player_id) ?? 0) - amt);
    }
    const ranked = [...net.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [winner, gain] = ranked[0];
    const [loser, loss] = ranked[ranked.length - 1];
    // Fully reversed — a result struck off — moved nothing.
    if (!(gain > 0) || !(loss < 0)) continue;

    const standing = [...rs].reverse().find((r) => !/^REVERSAL/i.test(r.description ?? '')) ?? rs[rs.length - 1];
    out.push({
      fixture_id: fixtureId,
      from_player_id: loser,
      to_player_id: winner,
      amount_inr: Math.min(gain, -loss),
      created_at: rs[0].created_at ?? '',
      description: (standing.description ?? '').replace(/^CORRECTION:\s*/i, ''),
      event_type: rs[0].event_type ?? null,
    });
  }
  return out;
}

/** Fixture id -> what actually changed hands on it. */
export function amountByFixture(rows: LedgerLike[]): Map<string, number> {
  return new Map(
    effectiveTransfers(rows)
      .filter((t): t is Transfer & { fixture_id: string } => t.fixture_id !== null)
      .map((t) => [t.fixture_id, t.amount_inr]),
  );
}

export interface DescribeFixture { id: string; home_club_id: string; away_club_id: string }
export interface DescribeResult { fixture_id: string; h90: number; a90: number; h120?: number | null; a120?: number | null }

/**
 * "Bayern 2–1 Dortmund" — club names and the final score, which is what a
 * person wants to read. The ledger's own descriptions are raw slugs written
 * for the audit trail ("barcelona v real-madrid (LA_LIGA)").
 */
export function describeFixture(
  fixtureId: string,
  fixtures: DescribeFixture[],
  results: DescribeResult[],
  clubName: (id: string) => string,
): string | null {
  const f = fixtures.find((x) => x.id === fixtureId);
  if (!f) return null;
  const r = results.find((x) => x.fixture_id === fixtureId);
  if (!r) return `${clubName(f.home_club_id)} v ${clubName(f.away_club_id)}`;
  const h = r.h120 ?? r.h90;
  const a = r.a120 ?? r.a90;
  return `${clubName(f.home_club_id)} ${h}–${a} ${clubName(f.away_club_id)}`;
}
