import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { parseOneLine } from '@/lib/parse/one-line';
import { scoreSingleFixture } from '@/lib/scoring/engine';
import { ownerOf } from '@/lib/domain/constants';

/** Competition code → competitions.id */
const COMP_ID: Record<string, string> = {
  EPL: 'epl', LA_LIGA: 'laliga', BUNDESLIGA: 'bundesliga', SERIE_A: 'seriea',
  UCL: 'ucl', FA_CUP: 'facup', COPA_DEL_REY: 'copadelrey',
  COPPA_ITALIA: 'coppa', DFB_POKAL: 'dfbpokal',
  COMMUNITY_SHIELD: 'communityshield', DFL_SUPERCUP: 'dflsupercup',
};

const ONE_OFFS = new Set(['COMMUNITY_SHIELD', 'DFL_SUPERCUP']);

/**
 * Manual result entry — Commissioner types one line, e.g.
 * "Arsenal 2-0 Manchester City - Premier League".
 * Creates a PENDING approval (never writes the ledger directly).
 * v1 scope: the 48 league fixtures + 21 UCL league-phase ties.
 */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('manual-entry failed:', e);
    return NextResponse.json({ error: `Server error: ${(e as Error).message}` }, { status: 500 });
  }
}

async function handle(req: Request) {
  const { line } = (await req.json().catch(() => ({}))) as { line?: string };
  if (!line?.trim()) return NextResponse.json({ error: 'Type a result first.' }, { status: 400 });
  const parsed = parseOneLine(line);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = supabaseService();
  const compId = COMP_ID[parsed.competitionCode];
  const isOneOff = ONE_OFFS.has(parsed.competitionCode);

  // Amendment II gate: one-offs refuse until all four members agree + Archit ratifies.
  if (isOneOff) {
    const { data: cfg } = await db.from('config').select('value').eq('key', 'amendment_2_oneoffs').single();
    if ((cfg?.value as { status?: string })?.status !== 'ratified') {
      return NextResponse.json({ error: 'Amendment II (one-off cups) is pending — ratify it in the Commissioner console once all four members agree.' }, { status: 409 });
    }
  }

  const isUcl = parsed.competitionCode === 'UCL';
  const round = isOneOff ? 'One-off' : isUcl ? 'League Phase' : 'League';

  // find the scheduled fixture — exact home/away order first, else the reverse leg
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
      // one-offs have no pre-seeded fixture: create it on the fly (single leg, named order)
      const { data: created, error: eCreate } = await db.from('fixtures').insert({
        competition_id: compId, round,
        home_club_id: parsed.homeClubId, away_club_id: parsed.awayClubId,
        status: 'SCHEDULED', is_same_owner: false,
      }).select('*').single();
      if (eCreate || !created) return NextResponse.json({ error: 'Could not create one-off fixture.' }, { status: 500 });
      fixture = created;
    } else {
      return NextResponse.json({
        error: isUcl
          ? 'These two clubs were not drawn together in the UCL league phase — nothing to record.'
          : 'No such league fixture (cup ties can only be entered once drawn — coming in the cup update).',
      }, { status: 404 });
    }
  }
  if (fixture.status === 'RECORDED') {
    return NextResponse.json({ error: 'This fixture is already recorded. To fix it, use a correction (ask here and I\'ll wire the form).' }, { status: 409 });
  }
  if (fixture.status === 'PENDING_APPROVAL') {
    const { data: existing } = await db.from('pending_approvals').select('id')
      .eq('subject_type', 'FIXTURE').eq('subject_id', fixture.id).eq('status', 'PENDING')
      .maybeSingle();
    return NextResponse.json({
      error: 'Already waiting for approval.',
      approvalId: existing?.id ?? null,
      swapped,
    }, { status: 409 });
  }

  // score orientation: goals belong to the named clubs, wherever they played
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
    return NextResponse.json({ error: `Held for review: ${proposal.reviewReason}` }, { status: 422 });
  }
  if (proposal.kind === 'IGNORED_UNOWNED' || proposal.kind.startsWith('REJECTED')) {
    return NextResponse.json({ error: `Not countable: ${proposal.kind}.` }, { status: 422 });
  }

  const { data: approval, error } = await db.from('pending_approvals').insert({
    subject_type: 'FIXTURE',
    subject_id: fixture.id,
    proposed_payload: {
      line, swapped,
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
  if (error || !approval) return NextResponse.json({ error: 'Could not create approval.' }, { status: 500 });

  await db.from('fixtures').update({ status: 'PENDING_APPROVAL' }).eq('id', fixture.id);

  const p = proposal;
  const summary = p.kind === 'SAME_OWNER'
    ? 'Same owner — logged at ₹0, no money, no W/L/D.'
    : p.isDraw
      ? 'Draw — ₹0, recorded in the draw column.'
      : `₹${p.amount} — ${p.winnerPlayer} takes it from ${p.loserPlayer} (margin ${p.margin}).`;
  return NextResponse.json({ ok: true, approvalId: approval.id, summary, swapped });
}
