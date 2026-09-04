// Roast selection engine — pure. Cooking happens in the webhook; math lives here.
// Ledger is the punchline: every slot resolves from computed truth, never invented.
export interface RoastContext {
  loser: string; winner: string;
  loserClub: string; winnerClub: string;
  loserClubId: string; winnerClubId: string;
  score: string; margin: number; amount: number; competition: string;
  loserPick: number; winnerPick: number;
  h2h: string; loserNet: number; winnerNet: number; owed: number;
  streakLosses: number; marquee: string; manager: string; rank: number;
  isUpset: boolean; isThrashing: boolean; derbyId: string | null;
  isShootout: boolean; isStreak: boolean; isLeadChange: boolean;
}

export interface RoastTemplate {
  id: number; body: string;
  target: 'LOSER' | 'WINNER' | 'BOTH' | 'NEUTRAL';
  scope: 'CLUB' | 'PLAYER' | 'MANAGER' | 'DERBY' | 'LEAGUE' | 'MARGIN' | 'META';
  club_id: string | null; derby_id: string | null;
  conditions: Record<string, unknown>;
  severity: number; weight: number;
  author_player_id: string | null;
  use_count: number; last_used_at: string | null;
}

const DAY = 864e5;

function condMatch(t: RoastTemplate, ctx: RoastContext): boolean {
  const c = t.conditions;
  if (c.margin_min != null && !(ctx.margin >= (c.margin_min as number))) return false;
  if (c.margin_max != null && !(ctx.margin <= (c.margin_max as number))) return false;
  if (c.competitions != null && !((c.competitions as string[]).includes(ctxComp(ctx)))) return false;
  if (c.loser_pick != null && !((c.loser_pick as number[]).includes(ctx.loserPick))) return false;
  if (c.opponent_draft_pick_worse_by != null && !(ctx.winnerPick - ctx.loserPick >= (c.opponent_draft_pick_worse_by as number))) return false;
  if (c.shootout === true && !ctx.isShootout) return false;
  if (c.is_upset === true && !ctx.isUpset) return false;
  if (c.is_streak === true && !ctx.isStreak) return false;
  if (c.is_lead_change === true && !ctx.isLeadChange) return false;
  if (c.is_derby === true && !ctx.derbyId) return false;
  return true;
}

// competitions stored as display names in context; normalize for condition lists
function ctxComp(ctx: RoastContext): string {
  return ctx.competition;
}

function bindingOk(t: RoastTemplate, ctx: RoastContext): boolean {
  if (t.club_id && t.club_id !== ctx.loserClubId && t.club_id !== ctx.winnerClubId) return false;
  if (t.derby_id && t.derby_id !== ctx.derbyId) return false;
  return true;
}

function severityOk(t: RoastTemplate, ctx: RoastContext): boolean {
  if (t.severity < 3) return true;
  return ctx.margin >= 3 || !!ctx.derbyId || ctx.isUpset;
}

function cooledDown(t: RoastTemplate, nowMs: number, windowDays: number): boolean {
  if (!t.last_used_at) return true;
  return nowMs - Date.parse(t.last_used_at) > windowDays * DAY;
}

function specificity(t: RoastTemplate): number {
  if (t.scope === 'DERBY') return 4;
  if (t.scope === 'PLAYER' || t.scope === 'MANAGER') return 3;
  if (t.scope === 'CLUB') return 2;
  return 1;
}

function scoreOf(t: RoastTemplate): number {
  let s = specificity(t) * t.weight;
  s *= 1 / (1 + t.use_count * 0.15);
  if (t.author_player_id) s *= 1.5;
  return s;
}

/** Pick one template: eligibility → cooldown (30d, relax 14d, 7d) → scored weighted pick. */
export function pickTemplate(templates: RoastTemplate[], ctx: RoastContext, nowMs: number, rand: () => number = Math.random): RoastTemplate | null {
  const eligible = templates.filter((t) => bindingOk(t, ctx) && severityOk(t, ctx) && condMatch(t, ctx));
  for (const window of [30, 14, 7]) {
    const pool = eligible.filter((t) => cooledDown(t, nowMs, window)).sort((x, y) => scoreOf(y) - scoreOf(x)).slice(0, 5);
    if (pool.length === 0) continue;
    const total = pool.reduce((s, t) => s + scoreOf(t), 0);
    let roll = rand() * total;
    for (const t of pool) {
      roll -= scoreOf(t);
      if (roll <= 0) return t;
    }
    return pool[pool.length - 1];
  }
  return eligible.sort((x, y) => scoreOf(y) - scoreOf(x))[0] ?? null;
}

const WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

export function renderBody(body: string, ctx: RoastContext): string {
  const streakWord = `${WORDS[Math.min(ctx.streakLosses, 10)] ?? `${ctx.streakLosses}th`} straight loss${ctx.streakLosses === 1 ? '' : 'es'}`;
  const slots: Record<string, string> = {
    loser: ctx.loser, winner: ctx.winner,
    loser_club: ctx.loserClub, winner_club: ctx.winnerClub,
    score: ctx.score, margin: String(ctx.margin),
    amount: `₹${ctx.amount.toLocaleString('en-IN')}`,
    competition: ctx.competition,
    loser_pick: ordinal(ctx.loserPick), winner_pick: ordinal(ctx.winnerPick),
    h2h: ctx.h2h,
    loser_net: inr(ctx.loserNet), winner_net: inr(ctx.winnerNet),
    owed: `₹${ctx.owed.toLocaleString('en-IN')}`,
    streak: streakWord, marquee: ctx.marquee, manager: ctx.manager,
    rank: String(ctx.rank),
  };
  return body.replace(/\{(\w+)\}/g, (m, k) => slots[k] ?? m);
}

function ordinal(n: number): string {
  return n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : n === 4 ? 'fourth' : `${n}th`;
}

function inr(n: number): string {
  return `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

/** Auto-generated stat block: always unique, leads every roast. */
export function statPrefix(ctx: RoastContext): string {
  return `${ctx.winner} ${ctx.score} ${ctx.loser} · ${ctx.loserClub} · ₹${ctx.amount.toLocaleString('en-IN')}\nRivalry now ${ctx.h2h}. ${ctx.loser} ${inr(ctx.loserNet)} on the season.`;
}
