// Pure scoring engine — §3 of the build spec + Constitution Articles III–VII.
// DEPENDENCY-FREE: no I/O, no DB, no network. Only place money is computed.
// All amounts in integer rupees, multiples of ₹500.

import {
  IN_SCOPE_CODES,
  OUT_OF_SCOPE_CODES,
  COMPETITIONS,
  clubById,
  ownerOf,
  type PlayerId,
} from '@/lib/domain/constants';

export type TerminalStatus = 'FT' | 'AET' | 'PEN' | 'POSTPONED' | 'ABANDONED' | 'AWARDED' | 'CANCELLED';

export interface ScorePair {
  home: number;
  away: number;
}

export interface NormalisedResult {
  competitionCode: string; // e.g. 'EPL', 'UCL', 'FA_CUP'
  round: string; // e.g. 'League', 'League Phase', 'Final', 'Semi-final'
  homeClubId: string;
  awayClubId: string;
  scoreAt90: ScorePair;
  /** score at 120' (cumulative). Null when no extra time. */
  scoreAt120: ScorePair | null;
  /** shootout goals. Null when no shootout. Shootout score NEVER part of margin. */
  shootout: ScorePair | null;
  terminalStatus: TerminalStatus;
  kickoffUtc: string; // ISO
  providerFixtureId?: string;
  provider?: string;
}

export interface Transfer {
  from: PlayerId;
  to: PlayerId;
  amount: number;
  eventType: 'MATCH' | 'TROPHY';
  description: string;
}

export type ProposalKind =
  | 'IGNORED_UNOWNED' // §3.1 — not logged at all
  | 'REJECTED_OUT_OF_SCOPE'
  | 'REJECTED_OUT_OF_WINDOW'
  | 'SAME_OWNER' // §3.7 — logged ₹0, no W/L/D, zero ledger rows
  | 'LEAGUE_RESULT' // domestic league or UCL league phase, paid per-fixture
  | 'SINGLE_LEG_CUP_RESULT'
  | 'TWO_LEG_TIE_RESULT' // aggregate, one W one L
  | 'LEG_RECORDED_SUPPRESSED' // one leg of a 2-leg tie: log, ₹0, no W/L/D
  | 'TROPHY_PAYOUT'
  | 'TROPHY_UNOWNED'
  | 'MANUAL_REVIEW';

export interface Proposal {
  kind: ProposalKind;
  transfers: Transfer[];
  /** 'W' from perspective of home owner's player... resolved by caller into wld rows */
  winnerPlayer: PlayerId | null;
  loserPlayer: PlayerId | null;
  isDraw: boolean;
  margin: number;
  amount: number;
  reviewReason: string | null;
  singleSource?: boolean;
}

export const SEASON_OPEN = '2026-08-21T00:00:00Z';
export const SEASON_CLOSE = '2027-06-05T23:59:59Z';

/** Canonical in-scope set (nine competitions). */
const SCOPE: Set<string> = IN_SCOPE_CODES;

function inWindow(kickoffUtc: string): boolean {
  return kickoffUtc >= SEASON_OPEN && kickoffUtc <= SEASON_CLOSE;
}

function isOwned(clubId: string): boolean {
  return clubById.has(clubId);
}

export function marginToAmount(margin: number): number {
  if (margin <= 0) return 0;
  return margin >= 4 ? 1000 : 500;
}

/** §3.1 ownership test — run first, always. */
export function ownershipTest(homeClubId: string, awayClubId: string): boolean {
  return isOwned(homeClubId) && isOwned(awayClubId);
}

function sameOwner(homeClubId: string, awayClubId: string): boolean {
  if (!isOwned(homeClubId) || !isOwned(awayClubId)) return false;
  return ownerOf(homeClubId) === ownerOf(awayClubId);
}

function review(reason: string, extra: Partial<Proposal> = {}): Proposal {
  return {
    kind: 'MANUAL_REVIEW',
    transfers: [],
    winnerPlayer: null,
    loserPlayer: null,
    isDraw: false,
    margin: 0,
    amount: 0,
    reviewReason: reason,
    ...extra,
  };
}

/**
 * Score a single finished fixture that is NOT part of a two-legged tie.
 * Covers: domestic league home/away, UCL league phase (once), single-leg cups.
 * For legs of a two-legged tie, use recordSuppressedLeg() + scoreTwoLeggedTie().
 */
export function scoreSingleFixture(r: NormalisedResult): Proposal {
  // 1. ownership first (§3.1)
  if (!ownershipTest(r.homeClubId, r.awayClubId)) {
    return {
      kind: 'IGNORED_UNOWNED', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  // 2. scope
  if (OUT_OF_SCOPE_CODES.has(r.competitionCode) || !SCOPE.has(r.competitionCode)) {
    return {
      kind: 'REJECTED_OUT_OF_SCOPE', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  // 3. window
  if (!inWindow(r.kickoffUtc)) {
    return {
      kind: 'REJECTED_OUT_OF_WINDOW', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  // 4. non-terminal statuses (§3.9)
  if (r.terminalStatus === 'POSTPONED') {
    return review('Postponed — fixture stays scheduled, no ledger action.');
  }
  if (r.terminalStatus === 'ABANDONED' || r.terminalStatus === 'AWARDED' || r.terminalStatus === 'CANCELLED') {
    return review(`Status ${r.terminalStatus} — held pending, never auto-record.`);
  }
  // 5. same owner (§3.7) — only possible in UCL but enforced generally
  if (sameOwner(r.homeClubId, r.awayClubId)) {
    return {
      kind: 'SAME_OWNER', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }

  const homeOwner = ownerOf(r.homeClubId);
  const awayOwner = ownerOf(r.awayClubId);

  // UCL League Phase is single-meeting but NOT a knockout: draws are normal ₹0 results.
  const isKnockoutSingleLeg = isSingleLegCup(r.competitionCode, r.round) && r.round !== 'League Phase';

  // effective score: 120' score if AET/PEN, else 90'
  let eff: ScorePair = r.scoreAt90;
  if (r.terminalStatus === 'AET' || r.terminalStatus === 'PEN') {
    if (!r.scoreAt120) {
      return review('Extra time / penalties indicated but scoreAt120 missing.');
    }
    eff = r.scoreAt120;
  }

  if (r.terminalStatus === 'PEN') {
    // shootout is a Win, never a draw; shootout score excluded from margin (§3.6)
    if (!r.shootout) {
      return review('Level on aggregate / after 120 with null penalty score — known provider defect, never infer.');
    }
    if (r.shootout.home === r.shootout.away) {
      return review('Shootout score is level — data defect, route to manual review.');
    }
    const homeAdvances = r.shootout.home > r.shootout.away;
    const winner = homeAdvances ? homeOwner : awayOwner;
    const loser = homeAdvances ? awayOwner : homeOwner;
    const label = `${clubName(r.homeClubId)} ${eff.home}-${eff.away} ${clubName(r.awayClubId)} (pens ${r.shootout.home}-${r.shootout.away})`;
    return {
      kind: isKnockoutSingleLeg ? 'SINGLE_LEG_CUP_RESULT' : 'LEAGUE_RESULT',
      transfers: [
        { from: loser, to: winner, amount: 500, eventType: 'MATCH', description: label },
      ],
      winnerPlayer: winner, loserPlayer: loser, isDraw: false,
      margin: 0, amount: 500, reviewReason: null,
    };
  }

  const margin = Math.abs(eff.home - eff.away);
  if (margin === 0) {
    // draw: ₹0, recorded, counts in draw column (§3.4).
    // A knockout single-leg can never end ₹0 — but a plain FT draw in a
    // single-leg cup without penalties is impossible in practice; if the
    // provider says FT draw in a knockout round, hold for review.
    if (isKnockoutSingleLeg && r.terminalStatus === 'FT') {
      return review('Knockout single-leg ended in a draw with no shootout data — held pending.');
    }
    return {
      kind: isKnockoutSingleLeg ? 'SINGLE_LEG_CUP_RESULT' : 'LEAGUE_RESULT',
      transfers: [], winnerPlayer: null, loserPlayer: null,
      isDraw: true, margin: 0, amount: 0, reviewReason: null,
    };
  }

  const amount = marginToAmount(margin);
  const homeWon = eff.home > eff.away;
  const winner = homeWon ? homeOwner : awayOwner;
  const loser = homeWon ? awayOwner : homeOwner;
  const label = `${clubName(r.homeClubId)} ${eff.home}-${eff.away} ${clubName(r.awayClubId)}`;
  return {
    kind: isKnockoutSingleLeg ? 'SINGLE_LEG_CUP_RESULT' : 'LEAGUE_RESULT',
    transfers: [{ from: loser, to: winner, amount, eventType: 'MATCH', description: label }],
    winnerPlayer: winner, loserPlayer: loser, isDraw: false,
    margin, amount, reviewReason: null,
  };
}

/** Single-leg cup = any in-scope cup round with leg_count 1 (FA/DFB/Coppa always; Copa except SF; UCL final). */
export function isSingleLegCup(competitionCode: string, round: string): boolean {
  if (competitionCode === 'EPL' || competitionCode === 'LA_LIGA' || competitionCode === 'BUNDESLIGA' || competitionCode === 'SERIE_A') return false;
  if (competitionCode === 'UCL') {
    return round === 'Final' || round === 'League Phase';
  }
  if (competitionCode === 'COPA_DEL_REY') return round !== 'Semi-final';
  return true; // FA_CUP, DFB_POKAL, COPPA_ITALIA all single-leg
}

export function isTwoLeggedTie(competitionCode: string, round: string): boolean {
  if (competitionCode === 'UCL') {
    return ['Knockout Play-off', 'Round of 16', 'Quarter-final', 'Semi-final'].includes(round);
  }
  if (competitionCode === 'COPA_DEL_REY') return round === 'Semi-final';
  return false;
}

/**
 * A single leg of a two-legged tie: ALWAYS suppressed.
 * Log scoreline for history, ₹0, no W/L/D, no payment (§3.6 ruling 2+3).
 */
export function recordSuppressedLeg(): Proposal {
  return {
    kind: 'LEG_RECORDED_SUPPRESSED', transfers: [],
    winnerPlayer: null, loserPlayer: null, isDraw: false,
    margin: 0, amount: 0, reviewReason: null,
  };
}

export interface TieLegInput {
  homeClubId: string;
  awayClubId: string;
  /** goals at the score that counts for this leg (120' if ET played in leg 2, else 90') */
  homeGoals: number;
  awayGoals: number;
  shootout: ScorePair | null; // only meaningful on leg 2 when level
}

/**
 * Score a resolved two-legged tie on the aggregate (§3.6).
 * Aggregate margin = |aggA - aggB|, NOT total goals.
 * Exactly one W + one L. Never ₹0 (penalties = ₹500 Win).
 */
export function scoreTwoLeggedTie(
  competitionCode: string,
  round: string,
  clubAId: string,
  clubBId: string,
  leg1: TieLegInput,
  leg2: TieLegInput | null,
): Proposal {
  if (!ownershipTest(clubAId, clubBId)) {
    return {
      kind: 'IGNORED_UNOWNED', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  if (!isTwoLeggedTie(competitionCode, round)) {
    return review(`Round ${round} is not configured as two legs for ${competitionCode}.`);
  }
  if (sameOwner(clubAId, clubBId)) {
    return {
      kind: 'SAME_OWNER', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  if (!leg2) {
    return review('Only one leg finished — no proposal until both legs are terminal.');
  }
  // aggregate from clubA perspective: sum goals scored by clubA across both legs
  // leg inputs carry home/away ids so venue swap is handled by caller passing correct ids.
  const goalsFor = (leg: TieLegInput, clubId: string): number => {
    // determine whether clubId was home or away in this leg
    if (leg.homeClubId === clubId) return leg.homeGoals;
    if (leg.awayClubId === clubId) return leg.awayGoals;
    throw new Error(`Club ${clubId} not in leg ${leg.homeClubId} v ${leg.awayClubId}`);
  };
  let aggA: number;
  let aggB: number;
  try {
    aggA = goalsFor(leg1, clubAId) + goalsFor(leg2, clubAId);
    aggB = goalsFor(leg1, clubBId) + goalsFor(leg2, clubBId);
  } catch (e) {
    return review((e as Error).message);
  }
  const ownerA = ownerOf(clubAId);
  const ownerB = ownerOf(clubBId);
  const margin = Math.abs(aggA - aggB);
  if (margin > 0) {
    const amount = marginToAmount(margin);
    const aAdvances = aggA > aggB;
    const winner = aAdvances ? ownerA : ownerB;
    const loser = aAdvances ? ownerB : ownerA;
    return {
      kind: 'TWO_LEG_TIE_RESULT',
      transfers: [{
        from: loser, to: winner, amount, eventType: 'MATCH',
        description: `${clubName(clubAId)} ${aggA}-${aggB} ${clubName(clubBId)} agg.`,
      }],
      winnerPlayer: winner, loserPlayer: loser, isDraw: false,
      margin, amount, reviewReason: null,
    };
  }
  // level on aggregate → leg 2 shootout decides; null → manual review (§3.9)
  if (!leg2.shootout) {
    return review('Level on aggregate with null penalty score — known API defect, never infer.');
  }
  if (leg2.shootout.home === leg2.shootout.away) {
    return review('Shootout score level — data defect.');
  }
  // shootout home/away refer to leg-2 venue; map winner club by shootout victor side
  const leg2HomeWonShootout = leg2.shootout.home > leg2.shootout.away;
  const shootoutWinnerClubId = leg2HomeWonShootout ? leg2.homeClubId : leg2.awayClubId;
  const winner = ownerOf(shootoutWinnerClubId);
  const loser = winner === ownerA ? ownerB : ownerA;
  return {
    kind: 'TWO_LEG_TIE_RESULT',
    transfers: [{
      from: loser, to: winner, amount: 500, eventType: 'MATCH',
      description: `${clubName(clubAId)} ${aggA}-${aggB} ${clubName(clubBId)} agg., pens ${leg2.shootout.home}-${leg2.shootout.away}.`,
    }],
    winnerPlayer: winner, loserPlayer: loser, isDraw: false,
    margin: 0, amount: 500, reviewReason: null,
  };
}

/** Trophy payout (§3.8). Three rows or zero. */
export function scoreTrophy(
  competitionCode: string,
  winningClubId: string | null, // null = unknown / unowned winner
  allPlayerIds: PlayerId[] = ['archit', 'vedant', 'harshal', 'anmol'],
): Proposal {
  const comp = COMPETITIONS.find((c) => c.code === competitionCode);
  if (!comp || !comp.inScope) {
    return {
      kind: 'REJECTED_OUT_OF_SCOPE', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  if (!winningClubId || !isOwned(winningClubId)) {
    return {
      kind: 'TROPHY_UNOWNED', transfers: [], winnerPlayer: null,
      loserPlayer: null, isDraw: false, margin: 0, amount: 0, reviewReason: null,
    };
  }
  const winner = ownerOf(winningClubId);
  const others = allPlayerIds.filter((p) => p !== winner);
  const transfers: Transfer[] = others.map((p) => ({
    from: p, to: winner, amount: comp.eachOtherPays, eventType: 'TROPHY',
    description: `${comp.name} — ${clubName(winningClubId)}`,
  }));
  return {
    kind: 'TROPHY_PAYOUT', transfers,
    winnerPlayer: winner, loserPlayer: null, isDraw: false,
    margin: 0, amount: comp.winnerPrize, reviewReason: null,
  };
}

/** Zero-sum check: sum of (credits - debits) over transfers must be 0. */
export function transfersSumToZero(transfers: Transfer[]): boolean {
  const net = new Map<string, number>();
  for (const t of transfers) {
    net.set(t.from, (net.get(t.from) ?? 0) - t.amount);
    net.set(t.to, (net.get(t.to) ?? 0) + t.amount);
  }
  let total = 0;
  for (const v of net.values()) total += v;
  return total === 0;
}

export function assertIntegerRupees(transfers: Transfer[]): boolean {
  return transfers.every((t) => Number.isInteger(t.amount) && t.amount > 0 && t.amount % 500 === 0);
}

function clubName(id: string): string {
  return clubById.get(id)?.name ?? id;
}
