// The goal that decided it. Goal minutes already arrive from ESPN, so a late
// winner or a fourth goal that doubled the bill is knowable without asking
// anyone anything. Pure, so the arithmetic can be wrong in a test instead of
// in someone's DMs.

export interface NearMissGoal { minute: string; player: string; clubId: string; pen?: boolean; og?: boolean }

export interface NearMissInput {
  goals: NearMissGoal[];
  /** The 90-minute score as recorded. Extra time and shootouts are not money events. */
  h90: number;
  a90: number;
  homeClubId: string;
  awayClubId: string;
}

export interface NearMiss {
  minute: number;
  player: string;
  /** Club credited with the goal. */
  clubId: string;
  /** 'flip' changed who won. 'bonus' kept the winner and doubled the stake. */
  kind: 'flip' | 'bonus';
  /** The score as it stood before that goal. */
  before: { h: number; a: number };
  stakeBefore: number;
  stakeAfter: number;
  /** Club that gained by it, and the one that paid. Null when nothing moved either way. */
  gainedClubId: string | null;
  lostClubId: string | null;
}

/** Anything from the 80th minute on counts as late. */
export const LATE_FROM = 80;

/** '90+3' -> 90. ESPN writes stoppage time as an addition, not a number. */
export function minuteNum(m: string): number {
  const x = String(m).match(/(\d+)/);
  return x ? Number(x[1]) : 0;
}

function outcome(h: number, a: number): 'H' | 'A' | 'D' {
  return h > a ? 'H' : a > h ? 'A' : 'D';
}

/** House rule: ₹500 a result, ₹1,000 if the 90-minute score finished 4+. A draw moves nothing. */
export function stakeFor(h: number, a: number): number {
  if (outcome(h, a) === 'D') return 0;
  return h + a >= 4 ? 1000 : 500;
}

/**
 * Did the last late goal decide the money? Returns null when the match was
 * already settled before it, which is the common case.
 */
export function nearMiss(i: NearMissInput): NearMiss | null {
  if (!i.goals.length) return null;
  const goals = [...i.goals].sort((a, b) => minuteNum(a.minute) - minuteNum(b.minute));
  const last = goals[goals.length - 1];
  const minute = minuteNum(last.minute);
  if (minute < LATE_FROM) return null;

  // Unwind that one goal. clubId is the club credited, which is how the
  // scorer lines already read it, so an own goal needs no special case here.
  const before = { h: i.h90, a: i.a90 };
  if (last.clubId === i.homeClubId) before.h -= 1;
  else if (last.clubId === i.awayClubId) before.a -= 1;
  else return null;
  if (before.h < 0 || before.a < 0) return null;

  const o0 = outcome(before.h, before.a);
  const o1 = outcome(i.h90, i.a90);
  const stakeBefore = stakeFor(before.h, before.a);
  const stakeAfter = stakeFor(i.h90, i.a90);
  const other = (c: string) => (c === i.homeClubId ? i.awayClubId : i.homeClubId);

  if (o0 !== o1) {
    return {
      minute, player: last.player, clubId: last.clubId, kind: 'flip', before,
      stakeBefore, stakeAfter,
      gainedClubId: last.clubId, lostClubId: other(last.clubId),
    };
  }

  if (stakeAfter > stakeBefore) {
    const winner = o1 === 'H' ? i.homeClubId : o1 === 'A' ? i.awayClubId : null;
    return {
      minute, player: last.player, clubId: last.clubId, kind: 'bonus', before,
      stakeBefore, stakeAfter,
      gainedClubId: winner, lostClubId: winner ? other(winner) : null,
    };
  }

  return null;
}

/** Signed value of a scoreline to one side's owner. A draw is worth nothing. */
export function valueTo(h: number, a: number, isHome: boolean): number {
  const s = stakeFor(h, a);
  if (s === 0) return 0;
  return (h > a) === isHome ? s : -s;
}

/**
 * What that one goal was worth to one side: the ledger as it is, minus the
 * ledger as it would have been. Negative means it cost them.
 */
export function deltaFor(m: NearMiss, isHome: boolean, h90: number, a90: number): number {
  return valueTo(h90, a90, isHome) - valueTo(m.before.h, m.before.a, isHome);
}
