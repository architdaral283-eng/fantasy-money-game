import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { parseOneLine } from '@/lib/parse/one-line';
import { scoreSingleFixture } from '@/lib/scoring/engine';

/** Competition code → competitions.id */
const COMP_ID: Record<string, string> = {
  EPL: 'epl', LA_LIGA: 'laliga', BUNDESLIGA: 'bundesliga', SERIE_A: 'seriea',
  UCL: 'ucl', FA_CUP: 'facup', COPA_DEL_REY: 'copadelrey',
  COPPA_ITALIA: 'coppa', DFB_POKAL: 'dfbpokal',
  COMMUNITY_SHIELD: 'communityshield', DFL_SUPERCUP: 'dflsupercup',
};

const ONE_OFFS = new Set(['COMMUNITY_SHIELD', 'DFL_SUPERCUP']);

/**
 * Correction protocol (§1.2, spec case 21): NEVER update/delete a ledger row.
 * Appends a REVERSAL of every original row + the CORRECTED row(s), both with
 * is_correction=true and corrects_entry_id pointing at the original.
 * The results row and W/L/D rows (not append-only tables) are updated in place.
 * Two-step: {preview:true} shows original vs corrected; {preview:false} writes.
 */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error('correction failed:', e);
    return NextResponse.json({ error: `Server error: ${(e as Error).message}` }, { status: 500 });
  }
}

async function handle(req: Request) {
  const { line, preview, mode, entryId, decidedBy } = (await req.json().catch(() => ({}))) as {
    line?: string; preview?: boolean; mode?: 'correct' | 'dedupe'; entryId?: number; decidedBy?: string;
  };
  const db = supabaseService();
  const { data: actor } = await db.from('players').select('role').eq('id', decidedBy ?? 'archit').single();
  if (actor?.role !== 'COMMISSIONER') {
    return NextResponse.json({ error: 'Commissioner only.' }, { status: 403 });
  }

  // ——— dedupe: append a single REVERSAL of a duplicated correction row ———
  if (mode === 'dedupe') {
    if (!entryId) return NextResponse.json({ error: 'Missing entryId.' }, { status: 400 });
    const { data: target } = await db.from('ledger_entries').select('*').eq('id', entryId).single() as {
      data: { id: number; description: string; from_player_id: string; to_player_id: string; amount_inr: number; event_type: string; fixture_id: string | null; is_correction: boolean } | null;
    };
    if (!target || !target.is_correction) {
      return NextResponse.json({ error: 'Only a correction-protocol row (REVERSAL/CORRECTION) can be deduped.' }, { status: 422 });
    }
    const { data: already } = await db.from('ledger_entries').select('id').eq('corrects_entry_id', entryId).ilike('description', 'REVERSAL of duplicate%');
    if ((already ?? []).length > 0) {
      return NextResponse.json({ error: `Entry #${entryId} was already deduped.` }, { status: 409 });
    }
    const { error } = await db.from('ledger_entries').insert({
      event_type: target.event_type,
      description: `REVERSAL of duplicate entry #${entryId}`,
      from_player_id: target.to_player_id,
      to_player_id: target.from_player_id,
      amount_inr: target.amount_inr,
      fixture_id: target.fixture_id,
      is_correction: true,
      corrects_entry_id: entryId,
    });
    if (error) throw new Error(`Dedupe failed: ${error.message}`);
    await db.from('audit_log').insert({ actor_id: decidedBy ?? 'archit', action: 'DEDUPE', subject_type: 'LEDGER', subject_id: String(entryId) });
    const { data: balances } = await db.from('player_balances').select('net_inr');
    const sum = (balances ?? []).reduce((s: number, r: { net_inr: number }) => s + Number(r.net_inr), 0);
    if (sum !== 0) throw new Error(`Zero-sum broken after dedupe (sum=${sum}).`);
    return NextResponse.json({ ok: true, summary: `Duplicate #${entryId} reversed. Ledger is clean.` });
  }

  if (!line?.trim()) return NextResponse.json({ error: 'Type the corrected result first.' }, { status: 400 });
  const parsed = parseOneLine(line);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const compId = COMP_ID[parsed.competitionCode];
  const isOneOff = ONE_OFFS.has(parsed.competitionCode);
  const isUcl = parsed.competitionCode === 'UCL';
  const round = isOneOff ? 'One-off' : isUcl ? 'League Phase' : 'League';

  // find the RECORDED fixture — named order first, else the reverse leg
  const { data: exact } = await db.from('fixtures').select('*, competitions!inner(code)')
    .eq('competition_id', compId).eq('round', round)
    .eq('home_club_id', parsed.homeClubId).eq('away_club_id', parsed.awayClubId)
    .maybeSingle();
  let fixture = exact;
  let swapped = false;
  if (!fixture) {
    const { data: rev } = await db.from('fixtures').select('*, competitions!inner(code)')
      .eq('competition_id', compId).eq('round', round)
      .eq('home_club_id', parsed.awayClubId).eq('away_club_id', parsed.homeClubId)
      .maybeSingle();
    fixture = rev;
    swapped = true;
  }
  if (!fixture) return NextResponse.json({ error: 'No recorded fixture matches that line.' }, { status: 404 });
  if (fixture.status !== 'RECORDED') {
    return NextResponse.json({ error: `Fixture is ${fixture.status} — only RECORDED fixtures can be corrected.` }, { status: 409 });
  }

  const homeGoals = swapped ? parsed.awayGoals : parsed.homeGoals;
  const awayGoals = swapped ? parsed.homeGoals : parsed.awayGoals;

  const { data: originalRows } = await db.from('ledger_entries').select('*')
    .eq('fixture_id', fixture.id).eq('is_correction', false).order('id');
  const { data: resultRow } = await db.from('results').select('*').eq('fixture_id', fixture.id).maybeSingle();

  // double-submit guard: already corrected to exactly this score → refuse
  if (resultRow && resultRow.h90 === homeGoals && resultRow.a90 === awayGoals) {
    const { data: prior } = await db.from('ledger_entries').select('id')
      .eq('fixture_id', fixture.id).eq('is_correction', true)
      .ilike('description', `CORRECTION:%${homeGoals}-${awayGoals}%`);
    if ((prior ?? []).length > 0) {
      return NextResponse.json({ error: `Already corrected to ${homeGoals}-${awayGoals} — nothing to do. Check the Ledger.` }, { status: 409 });
    }
  }
  const originalScore = resultRow ? `${resultRow.h90}-${resultRow.a90}` : 'unknown';

  const proposal = scoreSingleFixture({
    competitionCode: parsed.competitionCode, round,
    homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id,
    scoreAt90: { home: homeGoals, away: awayGoals },
    scoreAt120: null, shootout: null, terminalStatus: 'FT',
    kickoffUtc: new Date().toISOString(),
  });
  if (proposal.kind === 'MANUAL_REVIEW' || proposal.kind === 'IGNORED_UNOWNED' || proposal.kind.startsWith('REJECTED')) {
    return NextResponse.json({ error: `Corrected score not countable: ${proposal.reviewReason ?? proposal.kind}.` }, { status: 422 });
  }

  const correctedSummary = proposal.kind === 'SAME_OWNER'
    ? 'Same owner — ₹0, no money, no W/L/D.'
    : proposal.isDraw
      ? 'Draw — ₹0, both recorded as D.'
      : `₹${proposal.amount} — ${proposal.winnerPlayer} takes it from ${proposal.loserPlayer} (margin ${proposal.margin}).`;

  if (preview) {
    return NextResponse.json({
      ok: true, preview: true, fixtureId: fixture.id, swapped,
      original: {
        score: originalScore,
        rows: (originalRows ?? []).map((r: { id: number; from_player_id: string; to_player_id: string; amount_inr: number }) =>
          `#${r.id}: ${r.from_player_id} → ${r.to_player_id} ₹${r.amount_inr}`),
      },
      corrected: { score: `${homeGoals}-${awayGoals}`, summary: correctedSummary },
    });
  }

  // ——— apply: reversal(s) + corrected row(s) ———
  const firstOrig = (originalRows ?? [])[0] as { id: number } | undefined;
  for (const r of (originalRows ?? []) as { id: number; from_player_id: string; to_player_id: string; amount_inr: number; event_type: string }[]) {
    const { error } = await db.from('ledger_entries').insert({
      event_type: r.event_type,
      description: `REVERSAL of entry #${r.id}`,
      from_player_id: r.to_player_id, // swapped
      to_player_id: r.from_player_id,
      amount_inr: r.amount_inr,
      fixture_id: fixture.id,
      is_correction: true,
      corrects_entry_id: r.id,
    });
    if (error) throw new Error(`Reversal failed: ${error.message}`);
  }
  for (const t of proposal.transfers) {
    const { error } = await db.from('ledger_entries').insert({
      event_type: t.eventType,
      description: `CORRECTION: ${fixture.home_club_id} ${homeGoals}-${awayGoals} ${fixture.away_club_id}`,
      from_player_id: t.from,
      to_player_id: t.to,
      amount_inr: t.amount,
      fixture_id: fixture.id,
      is_correction: true,
      corrects_entry_id: firstOrig?.id ?? null,
    });
    if (error) throw new Error(`Corrected row failed: ${error.message}`);
  }

  // results + W/L/D (mutable tables) updated in place
  if (resultRow) {
    await db.from('results').update({ h90: homeGoals, a90: awayGoals }).eq('fixture_id', fixture.id);
  }
  const { data: wldRows } = await db.from('wld_records').select('id,player_id').eq('fixture_id', fixture.id);
  if (proposal.winnerPlayer && proposal.loserPlayer) {
    for (const w of (wldRows ?? []) as { id: number; player_id: string }[]) {
      const outcome = w.player_id === proposal.winnerPlayer ? 'W' : w.player_id === proposal.loserPlayer ? 'L' : null;
      if (outcome) await db.from('wld_records').update({ outcome }).eq('id', w.id);
    }
  } else if (proposal.isDraw) {
    for (const w of (wldRows ?? []) as { id: number }[]) {
      await db.from('wld_records').update({ outcome: 'D' }).eq('id', w.id);
    }
  }

  await db.from('audit_log').insert({
    actor_id: 'archit', action: 'CORRECT', subject_type: 'FIXTURE', subject_id: fixture.id,
    after: { line, correctedScore: `${homeGoals}-${awayGoals}` },
  });

  // zero-sum proof
  const { data: balances } = await db.from('player_balances').select('net_inr');
  const sum = (balances ?? []).reduce((s: number, r: { net_inr: number }) => s + Number(r.net_inr), 0);
  if (sum !== 0) throw new Error(`Zero-sum broken after correction (sum=${sum}).`);

  return NextResponse.json({ ok: true, summary: `Corrected to ${homeGoals}-${awayGoals}: ${correctedSummary} Original row(s) stay visible.` });
}
