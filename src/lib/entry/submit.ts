// Shared manual-entry pipeline: one line in, PENDING approval out.
// Never writes the ledger. Used by the (removed) Commissioner page,
// the Telegram fallback, and any future entry surface. Logic unchanged.
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseOneLine } from '@/lib/parse/one-line';
import { scoreSingleFixture } from '@/lib/scoring/engine';
import { ownerOf } from '@/lib/domain/constants';

/** Competition code → competitions.id */
export const COMP_ID: Record<string, string> = {
  EPL: 'epl', LA_LIGA: 'laliga', BUNDESLIGA: 'bundesliga', SERIE_A: 'seriea',
  UCL: 'ucl', FA_CUP: 'facup', COPA_DEL_REY: 'copadelrey',
  COPPA_ITALIA: 'coppa', DFB_POKAL: 'dfbpokal',
  COMMUNITY_SHIELD: 'communityshield', DFL_SUPERCUP: 'dflsupercup',
};

export const ONE_OFFS = new Set(['COMMUNITY_SHIELD', 'DFL_SUPERCUP']);

export type SubmitResult =
  | { ok: true; approvalId: string; summary: string; swapped: boolean }
  | { ok: false; error: string; approvalId?: string | null };

export async function submitManualLine(db: SupabaseClient, line: string, source: string): Promise<SubmitResult> {
  if (!line?.trim()) return { ok: false, error: 'Type a result first.' };
  const parsed = parseOneLine(line);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const compId = COMP_ID[parsed.competitionCode];
  const isOneOff = ONE_OFFS.has(parsed.competitionCode);

  if (isOneOff) {
    const { data: cfg } = await db.from('config').select('value').eq('key', 'amendment_2_oneoffs').single();
    if ((cfg?.value as { status?: string })?.status !== 'ratified') {
      return { ok: false, error: 'Amendment II (one-off cups) is not ratified.' };
    }
  }

  const isUcl = parsed.competitionCode === 'UCL';
  const round = isOneOff ? 'One-off' : isUcl ? 'League Phase' : 'League';

  const { data: exact } = await db.from('fixtures').select('*')
    .eq('competition_id', compId).eq('round', round)
    .eq('home_club_id', parsed.homeClubId).eq('away_club_id', parsed.awayClubId)
    .maybeSingle();
  let fixture = exact;
  let swapped = false;
  if (!fixture) {
    const { data: rev } = await db.from('fixtures').select('*')
      .eq('competition_id', compId).eq('round', round)
      .eq('home_club_id', parsed.awayClubId).eq('away_club_id', parsed.homeClubId)
      .maybeSingle();
    fixture = rev;
    swapped = true;
  }
  if (!fixture) {
    if (isOneOff) {
      const { data: created, error: eCreate } = await db.from('fixtures').insert({
        competition_id: compId, round,
        home_club_id: parsed.homeClubId, away_club_id: parsed.awayClubId,
        status: 'SCHEDULED', is_same_owner: false,
      }).select('*').single();
      if (eCreate || !created) return { ok: false, error: 'Could not create one-off fixture.' };
      fixture = created;
    } else {
      return {
        ok: false,
        error: isUcl
          ? 'These two clubs were not drawn together in the UCL league phase. Nothing recorded.'
          : 'No such league fixture. Cup ties join once drawn.',
      };
    }
  }
  if (fixture.status === 'RECORDED') {
    return { ok: false, error: 'This fixture is already recorded.' };
  }
  if (fixture.status === 'PENDING_APPROVAL') {
    const { data: existing } = await db.from('pending_approvals').select('id')
      .eq('subject_type', 'FIXTURE').eq('subject_id', fixture.id).eq('status', 'PENDING')
      .maybeSingle();
    return { ok: false, error: 'Already waiting for approval.', approvalId: existing?.id ?? null };
  }

  const homeGoals = swapped ? parsed.awayGoals : parsed.homeGoals;
  const awayGoals = swapped ? parsed.homeGoals : parsed.awayGoals;
  const proposal = scoreSingleFixture({
    competitionCode: parsed.competitionCode, round,
    homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id,
    scoreAt90: { home: homeGoals, away: awayGoals },
    scoreAt120: null, shootout: null, terminalStatus: 'FT',
    kickoffUtc: new Date().toISOString(),
  });
  if (proposal.kind === 'MANUAL_REVIEW') {
    return { ok: false, error: `Held for review. ${proposal.reviewReason ?? ''}` };
  }
  if (proposal.kind === 'IGNORED_UNOWNED' || proposal.kind.startsWith('REJECTED')) {
    return { ok: false, error: `Not countable. ${proposal.kind}` };
  }

  const { data: approval, error } = await db.from('pending_approvals').insert({
    subject_type: 'FIXTURE',
    subject_id: fixture.id,
    proposed_payload: {
      line, swapped, source,
      homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id,
      homeOwner: ownerOf(fixture.home_club_id), awayOwner: ownerOf(fixture.away_club_id),
      competitionCode: parsed.competitionCode, round,
      score: { h: homeGoals, a: awayGoals },
      winnerPlayer: proposal.winnerPlayer, loserPlayer: proposal.loserPlayer,
      isDraw: proposal.isDraw, margin: proposal.margin, amount: proposal.amount,
      kind: proposal.kind,
    },
    computed_transfers: proposal.transfers.map((t) => ({
      ...t, fixture_id: fixture.id,
      description: `${fixture.home_club_id} ${homeGoals}-${awayGoals} ${fixture.away_club_id}`,
    })),
    status: 'PENDING',
  }).select('id').single();
  if (error || !approval) return { ok: false, error: 'Could not create approval.' };

  await db.from('fixtures').update({ status: 'PENDING_APPROVAL' }).eq('id', fixture.id);

  const p = proposal;
  const summary = p.kind === 'SAME_OWNER'
    ? 'Same owner. Logged at ₹0, no money, no W/L/D.'
    : p.isDraw
      ? 'Draw. ₹0, recorded in the draw column.'
      : `₹${p.amount}. ${p.winnerPlayer} takes it from ${p.loserPlayer} (margin ${p.margin}).`;
  return { ok: true, approvalId: approval.id, summary, swapped };
}
