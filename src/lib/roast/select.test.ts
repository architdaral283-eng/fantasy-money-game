import { describe, it, expect } from 'vitest';
import { pickTemplate, renderBody, statPrefix, type RoastContext, type RoastTemplate } from '@/lib/roast/select';

const ctx: RoastContext = {
  loser: 'Vedant', winner: 'Harshal', loserClub: 'Real Madrid', winnerClub: 'Real Betis',
  loserClubId: 'real-madrid', winnerClubId: 'real-betis',
  score: '0–1', margin: 1, amount: 500, competition: 'La Liga',
  loserPick: 1, winnerPick: 4, h2h: '5–1 to Harshal',
  loserNet: -2000, winnerNet: 500, owed: 3000, streakLosses: 4,
  marquee: 'Kylian Mbappé', manager: 'Xabi Alonso', rank: 3,
  isUpset: true, isThrashing: false, derbyId: null,
  isShootout: false, isStreak: true, isLeadChange: false,
};

const T = (over: Partial<RoastTemplate>): RoastTemplate => ({
  id: 1, body: 'x', target: 'LOSER', scope: 'META', club_id: null, derby_id: null,
  conditions: {}, severity: 2, weight: 10, author_player_id: null, use_count: 0, last_used_at: null,
  ...over,
});

describe('roast selection', () => {
  it('derby template beats generic on specificity', () => {
    const d = T({ id: 1, scope: 'DERBY', derby_id: 'd1', weight: 10 });
    const g = T({ id: 2, scope: 'META', weight: 10 });
    const pick = pickTemplate([g, d], { ...ctx, derbyId: 'd1' }, Date.now(), () => 0.01);
    expect(pick?.id).toBe(1);
  });

  it('severity 3 gated without margin, derby or upset', () => {
    const brutal = T({ id: 3, severity: 3 });
    expect(pickTemplate([brutal], { ...ctx, isUpset: false, margin: 1 }, Date.now(), () => 0.5)).toBeNull();
    expect(pickTemplate([brutal], ctx, Date.now(), () => 0.5)?.id).toBe(3);
  });

  it('conditions filter: thrashing-only line needs margin 4', () => {
    const th = T({ id: 4, conditions: { margin_min: 4 } });
    expect(pickTemplate([th], ctx, Date.now(), () => 0.5)).toBeNull();
    expect(pickTemplate([th], { ...ctx, margin: 4 }, Date.now(), () => 0.5)?.id).toBe(4);
  });

  it('cooldown relaxes 30d to 14d', () => {
    const used = T({ id: 5, last_used_at: new Date(Date.now() - 20 * 864e5).toISOString() });
    expect(pickTemplate([used], ctx, Date.now(), () => 0.5)?.id).toBe(5);
  });

  it('renders slots from computed truth', () => {
    expect(renderBody('{loser} spent the {loser_pick} pick on {loser_club} and paid {amount}. {h2h}.', ctx))
      .toBe('Vedant spent the first pick on Real Madrid and paid ₹500. 5–1 to Harshal.');
  });

  it('stat prefix leads with unique numbers', () => {
    const s = statPrefix(ctx);
    expect(s).toContain('Harshal 0–1 Vedant');
    expect(s).toContain('5–1 to Harshal');
    expect(s).toContain('−₹2,000');
  });
});
