import { describe, it, expect } from 'vitest';
import {
  scoreSingleFixture,
  scoreTwoLeggedTie,
  scoreTrophy,
  recordSuppressedLeg,
  transfersSumToZero,
  assertIntegerRupees,
  type NormalisedResult,
  type Transfer,
} from '@/lib/scoring/engine';

const base = (over: Partial<NormalisedResult>): NormalisedResult => ({
  competitionCode: 'EPL',
  round: 'League',
  homeClubId: 'arsenal',
  awayClubId: 'man-city',
  scoreAt90: { home: 0, away: 0 },
  scoreAt120: null,
  shootout: null,
  terminalStatus: 'FT',
  kickoffUtc: '2026-09-12T14:00:00Z',
  ...over,
});

const allSumsZero = (transfers: Transfer[]) => transfersSumToZero(transfers);

describe('Match money (§3.4)', () => {
  it('1. Arsenal 2-0 Man City EPL → Archit +500, Harshal -500, one W one L', () => {
    const p = scoreSingleFixture(base({ scoreAt90: { home: 2, away: 0 } }));
    expect(p.kind).toBe('LEAGUE_RESULT');
    expect(p.amount).toBe(500);
    expect(p.winnerPlayer).toBe('archit');
    expect(p.loserPlayer).toBe('harshal');
    expect(p.isDraw).toBe(false);
    expect(p.transfers).toHaveLength(1);
    expect(allSumsZero(p.transfers)).toBe(true);
    expect(assertIntegerRupees(p.transfers)).toBe(true);
  });

  it('2. Arsenal 4-0 Man City EPL → ±1000 (thrashing)', () => {
    const p = scoreSingleFixture(base({ scoreAt90: { home: 4, away: 0 } }));
    expect(p.amount).toBe(1000);
    expect(p.margin).toBe(4);
    expect(p.transfers[0].amount).toBe(1000);
  });

  it('3. Inter 1-1 Juventus Serie A → ₹0, both D, still logged', () => {
    const p = scoreSingleFixture(
      base({ competitionCode: 'SERIE_A', homeClubId: 'inter', awayClubId: 'juventus', scoreAt90: { home: 1, away: 1 } }),
    );
    expect(p.kind).toBe('LEAGUE_RESULT');
    expect(p.isDraw).toBe(true);
    expect(p.amount).toBe(0);
    expect(p.transfers).toHaveLength(0);
  });

  it('4. Real Madrid v RB Leipzig UCL (both Vedant) → ₹0, zero rows, no W/L/D', () => {
    const p = scoreSingleFixture(
      base({ competitionCode: 'UCL', round: 'League Phase', homeClubId: 'real-madrid', awayClubId: 'rb-leipzig', scoreAt90: { home: 3, away: 1 } }),
    );
    expect(p.kind).toBe('SAME_OWNER');
    expect(p.transfers).toHaveLength(0);
  });

  it('5. Arsenal v Liverpool EPL → ignored, Liverpool unowned', () => {
    const p = scoreSingleFixture(base({ homeClubId: 'arsenal', awayClubId: 'liverpool', scoreAt90: { home: 2, away: 0 } }));
    expect(p.kind).toBe('IGNORED_UNOWNED');
    expect(p.transfers).toHaveLength(0);
  });

  it('6. Bayern v Arsenal in Europa League → rejected out of scope', () => {
    const p = scoreSingleFixture(
      base({ competitionCode: 'UEL', homeClubId: 'bayern', awayClubId: 'arsenal', scoreAt90: { home: 2, away: 0 } }),
    );
    expect(p.kind).toBe('REJECTED_OUT_OF_SCOPE');
  });
});

describe('Knockouts, single leg (§3.6)', () => {
  it('7. Copa del Rey final Barcelona 4-0 Real Madrid → Anmol +1000', () => {
    const p = scoreSingleFixture(
      base({
        competitionCode: 'COPA_DEL_REY', round: 'Final',
        homeClubId: 'barcelona', awayClubId: 'real-madrid',
        scoreAt90: { home: 4, away: 0 },
      }),
    );
    expect(p.kind).toBe('SINGLE_LEG_CUP_RESULT');
    expect(p.amount).toBe(1000);
    expect(p.winnerPlayer).toBe('anmol');
    // trophy stacks independently: 3 rows of 500
    const t = scoreTrophy('COPA_DEL_REY', 'barcelona');
    expect(t.kind).toBe('TROPHY_PAYOUT');
    expect(t.transfers).toHaveLength(3);
    expect(t.transfers.every((x) => x.amount === 500)).toBe(true);
    expect(allSumsZero([...p.transfers, ...t.transfers])).toBe(true);
  });

  it('8. FA Cup Arsenal 1-1 Man City AET, Arsenal win pens 4-2 → Archit +500, W not D', () => {
    const p = scoreSingleFixture(
      base({
        competitionCode: 'FA_CUP', round: 'Final',
        scoreAt90: { home: 1, away: 1 },
        scoreAt120: { home: 1, away: 1 },
        shootout: { home: 4, away: 2 },
        terminalStatus: 'PEN',
      }),
    );
    expect(p.kind).toBe('SINGLE_LEG_CUP_RESULT');
    expect(p.amount).toBe(500);
    expect(p.isDraw).toBe(false);
    expect(p.winnerPlayer).toBe('archit');
  });

  it('9. UCL final 3-0 in extra time → ₹500 + ₹6000 trophy', () => {
    const p = scoreSingleFixture(
      base({
        competitionCode: 'UCL', round: 'Final',
        homeClubId: 'arsenal', awayClubId: 'real-madrid',
        scoreAt90: { home: 0, away: 0 },
        scoreAt120: { home: 3, away: 0 },
        terminalStatus: 'AET',
      }),
    );
    expect(p.amount).toBe(500); // margin 3, not thrashing
    const t = scoreTrophy('UCL', 'arsenal');
    expect(t.amount).toBe(6000);
    expect(t.transfers.every((x) => x.amount === 2000)).toBe(true);
  });
});

describe('Two-legged ties (§3.6)', () => {
  it('10. UCL R16 Arsenal 3-0 / Real 2-1 Arsenal → agg 4-2, ₹500 once, legs suppressed', () => {
    const leg = recordSuppressedLeg();
    expect(leg.kind).toBe('LEG_RECORDED_SUPPRESSED');
    expect(leg.transfers).toHaveLength(0);
    const p = scoreTwoLeggedTie(
      'UCL', 'Round of 16', 'arsenal', 'real-madrid',
      { homeClubId: 'arsenal', awayClubId: 'real-madrid', homeGoals: 3, awayGoals: 0, shootout: null },
      { homeClubId: 'real-madrid', awayClubId: 'arsenal', homeGoals: 2, awayGoals: 1, shootout: null },
    );
    expect(p.kind).toBe('TWO_LEG_TIE_RESULT');
    expect(p.amount).toBe(500);
    expect(p.margin).toBe(2);
    expect(p.winnerPlayer).toBe('archit');
    expect(p.transfers).toHaveLength(1);
  });

  it('11. UCL QF aggregate 5-1 → ₹1000', () => {
    const p = scoreTwoLeggedTie(
      'UCL', 'Quarter-final', 'arsenal', 'real-madrid',
      { homeClubId: 'arsenal', awayClubId: 'real-madrid', homeGoals: 3, awayGoals: 0, shootout: null },
      { homeClubId: 'real-madrid', awayClubId: 'arsenal', homeGoals: 1, awayGoals: 2, shootout: null },
    );
    expect(p.amount).toBe(1000);
    expect(p.margin).toBe(4);
  });

  it('12. UCL SF 1-1 / 0-0, pens 4-2 → margin 0 → ₹500 W not D', () => {
    const p = scoreTwoLeggedTie(
      'UCL', 'Semi-final', 'arsenal', 'real-madrid',
      { homeClubId: 'arsenal', awayClubId: 'real-madrid', homeGoals: 1, awayGoals: 1, shootout: null },
      { homeClubId: 'real-madrid', awayClubId: 'arsenal', homeGoals: 0, awayGoals: 0, shootout: { home: 4, away: 2 } },
    );
    expect(p.kind).toBe('TWO_LEG_TIE_RESULT');
    expect(p.amount).toBe(500);
    expect(p.margin).toBe(0);
    expect(p.isDraw).toBe(false);
    expect(p.winnerPlayer).toBe('vedant'); // leg-2 home (Real) won shootout
  });

  it('13. Only leg 1 finished → no proposal', () => {
    const p = scoreTwoLeggedTie(
      'UCL', 'Round of 16', 'arsenal', 'real-madrid',
      { homeClubId: 'arsenal', awayClubId: 'real-madrid', homeGoals: 2, awayGoals: 0, shootout: null },
      null,
    );
    expect(p.kind).toBe('MANUAL_REVIEW');
    expect(p.transfers).toHaveLength(0);
  });

  it('14. Level on aggregate, null penalty score → manual review', () => {
    const p = scoreTwoLeggedTie(
      'UCL', 'Semi-final', 'arsenal', 'real-madrid',
      { homeClubId: 'arsenal', awayClubId: 'real-madrid', homeGoals: 1, awayGoals: 1, shootout: null },
      { homeClubId: 'real-madrid', awayClubId: 'arsenal', homeGoals: 0, awayGoals: 0, shootout: null },
    );
    expect(p.kind).toBe('MANUAL_REVIEW');
  });
});

describe('Trophies (§3.8)', () => {
  it('15. Arsenal win EPL → 3 rows of ₹1000', () => {
    const t = scoreTrophy('EPL', 'arsenal');
    expect(t.kind).toBe('TROPHY_PAYOUT');
    expect(t.transfers).toHaveLength(3);
    expect(t.transfers.every((x) => x.to === 'archit' && x.amount === 1000)).toBe(true);
    expect(allSumsZero(t.transfers)).toBe(true);
  });

  it('16. Liverpool win EPL → zero rows, unowned', () => {
    const t = scoreTrophy('EPL', 'liverpool-fc');
    expect(t.kind).toBe('TROPHY_UNOWNED');
    expect(t.transfers).toHaveLength(0);
  });

  it('17. One player wins two league titles → both paid in full, 6 rows', () => {
    const a = scoreTrophy('EPL', 'arsenal');
    const b = scoreTrophy('LA_LIGA', 'atletico');
    expect(a.transfers).toHaveLength(3);
    expect(b.transfers).toHaveLength(3);
    expect(allSumsZero([...a.transfers, ...b.transfers])).toBe(true);
  });
});

describe('Invariants (§1)', () => {
  it('18. zero-sum holds across a mixed sequence', () => {
    const seq = [
      scoreSingleFixture(base({ scoreAt90: { home: 2, away: 0 } })),
      scoreSingleFixture(base({ scoreAt90: { home: 4, away: 0 } })),
      scoreTrophy('EPL', 'arsenal'),
      scoreTwoLeggedTie(
        'UCL', 'Round of 16', 'arsenal', 'real-madrid',
        { homeClubId: 'arsenal', awayClubId: 'real-madrid', homeGoals: 3, awayGoals: 0, shootout: null },
        { homeClubId: 'real-madrid', awayClubId: 'arsenal', homeGoals: 2, awayGoals: 1, shootout: null },
      ),
    ];
    const all = seq.flatMap((p) => p.transfers);
    expect(allSumsZero(all)).toBe(true);
    expect(assertIntegerRupees(all)).toBe(true);
  });

  it('22. season simulation: 500 random results keep zero-sum and W==L', () => {
    const owned = ['arsenal', 'man-city', 'man-utd', 'aston-villa', 'real-madrid', 'barcelona', 'atletico', 'real-betis', 'bayern', 'leverkusen', 'dortmund', 'rb-leipzig', 'inter', 'napoli', 'roma', 'juventus'];
    let w = 0, l = 0;
    const net = new Map<string, number>();
    const bump = (p: string, d: number) => net.set(p, (net.get(p) ?? 0) + d);
    for (let i = 0; i < 500; i++) {
      const h = owned[Math.floor(Math.random() * owned.length)];
      let a = owned[Math.floor(Math.random() * owned.length)];
      if (a === h) continue;
      const hg = Math.floor(Math.random() * 6);
      const ag = Math.floor(Math.random() * 5);
      const p = scoreSingleFixture(base({ homeClubId: h, awayClubId: a, scoreAt90: { home: hg, away: ag } }));
      if (p.kind === 'IGNORED_UNOWNED' || p.kind === 'SAME_OWNER') continue;
      expect(allSumsZero(p.transfers)).toBe(true);
      for (const t of p.transfers) { bump(t.to, t.amount); bump(t.from, -t.amount); }
      if (p.isDraw) continue;
      if (p.winnerPlayer) { w++; l++; }
      let total = 0;
      for (const v of net.values()) total += v;
      expect(total).toBe(0);
    }
    expect(w).toBe(l);
  });
});
