import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { FootballDataOrgProvider, normalizeRound } from '@/lib/providers/football-data';
import { mappingConfirmed } from '@/lib/providers/team-ids';
import { scoreSingleFixture, type NormalisedResult } from '@/lib/scoring/engine';
import { ownerOf } from '@/lib/domain/constants';
import { fanOutText } from '@/lib/notify/send';
import { dueReminders } from '@/lib/notify/send';

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

const FD_COMPS = ['EPL', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A', 'UCL'] as const;
const COMP_ID: Record<string, string> = {
  EPL: 'epl', LA_LIGA: 'laliga', BUNDESLIGA: 'bundesliga', SERIE_A: 'seriea', UCL: 'ucl',
};

/**
 * Matchday poller — GitHub Actions cron only, NEVER on page load (§9).
 * 1. Syncs dates for scheduled owned-v-owned fixtures (football-data.org).
 * 2. Detects finished fixtures (kickoff >100 min ago + terminal status),
 *    scores them with the pure engine, creates PENDING approvals, and sends
 *    Archit one-tap Approve/Reject buttons on Telegram.
 * 3. Sends 24h kickoff reminders (fully automatic, no approval).
 * Gated on Amendment I ratification. Never auto-approves money (§1.4).
 * Same-owner ₹0 ties auto-log (no money, no W/L/D — nothing to approve).
 */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();

  const { data: amd } = await db.from('config').select('value').eq('key', 'amendment_1_assisted_mode').single();
  if ((amd?.value as { status?: string })?.status !== 'ratified') {
    return NextResponse.json({ ok: false, reason: 'Poller gated: Amendment I not ratified.' });
  }
  if (!mappingConfirmed()) {
    return NextResponse.json({ ok: false, reason: 'Team-ID mapping unconfirmed.' });
  }
  const token = process.env.FOOTBALL_DATA_ORG_TOKEN;
  if (!token) return NextResponse.json({ ok: false, reason: 'FOOTBALL_DATA_ORG_TOKEN not set.' });

  const provider = new FootballDataOrgProvider(token);
  const nowMs = Date.now();
  const summary = { synced: 0, proposed: 0, autoLogged: 0, reminders: 0, errors: [] as string[], perCompetition: [] as { code: string; total: number; ownedReturned: number; matched: number; scheduled: number }[] };

  // schedule sync runs when fixtures lack dates or the last sync is >24h old (quota care)
  const { data: lastSync } = await db.from('config').select('value').eq('key', 'last_schedule_sync').single();
  const { count: undated } = await db.from('fixtures').select('id', { count: 'exact', head: true }).is('kickoff_utc', null);
  const lastMs = Date.parse((lastSync?.value as { at?: string })?.at ?? '2000-01-01');
  const doScheduleSync = (undated ?? 0) > 0 || nowMs - lastMs > 24 * 3600 * 1000;

  for (const code of FD_COMPS) {
    let results: NormalisedResult[];
    let total = 0;
    try {
      const fetched = await provider.listFixtures({ competitionCode: code, season: '2026' });
      results = fetched.results;
      total = fetched.total;
      await db.from('api_call_log').insert({ provider: 'football-data', endpoint: `listFixtures:${code}` });
    } catch (e) {
      summary.errors.push(`${code}: ${(e as Error).message}`);
      continue;
    }
    const roundFor = (r: NormalisedResult) =>
      code === 'UCL' ? normalizeRound(code, r.round) : 'League';
    const diag = { code, total, ownedReturned: results.length, matched: 0, scheduled: 0 };

    // schedule pass: date every owned-v-owned fixture (finished or future)
    if (doScheduleSync) {
      try {
        const sched = await provider.listSchedule({ competitionCode: code, season: '2026' });
        await db.from('api_call_log').insert({ provider: 'football-data', endpoint: `schedule:${code}` });
        for (const s of sched) {
          const sRound = code === 'UCL' ? 'League Phase' : 'League';
          // exact venue only: each leg is dated by its own provider match.
          // (Never OR both legs + maybeSingle: two rows make maybeSingle
          // return nothing, silently skipping every league pair.)
          const { data: fx, error: fxErr } = await db.from('fixtures').select('id,kickoff_utc,provider_fixture_id')
            .eq('competition_id', COMP_ID[code]).eq('round', sRound)
            .eq('home_club_id', s.homeClubId).eq('away_club_id', s.awayClubId)
            .maybeSingle();
          if (fxErr) throw new Error(`fixture lookup: ${fxErr.message}`);
          if (fx && (!fx.kickoff_utc || !fx.provider_fixture_id)) {
            await db.from('fixtures').update({ kickoff_utc: s.kickoffUtc, provider_fixture_id: s.providerFixtureId }).eq('id', (fx as { id: string }).id);
            diag.scheduled++;
            summary.synced++;
          }
        }
      } catch (e) {
        summary.errors.push(`schedule ${code}: ${(e as Error).message}`);
      }
    }

    for (const r of results) {
      // match to our fixture row (named order, else reverse)
      const compId = COMP_ID[code];
      const round = roundFor(r);
      const { data: exact } = await db.from('fixtures').select('*')
        .eq('competition_id', compId).eq('round', round)
        .eq('home_club_id', r.homeClubId).eq('away_club_id', r.awayClubId).maybeSingle();
      let fixture = exact;
      let swapped = false;
      if (!fixture) {
        const { data: rev } = await db.from('fixtures').select('*')
          .eq('competition_id', compId).eq('round', round)
          .eq('home_club_id', r.awayClubId).eq('away_club_id', r.homeClubId).maybeSingle();
        fixture = rev;
        swapped = true;
      }
      if (!fixture) continue; // not one of our 69 (cup ties join once drawn)
      diag.matched++;
      // sync date + provider id
      if (!fixture.kickoff_utc || !fixture.provider_fixture_id) {
        await db.from('fixtures').update({ kickoff_utc: r.kickoffUtc, provider_fixture_id: r.providerFixtureId ?? null }).eq('id', fixture.id);
        summary.synced++;
      }
      if (fixture.status !== 'SCHEDULED') continue;
      // finished? terminal status AND past kickoff+100min (provider may lag)
      const terminal = r.terminalStatus === 'FT' || r.terminalStatus === 'AET' || r.terminalStatus === 'PEN';
      if (!terminal) continue;
      if (Date.parse(r.kickoffUtc) + 100 * 60 * 1000 > nowMs) continue;

      const homeGoals = swapped ? r.scoreAt90.away : r.scoreAt90.home;
      const awayGoals = swapped ? r.scoreAt90.home : r.scoreAt90.away;
      void homeGoals; void awayGoals;
      const proposal = scoreSingleFixture({
        ...r,
        round,
        homeClubId: fixture.home_club_id,
        awayClubId: fixture.away_club_id,
        scoreAt90: swapped ? { home: r.scoreAt90.away, away: r.scoreAt90.home } : r.scoreAt90,
      });
      if (proposal.kind === 'MANUAL_REVIEW') {
        await db.from('pending_approvals').insert({
          subject_type: 'FIXTURE', subject_id: fixture.id,
          proposed_payload: { source: 'poller', review: true },
          computed_transfers: [], status: 'PENDING',
          review_reason: proposal.reviewReason, single_source: true,
        });
        await fanOutText(db, 'manual_review_needed', `Manual review needed: ${fixture.home_club_id} v ${fixture.away_club_id} (${code}). ${proposal.reviewReason}`);
        continue;
      }
      if (proposal.kind === 'IGNORED_UNOWNED' || proposal.kind.startsWith('REJECTED')) continue;

      if (proposal.kind === 'SAME_OWNER') {
        // ₹0, no W/L/D, no ledger — safe to log directly (nothing to approve)
        await db.from('results').insert({
          fixture_id: fixture.id, h90: r.scoreAt90.home, a90: r.scoreAt90.away,
          terminal_status: r.terminalStatus, provider: 'football-data',
          raw_payload: { providerFixtureId: r.providerFixtureId },
        });
        await db.from('fixtures').update({ status: 'RECORDED' }).eq('id', fixture.id);
        await db.from('audit_log').insert({ actor_id: null, action: 'AUTO_LOG_SAME_OWNER', subject_type: 'FIXTURE', subject_id: fixture.id });
        summary.autoLogged++;
        continue;
      }

      // money or W/L/D at stake → proposal + Archit one-tap buttons
      const { data: approval } = await db.from('pending_approvals').insert({
        subject_type: 'FIXTURE', subject_id: fixture.id,
        proposed_payload: {
          source: 'poller', line: null,
          homeClubId: fixture.home_club_id, awayClubId: fixture.away_club_id,
          homeOwner: ownerOf(fixture.home_club_id), awayOwner: ownerOf(fixture.away_club_id),
          competitionCode: code, round,
          score: { h: swapped ? r.scoreAt90.away : r.scoreAt90.home, a: swapped ? r.scoreAt90.home : r.scoreAt90.away },
          winnerPlayer: proposal.winnerPlayer, loserPlayer: proposal.loserPlayer,
          isDraw: proposal.isDraw, margin: proposal.margin, amount: proposal.amount,
          kind: proposal.kind, terminalStatus: r.terminalStatus,
        },
        computed_transfers: proposal.transfers.map((t) => ({
          ...t, fixture_id: fixture.id,
          description: `${fixture.home_club_id} v ${fixture.away_club_id} (${code})`,
        })),
        status: 'PENDING', single_source: true,
      }).select('id').single();
      if (!approval) continue;
      await db.from('fixtures').update({ status: 'PENDING_APPROVAL' }).eq('id', fixture.id);
      summary.proposed++;

      const p = proposal;
      const scoreline = `${fixture.home_club_id} ${swapped ? r.scoreAt90.away : r.scoreAt90.home}-${swapped ? r.scoreAt90.home : r.scoreAt90.away} ${fixture.away_club_id}`;
      const what = p.isDraw ? 'Draw — ₹0' : `₹${p.amount} ${p.winnerPlayer} ← ${p.loserPlayer}`;
      // direct Telegram message to Archit only, with inline Approve/Reject buttons
      const { TelegramAdapter } = await import('@/lib/notify/channels');
      const tg = process.env.TELEGRAM_BOT_TOKEN ? new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN) : null;
      const { data: archit } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
      if (tg && archit?.telegram_chat_id) {
        try {
          const sent = await tg.send(archit.telegram_chat_id as string, 'result_approval_request', {
            text: `${code}: ${scoreline}\n${what} · ${r.terminalStatus} · single source`,
            buttons: [
              { id: `approve:${approval.id}`, title: 'Approve' },
              { id: `reject:${approval.id}`, title: 'Reject' },
            ],
          });
          await db.from('pending_approvals').update({ provider_message_id: sent.messageId }).eq('id', approval.id);
        } catch (e) {
          summary.errors.push(`notify ${approval.id}: ${(e as Error).message}`);
        }
      }
    }
    summary.perCompetition.push(diag);
  }
  if (doScheduleSync) {
    await db.from('config').upsert({ key: 'last_schedule_sync', value: { at: new Date().toISOString() } }, { onConflict: 'key' });
  }

  // 24h reminders — fully automatic
  const { data: sched } = await db.from('fixtures').select('id,status,kickoff_utc,reminder_sent_at,home_club_id,away_club_id,competition_id').eq('status', 'SCHEDULED');
  for (const id of dueReminders((sched ?? []) as { id: string; status: string; kickoff_utc: string | null; reminder_sent_at: string | null }[], nowMs)) {
    const f = (sched ?? []).find((x: { id: string }) => x.id === id) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string };
    const when = new Date(f.kickoff_utc).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    await fanOutText(db, 'fixture_reminder', `⏰ Tomorrow: ${f.home_club_id} v ${f.away_club_id} (${f.competition_id}) — ${when} IST. Money on the line.`);
    await db.from('fixtures').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id);
    summary.reminders++;
  }

  return NextResponse.json({ ok: true, ...summary });
}
