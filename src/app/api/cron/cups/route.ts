// The cup pass, in its OWN route and its OWN invocation.
//
// It used to live inside /api/cron/poll. A full schedule sync there already
// spends about 60 seconds on football-data's 6.5s call spacing, so adding the
// cups pushed the handler past its function timeout and the ENTIRE tick
// returned nothing: no results, no reminders, no sync. Separate job, separate
// budget.
//
// football-data's free tier carries no domestic cup at all, so ESPN is the
// only source for the FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal,
// Community Shield and DFL-Supercup. One pass inserts ties as they are drawn
// (announcing each in the group) and turns finished ones into proposals.
// Every cup tie is a knockout, so nothing here is ever auto-written: each
// result goes to the Commissioner's Approve button.

import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { scoreSingleFixture } from '@/lib/scoring/engine';
import { ownerOf } from '@/lib/domain/constants';
import { fanOutText, notifyArchitApproval } from '@/lib/notify/send';
import { sendGroup } from '@/lib/notify/quiet';
import { fixtureNotice } from '@/lib/notify/fixture-notice';
import { ESPN_ONLY_COMPS, ENGINE_CODE, espnRound, cupDates, espnCupSweep, toNormalised, goalsMatching } from '@/lib/providers/espn';

export const maxDuration = 60;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const nowMs = Date.now();
  const summary = { errors: [] as string[], autoLogged: 0, proposed: 0 };

  // Scan future dates once a day; the rest of the time just ask ESPN for the
  // current round, which is what catches a result on the day it is played.
  const { data: syncCfg } = await db.from('config').select('value').eq('key', 'last_cup_sync').maybeSingle();
  const lastMs = Date.parse((syncCfg?.value as { at?: string } | null)?.at ?? '') || 0;
  const forceSync = new URL(req.url).searchParams.get('sync') === '1';
  const doScheduleSync = forceSync || nowMs - lastMs > 24 * 3600 * 1000;

  let cupsFound = 0;
  let cupResults = 0;
  // Don't poke an unofficial feed 288 times a day for nothing: outside the
  // daily sync, only ask when one of our cup ties is actually due a result.
  const { count: cupDue } = await db.from('fixtures').select('id', { count: 'exact', head: true })
    .in('competition_id', [...ESPN_ONLY_COMPS])
    .eq('status', 'SCHEDULED')
    .lt('kickoff_utc', new Date(nowMs - 100 * 60 * 1000).toISOString())
    .gte('kickoff_utc', new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString());
  // Hard deadline for the whole cup pass. Everything above it has already run;
  // a cup skipped here is picked up on the next tick, which is far better than
  // the function timing out and the entire poll returning nothing.
  const cupDeadline = Date.now() + 20_000;
  for (const compId of (doScheduleSync || (cupDue ?? 0) > 0) ? ESPN_ONLY_COMPS : []) {
    const code = ENGINE_CODE[compId];
    try {
      if (Date.now() > cupDeadline) { summary.errors.push(`cup ${compId}: skipped, out of time this tick`); continue; }
      const dates: (string | undefined)[] = [undefined];
      if (doScheduleSync) dates.push(...cupDates(nowMs));
      const found = await espnCupSweep(compId, dates, { deadlineMs: cupDeadline });
      if (!found.length) continue;
      await db.from('api_call_log').insert({ provider: 'espn', endpoint: `cup:${compId}` });

      for (const m of found) {
        const round = espnRound(m.note);
        // Our row for this tie, in EITHER venue order.
        //
        // This matching is the whole safety of the cup pass. The first version
        // required a kickoff within 36h or an exact round match; a tie entered
        // by hand has a NULL kickoff (Date.parse(null) is NaN, so every
        // comparison is false) and whatever round label the person typed. Both
        // tests failed, so it inserted a SECOND row for a tie already played —
        // with ESPN's venue order, which the UNIQUE(competition, round, home,
        // away) index therefore did not catch — and then proposed money on a
        // match that was settled in August.
        //
        // So: find by club pair first, and if the pair already has a RECORDED
        // meeting here that nothing else matches, do nothing at all. A missed
        // cup tie is a /report away; a duplicate is a wrong ledger entry.
        const { data: rows } = await db.from('fixtures').select('id,round,status,kickoff_utc,home_club_id,away_club_id')
          .eq('competition_id', compId)
          .in('home_club_id', [m.homeClubId, m.awayClubId])
          .in('away_club_id', [m.homeClubId, m.awayClubId]);
        type FxRow = { id: string; round: string; status: string; kickoff_utc: string | null; home_club_id: string; away_club_id: string };
        const pairRows = (rows ?? []) as FxRow[];
        const nearDate = (f: FxRow) => {
          const k = Date.parse(f.kickoff_utc ?? '');
          return Number.isFinite(k) && Math.abs(k - Date.parse(m.kickoffUtc)) < 36 * 3600 * 1000;
        };
        let fx: FxRow | undefined =
          pairRows.find(nearDate)
          ?? pairRows.find((f) => f.round === round)
          // an undated row entered by hand, or seeded, waiting to be matched
          ?? pairRows.find((f) => f.status !== 'RECORDED' && !f.kickoff_utc);

        if (!fx && pairRows.length) {
          // The pair has history here and none of it is this tie as far as we
          // can tell. Never invent a second fixture on a guess.
          summary.errors.push(`cup ${compId}: ${m.homeClubId} v ${m.awayClubId} (${round}, ${m.kickoffUtc}) already has ${pairRows.length} row(s); not inserting`);
          continue;
        }

        if (fx && (!fx.kickoff_utc || fx.round !== round) && fx.status !== 'RECORDED') {
          // adopt the hand-entered row rather than duplicating it
          await db.from('fixtures').update({
            kickoff_utc: new Date(m.kickoffUtc).toISOString(),
            ...(fx.round === round ? {} : { round }),
          }).eq('id', fx.id);
          fx = { ...fx, kickoff_utc: new Date(m.kickoffUtc).toISOString(), round };
        }

        if (!fx) {
          const sameOwner = ownerOf(m.homeClubId) === ownerOf(m.awayClubId);
          const { data: ins, error: insErr } = await db.from('fixtures').insert({
            competition_id: compId, round,
            home_club_id: m.homeClubId, away_club_id: m.awayClubId,
            kickoff_utc: new Date(m.kickoffUtc).toISOString(),
            status: 'SCHEDULED', is_same_owner: sameOwner,
          }).select('id,round,status,kickoff_utc,home_club_id,away_club_id').single();
          if (insErr) {
            if (!/duplicate key/i.test(insErr.message)) summary.errors.push(`cup insert ${compId} ${m.homeClubId} v ${m.awayClubId}: ${insErr.message}`);
            continue;
          }
          cupsFound++;
          await sendGroup(db, await fixtureNotice(db, {
            home_club_id: m.homeClubId, away_club_id: m.awayClubId,
            competition_id: compId, kickoff_utc: new Date(m.kickoffUtc).toISOString(), round,
          }, 'drawn'));
          fx = ins as unknown as typeof fx;
        } else if (fx && fx.kickoff_utc && Date.parse(fx.kickoff_utc) !== Date.parse(m.kickoffUtc) && fx.status === 'SCHEDULED') {
          // rescheduled → reminders must fire again for the new time
          await db.from('fixtures').update({
            kickoff_utc: new Date(m.kickoffUtc).toISOString(), round,
            reminder_sent_at: null, pre_match_sent_at: null,
          }).eq('id', fx.id);
        }
        if (!fx || fx.status !== 'SCHEDULED') continue;
        if (Date.parse(m.kickoffUtc) + 100 * 60 * 1000 > nowMs) continue;

        const n = toNormalised(m, code, fx.round || round);
        if (!n) continue;
        const swapped = fx.home_club_id !== m.homeClubId;
        const flip = (sc: { home: number; away: number } | null) => (sc && swapped ? { home: sc.away, away: sc.home } : sc);
        const proposal = scoreSingleFixture({
          ...n,
          homeClubId: fx.home_club_id, awayClubId: fx.away_club_id,
          scoreAt90: flip(n.scoreAt90)!, scoreAt120: flip(n.scoreAt120), shootout: flip(n.shootout),
        });
        if (proposal.kind === 'IGNORED_UNOWNED' || proposal.kind.startsWith('REJECTED')) continue;

        const h = swapped ? m.away : m.home;
        const a = swapped ? m.home : m.away;
        if (proposal.kind === 'MANUAL_REVIEW') {
          await db.from('pending_approvals').insert({
            subject_type: 'FIXTURE', subject_id: fx.id,
            proposed_payload: { source: 'poller-espn', review: true, provider: 'espn' },
            computed_transfers: [], status: 'PENDING',
            review_reason: proposal.reviewReason, single_source: true,
          });
          await fanOutText(db, 'manual_review_needed', `Manual review needed: ${fx.home_club_id} v ${fx.away_club_id} (${compId}). ${proposal.reviewReason}`);
          continue;
        }
        if (proposal.kind === 'SAME_OWNER') {
          await db.from('results').insert({
            fixture_id: fx.id, h90: h, a90: a,
            terminal_status: n.terminalStatus, provider: 'espn',
            raw_payload: { provider: 'espn', espnId: m.espnId },
          });
          await db.from('fixtures').update({ status: 'RECORDED' }).eq('id', fx.id);
          summary.autoLogged++;
          continue;
        }

        const { data: approval } = await db.from('pending_approvals').insert({
          subject_type: 'FIXTURE', subject_id: fx.id,
          proposed_payload: {
            source: 'poller-espn', line: null, provider: 'espn',
            homeClubId: fx.home_club_id, awayClubId: fx.away_club_id,
            homeOwner: ownerOf(fx.home_club_id), awayOwner: ownerOf(fx.away_club_id),
            competitionCode: code, round: fx.round || round,
            score: { h, a },
            winnerPlayer: proposal.winnerPlayer, loserPlayer: proposal.loserPlayer,
            isDraw: proposal.isDraw, margin: proposal.margin, amount: proposal.amount,
            kind: proposal.kind, terminalStatus: n.terminalStatus,
            goals: goalsMatching(m.goals, fx.home_club_id, h, fx.away_club_id, a),
          },
          computed_transfers: proposal.transfers.map((t) => ({
            ...t, fixture_id: fx!.id,
            description: `${fx!.home_club_id} v ${fx!.away_club_id} (${code})`,
          })),
          status: 'PENDING', single_source: true,
        }).select('id').single();
        if (!approval) continue;
        await db.from('fixtures').update({ status: 'PENDING_APPROVAL' }).eq('id', fx.id);
        summary.proposed++;
        cupResults++;

        // Knockout: never auto-written. One tap from Archit writes it, through
        // the same Approve/Reject buttons every other proposal uses.
        const pens = n.shootout ? ` (pens ${n.shootout.home}–${n.shootout.away})` : '';
        const et = n.terminalStatus === 'AET' ? ' after extra time' : '';
        const money = proposal.isDraw ? 'Draw, nothing moves.' : `₹${proposal.amount} ${proposal.winnerPlayer} from ${proposal.loserPlayer}.`;
        await notifyArchitApproval(db, (approval as { id: string }).id,
          `Cup result from ESPN\n${fx.home_club_id} ${h}–${a} ${fx.away_club_id}${et}${pens}\n${compId} · ${fx.round || round}\n\n${money}`,
        ).catch(() => undefined);
      }
    } catch (e) {
      summary.errors.push(`cup ${compId}: ${(e as Error).message}`);
    }
  }

  if (doScheduleSync && !summary.errors.length) {
    await db.from('config').upsert({ key: 'last_cup_sync', value: { at: new Date().toISOString() } }, { onConflict: 'key' });
  }
  return NextResponse.json({ ok: true, cupsFound, cupResults, scheduleSync: doScheduleSync, ...summary });
}
