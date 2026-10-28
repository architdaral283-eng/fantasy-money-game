// Achievements. Automatic, derived, never awarded by hand — and the
// embarrassing ones are the point. A badge nobody minds holding is decoration.

export interface BadgeWld { player_id: string; fixture_id: string | null; outcome: 'W' | 'L' | 'D'; occurred_at: string }
export interface BadgeLedger { from_player_id: string; to_player_id: string; amount_inr: number; created_at: string }
export interface BadgeFixture { id: string; home_club_id: string; away_club_id: string }
export interface BadgeClub { id: string; name: string; owner_id: string; draft_pick: number }

export interface Badge {
  id: string;
  name: string;
  blurb: string;
  earned: boolean;
  detail?: string;
}

const istMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
const istMonthName = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });

interface Played {
  fixtureId: string;
  outcome: 'W' | 'L' | 'D';
  at: string;
  mine: BadgeClub | null;
  theirs: BadgeClub | null;
  opponent: string | null;
}

/** Longest run of one outcome. Returns 0 when it never happened. */
function longestRun(seq: ('W' | 'L' | 'D')[], want: 'W' | 'L'): number {
  let best = 0, cur = 0;
  for (const o of seq) {
    cur = o === want ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

export function badges(opts: {
  player: string;
  wld: BadgeWld[];
  ledger: BadgeLedger[];
  fixtures: BadgeFixture[];
  clubs: BadgeClub[];
  nameOf: (playerId: string) => string;
}): Badge[] {
  const { player, nameOf } = opts;
  const cmap = new Map(opts.clubs.map((c) => [c.id, c]));
  const fmap = new Map(opts.fixtures.map((f) => [f.id, f]));

  // One row per fixture from this player's side, oldest first.
  const played: Played[] = opts.wld
    .filter((w) => w.player_id === player && w.fixture_id)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((w) => {
      const f = fmap.get(w.fixture_id as string);
      const home = f ? cmap.get(f.home_club_id) ?? null : null;
      const away = f ? cmap.get(f.away_club_id) ?? null : null;
      const mine = home?.owner_id === player ? home : away?.owner_id === player ? away : null;
      const theirs = mine && home && away ? (mine.id === home.id ? away : home) : null;
      return {
        fixtureId: w.fixture_id as string,
        outcome: w.outcome,
        at: w.occurred_at,
        mine,
        theirs,
        opponent: theirs && theirs.owner_id !== player ? theirs.owner_id : null,
      };
    });

  const seq = played.map((p) => p.outcome);
  const wins = seq.filter((o) => o === 'W').length;

  // ── Giant Killer ──────────────────────────────────────────────────────────
  // draft_pick is 1-4 within each owner's own four, so this is your last pick
  // beating their first: the club you took because nothing better was left.
  const giant = played.find((p) =>
    p.outcome === 'W' && p.mine && p.theirs && p.theirs.owner_id !== player &&
    p.theirs.draft_pick <= p.mine.draft_pick - 3);

  // ── streaks ───────────────────────────────────────────────────────────────
  const worstRun = longestRun(seq, 'L');
  const bestRun = longestRun(seq, 'W');

  // ── Clean Month ───────────────────────────────────────────────────────────
  const byMonth = new Map<string, Played[]>();
  for (const p of played) {
    const k = istMonth.format(new Date(p.at));
    byMonth.set(k, [...(byMonth.get(k) ?? []), p]);
  }
  const cleanMonth = [...byMonth.entries()]
    .filter(([, rows]) => rows.length >= 2 && rows.every((r) => r.outcome !== 'L'))
    .map(([, rows]) => istMonthName.format(new Date(rows[0].at)))
    .pop();

  // ── single-result money ───────────────────────────────────────────────────
  const biggestIn = opts.ledger.filter((r) => r.to_player_id === player)
    .sort((a, b) => Number(b.amount_inr) - Number(a.amount_inr))[0];
  const biggestOut = opts.ledger.filter((r) => r.from_player_id === player)
    .sort((a, b) => Number(b.amount_inr) - Number(a.amount_inr))[0];

  // ── one-sided rivalries ───────────────────────────────────────────────────
  const beat = new Map<string, number>();
  const beatenBy = new Map<string, number>();
  for (const p of played) {
    if (!p.opponent) continue;
    if (p.outcome === 'W') beat.set(p.opponent, (beat.get(p.opponent) ?? 0) + 1);
    if (p.outcome === 'L') beatenBy.set(p.opponent, (beatenBy.get(p.opponent) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const nemesis = top(beat);
  const doormat = top(beatenBy);

  return [
    {
      id: 'giant-killer', name: 'Giant Killer',
      blurb: 'Beat a club three picks above yours.',
      earned: !!giant,
      detail: giant && giant.mine && giant.theirs
        ? `${giant.mine.name} (pick ${giant.mine.draft_pick}) beat ${giant.theirs.name} (pick ${giant.theirs.draft_pick})`
        : undefined,
    },
    {
      id: 'hat-trick', name: 'Hat-trick',
      blurb: 'Three wins in a row.',
      earned: bestRun >= 3,
      detail: bestRun >= 3 ? `${bestRun} straight` : undefined,
    },
    {
      id: 'clean-month', name: 'Clean Month',
      blurb: 'A calendar month without a single defeat.',
      earned: !!cleanMonth,
      detail: cleanMonth,
    },
    {
      id: 'bank-job', name: 'Bank Job',
      blurb: 'Took ₹1,000 off someone in one result.',
      earned: !!biggestIn && Number(biggestIn.amount_inr) >= 1000,
      detail: biggestIn && Number(biggestIn.amount_inr) >= 1000
        ? `off ${nameOf(biggestIn.from_player_id)}` : undefined,
    },
    {
      id: 'nemesis', name: 'Nemesis',
      blurb: 'Beat the same man three times.',
      earned: !!nemesis && nemesis[1] >= 3,
      detail: nemesis && nemesis[1] >= 3 ? `${nameOf(nemesis[0])}, ${nemesis[1]} times` : undefined,
    },
    // ── the ones you do not want ─────────────────────────────────────────────
    {
      id: 'donor', name: 'Donor',
      blurb: 'Four straight defeats.',
      earned: worstRun >= 4,
      detail: worstRun >= 4 ? `${worstRun} in a row` : undefined,
    },
    {
      id: 'charity', name: 'Charity',
      blurb: 'Handed over ₹1,000 in one result.',
      earned: !!biggestOut && Number(biggestOut.amount_inr) >= 1000,
      detail: biggestOut && Number(biggestOut.amount_inr) >= 1000
        ? `to ${nameOf(biggestOut.to_player_id)}` : undefined,
    },
    {
      id: 'doormat', name: 'Doormat',
      blurb: 'Lost to the same man three times.',
      earned: !!doormat && doormat[1] >= 3,
      detail: doormat && doormat[1] >= 3 ? `${nameOf(doormat[0])}, ${doormat[1]} times` : undefined,
    },
    {
      id: 'spectator', name: 'Spectator',
      blurb: 'Three fixtures in, still no win.',
      earned: played.length >= 3 && wins === 0,
      detail: played.length >= 3 && wins === 0 ? `${played.length} played, 0 won` : undefined,
    },
  ];
}
