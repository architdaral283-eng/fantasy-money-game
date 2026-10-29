import { describe, it, expect } from 'vitest';
import { pickTemplate, renderBody, statPrefix, type RoastContext, type RoastTemplate } from '@/lib/roast/select';

const ctx: RoastContext = {
  loser: 'Vedant', winner: 'Harshal', loserClub: 'Real Madrid', winnerClub: 'Real Betis',
  loserClubId: 'real-madrid', winnerClubId: 'real-betis',
  score: '1–0', margin: 1, amount: 500, competition: 'La Liga',
  homeClub: 'Real Madrid', awayClub: 'Real Betis', homeScore: '0–1',
  loserPick: 1, winnerPick: 4, h2h: 'Harshal leads 5–1',
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

  it('a LOSER club line never fires on the club that WON', () => {
    // ctx: Real Madrid (Vedant) lost to Real Betis (Harshal).
    // A Betis line is about the winning club and names {loser} as its owner,
    // which is Vedant, who owns Real Madrid. It must not be eligible at all.
    const betis = T({ id: 20, scope: 'CLUB', club_id: 'real-betis', target: 'LOSER' });
    expect(pickTemplate([betis], ctx, Date.now(), () => 0.5)).toBeNull();
  });

  it('a LOSER club line does fire on the club that lost', () => {
    const madrid = T({ id: 21, scope: 'CLUB', club_id: 'real-madrid', target: 'LOSER' });
    expect(pickTemplate([madrid], ctx, Date.now(), () => 0.5)?.id).toBe(21);
  });

  it('a WINNER club line is the mirror image', () => {
    const onWinner = T({ id: 22, scope: 'CLUB', club_id: 'real-betis', target: 'WINNER' });
    const onLoser = T({ id: 23, scope: 'CLUB', club_id: 'real-madrid', target: 'WINNER' });
    expect(pickTemplate([onWinner], ctx, Date.now(), () => 0.5)?.id).toBe(22);
    expect(pickTemplate([onLoser], ctx, Date.now(), () => 0.5)).toBeNull();
  });

  it('a BOTH club line still takes either side', () => {
    const a = T({ id: 24, scope: 'CLUB', club_id: 'real-madrid', target: 'BOTH' });
    const b = T({ id: 25, scope: 'CLUB', club_id: 'real-betis', target: 'BOTH' });
    expect(pickTemplate([a], ctx, Date.now(), () => 0.5)?.id).toBe(24);
    expect(pickTemplate([b], ctx, Date.now(), () => 0.5)?.id).toBe(25);
  });

  it('derby lines are unaffected: they name both men and bind on the tie', () => {
    const d = T({ id: 26, scope: 'DERBY', derby_id: 'el-clasico', club_id: null, target: 'LOSER' });
    expect(pickTemplate([d], { ...ctx, derbyId: 'el-clasico' }, Date.now(), () => 0.5)?.id).toBe(26);
    expect(pickTemplate([d], { ...ctx, derbyId: null }, Date.now(), () => 0.5)).toBeNull();
  });

  it('the hardest lines now fire on an ordinary one-goal win', () => {
    // Severity 3 used to need margin>=3, a derby or an upset, so a third of
    // the library almost never played and the group got arithmetic instead.
    const brutal = T({ id: 3, severity: 3 });
    expect(pickTemplate([brutal], { ...ctx, isUpset: false, margin: 1, derbyId: null }, Date.now(), () => 0.5)?.id).toBe(3);
    expect(pickTemplate([brutal], ctx, Date.now(), () => 0.5)?.id).toBe(3);
  });

  it('a line that WANTS a thrashing still says so itself', () => {
    const thrashing = T({ id: 5, severity: 3, conditions: { margin_min: 4 } });
    expect(pickTemplate([thrashing], { ...ctx, margin: 1 }, Date.now(), () => 0.5)).toBeNull();
    expect(pickTemplate([thrashing], { ...ctx, margin: 4 }, Date.now(), () => 0.5)?.id).toBe(5);
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

  it('renders rank as a word, not a digit', () => {
    expect(renderBody('{loser} is {rank} of four', ctx)).toBe('Vedant is third of four');
  });

  it('renders slots from computed truth', () => {
    expect(renderBody('{loser} spent the {loser_pick} pick on {loser_club} and paid {amount}. {h2h}.', ctx))
      .toBe('Vedant spent the first pick on Real Madrid and paid ₹500. Harshal leads 5–1.');
  });

  it('renders ${slot} as well as {slot}', () => {
    // 0012 authored every slot as ${slot}; the $B$ dollar-quote opener only
    // swallowed the $ when a slot began the string, so mid-string slots left a
    // stray $ in the group chat ("$Harshal paid $₹500").
    expect(renderBody('${loser} paid ${amount}.', ctx)).toBe('Vedant paid ₹500.');
    expect(renderBody('{loser} paid {amount}.', ctx)).toBe('Vedant paid ₹500.');
  });

  it('result header separates the club score from the player payment', () => {
    const s = statPrefix(ctx);
    expect(s).toContain('Real Madrid 0–1 Real Betis'); // clubs, home first
    expect(s).toContain('La Liga');
    expect(s).toContain('Vedant pays Harshal ₹500');   // players, money
    expect(s).toContain('Head to head: Harshal leads 5–1');
    expect(s).not.toContain('on the season');          // standings photo covers it
    expect(s).not.toContain('#');                      // no template id
  });

  it('a draw moves no money', () => {
    const s = statPrefix({ ...ctx, margin: 0, homeScore: '1–1' });
    expect(s).toContain('Draw. No money moves.');
    expect(s).not.toContain('pays');
  });

  it('scorers sit under the score, before the money', () => {
    const s = statPrefix({ ...ctx, scorers: ['Real Betis: Isco 55\''] });
    const lines = s.split('\n');
    expect(lines.indexOf('Real Betis: Isco 55\'')).toBeGreaterThan(lines.indexOf('La Liga'));
    expect(lines.indexOf('Real Betis: Isco 55\'')).toBeLessThan(lines.indexOf('Vedant pays Harshal ₹500'));
    expect(statPrefix(ctx)).not.toContain('Isco'); // no scorers, no block
  });
});

describe('draws', () => {
  const draw: RoastContext = {
    ...ctx, margin: 0, amount: 0, score: '3–3', homeScore: '3–3',
    homeClub: 'Napoli', awayClub: 'AS Roma', homeOwner: 'Vedant', awayOwner: 'Harshal',
  };
  const loserLine = T({ id: 10, body: '{loser} pays {winner} {amount}' });
  const drawLine = T({ id: 11, target: 'BOTH', body: '{home_owner} and {away_owner}, {score}', conditions: { draw: true } });

  it('a draw never picks a line that names a loser', () => {
    expect(pickTemplate([loserLine], draw, Date.now(), () => 0.5)).toBeNull();
    expect(pickTemplate([loserLine, drawLine], draw, Date.now(), () => 0.5)?.id).toBe(11);
  });

  it('a real result never picks a draw line', () => {
    expect(pickTemplate([drawLine], ctx, Date.now(), () => 0.5)).toBeNull();
  });

  it('draw lines name both owners by side', () => {
    expect(renderBody(drawLine.body, draw)).toBe('Vedant and Harshal, 3–3');
  });
});
