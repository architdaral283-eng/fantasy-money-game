import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { FootballDataOrgProvider, normalizeRound } from '@/lib/providers/football-data';
import { mappingConfirmed } from '@/lib/providers/team-ids';
import { scoreSingleFixture, type NormalisedResult } from '@/lib/scoring/engine';
import { ownerOf } from '@/lib/domain/constants';
import { fanOutText } from '@/lib/notify/send';
import { dueReminders } from '@/lib/notify/send';
import { drainQueue, architAwake, sendGroup } from '@/lib/notify/quiet';

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
  const summary = { synced: 0, proposed: 0, autoWritten: 0, autoLogged: 0, reminders: 0, batched: false, errors: [] as string[], perCompetition: [] as { code: string; total: number; ownedReturned: number; matched: number; scheduled: number; skipped?: boolean }[] };

  // schedule sync runs when fixtures lack dates or the last sync is >24h old (quota care)
  const { data: lastSync } = await db.from('config').select('value').eq('key', 'last_schedule_sync').single();
  // one-offs never get provider dates — exclude them or sync runs every tick
  const { count: undated } = await db.from('fixtures').select('id', { count: 'exact', head: true })
    .is('kickoff_utc', null)
    .in('competition_id', ['epl', 'laliga', 'bundesliga', 'seriea', 'ucl']);
  const lastMs = Date.parse((lastSync?.value as { at?: string })?.at ?? '2000-01-01');
  const doScheduleSync = (undated ?? 0) > 0 || nowMs - lastMs > 24 * 3600 * 1000;

  // live window: only competitions with a fixture near kickoff get polled.
  // Anything finished is inside this window by the kickoff+100min rule.
  const { data: live } = await db.from('fixtures').select('competition_id,kickoff_utc')
    .eq('status', 'SCHEDULED')
    .gte('kickoff_utc', new Date(nowMs - 5 * 3600 * 1000).toISOString())
    .lte('kickoff_utc', new Date(nowMs + 15 * 60 * 1000).toISOString());
  const liveCodes = new Set(((live ?? []) as { competition_id: string }[]).map((f) => f.competition_id));
  const codeOf: Record<string, string> = { epl: 'EPL', laliga: 'LA_LIGA', bundesliga: 'BUNDESLIGA', seriea: 'SERIE_A', ucl: 'UCL' };
  const wanted = new Set([...liveCodes].map((c) => codeOf[c]).filter(Boolean));

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let firstCall = true;
  const callSpacing = async () => {
    if (firstCall) { firstCall = false; return; }
    await sleep(6500); // free tier: 10 req/min — stay well inside
  };

  for (const code of FD_COMPS) {
    // outside a live window with dates synced, skip the provider entirely
    if (!wanted.has(code) && !doScheduleSync) {
      summary.perCompetition.push({ code, total: 0, ownedReturned: 0, matched: 0, scheduled: 0, skipped: true });
      continue;
    }
    let results: NormalisedResult[];
    let total = 0;
    try {
      await callSpacing();
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
        await callSpacing();
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
          if (fx && (Date.parse((fx as { kickoff_utc: string | null }).kickoff_utc ?? '') !== Date.parse(s.kickoffUtc) || !(fx as { provider_fixture_id: string | null }).provider_fixture_id)) {
            const stored = Date.parse((fx as { kickoff_utc: string | null }).kickoff_utc ?? '');
            const moved = !!stored && stored !== Date.parse(s.kickoffUtc);
            await db.from('fixtures').update({
              kickoff_utc: new Date(s.kickoffUtc).toISOString(), provider_fixture_id: s.providerFixtureId,
              // rescheduled → reminders must fire again for the new time
              ...(moved ? { reminder_sent_at: null, pre_match_sent_at: null } : {}),
            }).eq('id', (fx as { id: string }).id);
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
        await db.from('fixtures').update({ kickoff_utc: new Date(r.kickoffUtc).toISOString(), provider_fixture_id: r.providerFixtureId ?? null }).eq('id', fixture.id);
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

      // money or W/L/D at stake → proposal. Amendment III: machine-verified
      // results auto-write; anything else (or any failure) falls back to Archit.
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

      const { requiresApproval } = await import('@/lib/entry/policy');
      const { data: amd3 } = await db.from('config').select('value').eq('key', 'amendment_3_auto_write').single();
      const autoOk = !requiresApproval('poller', (amd3?.value as { status?: string })?.status === 'ratified');
      if (autoOk) {
        try {
          const { approveProposal } = await import('@/lib/ledger/writer');
          const { refreshPin, fireRoast } = await import('@/app/api/webhook/telegram/route');
          await approveProposal(db, (approval as { id: string }).id, 'archit');
          summary.autoWritten++;
          const scoreline = `${fixture.home_club_id} ${swapped ? r.scoreAt90.away : r.scoreAt90.home}-${swapped ? r.scoreAt90.home : r.scoreAt90.away} ${fixture.away_club_id}`;
          await refreshPin(db);
          try {
            const pngRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app'}/api/og/standings`);
            const png = await pngRes.arrayBuffer();
            const { fanOutPhoto } = await import('@/lib/notify/send');
            await fanOutPhoto(db, 'result_recorded', `Recorded automatically. ${scoreline}. Standings attached.`, async () => png);
            const { sendGroupPhoto } = await import('@/lib/notify/quiet');
            await sendGroupPhoto(db, `Standings. ${scoreline}.`, async () => png);
          } catch { /* photo best-effort */ }
          const roast = await fireRoast(db, fixture.id, false).catch(() => null);
          if (roast) {
            const { sendGroup } = await import('@/lib/notify/quiet');
            await sendGroup(db, roast);
          }
          const { TelegramAdapter: TA } = await import('@/lib/notify/channels');
          const tat = process.env.TELEGRAM_BOT_TOKEN ? new TA(process.env.TELEGRAM_BOT_TOKEN) : null;
          const { data: archit2 } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
          if (tat && archit2?.telegram_chat_id) {
            await tat.send(archit2.telegram_chat_id as string, 'result_recorded', { text: `Recorded automatically. ${scoreline}.` }).catch(() => undefined);
          }
          continue;
        } catch (e) {
          summary.errors.push(`auto-write ${(approval as { id: string }).id} failed, left pending: ${(e as Error).message}`);
          // fall through to human notify below
        }
      }

      const p = proposal;
      const scoreline = `${fixture.home_club_id} ${swapped ? r.scoreAt90.away : r.scoreAt90.home}-${swapped ? r.scoreAt90.home : r.scoreAt90.away} ${fixture.away_club_id}`;
      const what = p.isDraw ? 'Draw. ₹0' : `₹${p.amount} ${p.winnerPlayer} takes it from ${p.loserPlayer}`;
      // single-source: no keyboard, force review. Batching: >5 pending sends one summary.
      const { count: pendN } = await db.from('pending_approvals').select('id', { count: 'exact', head: true }).eq('status', 'PENDING');
      const single = true; // football-data only in this loop; API-Football cross-check lands with cups
      if ((pendN ?? 0) > 5) {
        if (!summary.batched) {
          const { TelegramAdapter } = await import('@/lib/notify/channels');
          const tg = process.env.TELEGRAM_BOT_TOKEN ? new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN) : null;
          const { data: archit } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
          if (tg && archit?.telegram_chat_id && (await architAwake(db).catch(() => true))) {
            await tg.send(archit.telegram_chat_id as string, 'result_approval_request', {
              text: `${pendN} results waiting. Review all on the site.`,
            }).catch(() => undefined);
          }
          summary.batched = true;
        }
        continue;
      }
      // direct Telegram message to Archit only. Single-source: no keyboard, forced review.
      const { TelegramAdapter } = await import('@/lib/notify/channels');
      const tg = process.env.TELEGRAM_BOT_TOKEN ? new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN) : null;
      const { data: archit } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
      if (tg && archit?.telegram_chat_id) {
        try {
          const { data: bals } = await db.from('player_balances').select('id,net_inr');
          const net = new Map(((bals ?? []) as { id: string; net_inr: number }[]).map((b) => [b.id, Number(b.net_inr)]));
          for (const t of proposal.transfers) {
            net.set(t.from, (net.get(t.from) ?? 0) - t.amount);
            net.set(t.to, (net.get(t.to) ?? 0) + t.amount);
          }
          const after = ['archit', 'vedant', 'harshal', 'anmol']
            .map((p) => `${p} ${net.get(p) ?? 0 >= 0 ? '+' : '−'}₹${Math.abs(net.get(p) ?? 0).toLocaleString('en-IN')}`).join(' ');
          const sent = await tg.send(archit.telegram_chat_id as string, 'result_approval_request', {
            text: `${code}: ${scoreline}\n${what} · ${r.terminalStatus} · single source\nAfter: ${after}\nSingle source. Tap only if sure.`,
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

  // 24h reminders — group only, flag FIRST so a hiccup can never re-send
  const { data: sched } = await db.from('fixtures').select('id,status,kickoff_utc,reminder_sent_at,home_club_id,away_club_id,competition_id').eq('status', 'SCHEDULED');
  for (const id of dueReminders((sched ?? []) as { id: string; status: string; kickoff_utc: string | null; reminder_sent_at: string | null }[], nowMs)) {
    const f = (sched ?? []).find((x: { id: string }) => x.id === id) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string };
    const when = new Date(f.kickoff_utc).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    await db.from('fixtures').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id);
    const { data: clubs2 } = await db.from('clubs').select('id,name,owner_id');
    const cmap2 = new Map(((clubs2 ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
    const h2 = cmap2.get(f.home_club_id);
    const a2 = cmap2.get(f.away_club_id);
    const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dayLabel = dayFmt.format(new Date()) === dayFmt.format(new Date(f.kickoff_utc)) ? 'Today' : 'Tomorrow';
    await sendGroup(db, `${dayLabel}: ${h2?.name ?? f.home_club_id} v ${a2?.name ?? f.away_club_id} (${f.competition_id}), ${when} IST. ${h2?.owner_id ?? '?'} v ${a2?.owner_id ?? '?'}. ₹500, ₹1000 if 4+.`);
    summary.reminders++;
  }

  // release anything queued through quiet hours or the daily ceiling
  const drained = await drainQueue(db).catch(() => ({ released: 0 }));

  // 30-minute pre-match group warning — time-sensitive by definition, always immediate
  const { data: soon } = await db.from('fixtures').select('id,competition_id,home_club_id,away_club_id,kickoff_utc')
    .eq('status', 'SCHEDULED').is('pre_match_sent_at', null)
    .gt('kickoff_utc', new Date(nowMs).toISOString())
    .lte('kickoff_utc', new Date(nowMs + 35 * 60 * 1000).toISOString());
  let prematch = 0;
  if ((soon ?? []).length) {
    const { sendGroup } = await import('@/lib/notify/quiet');
    const { data: clubs } = await db.from('clubs').select('id,name,owner_id');
    const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
    for (const f of (soon ?? []) as { id: string; competition_id: string; home_club_id: string; away_club_id: string; kickoff_utc: string }[]) {
      const h = cmap.get(f.home_club_id);
      const a = cmap.get(f.away_club_id);
      const mins = Math.max(1, Math.ceil((Date.parse(f.kickoff_utc) - Date.now()) / 60000));
      await db.from('fixtures').update({ pre_match_sent_at: new Date().toISOString() }).eq('id', f.id);
      await sendGroup(db, `${h?.name ?? f.home_club_id} v ${a?.name ?? f.away_club_id} kicks off in ${mins} minutes (${f.competition_id}). ${h?.owner_id ?? '?'} v ${a?.owner_id ?? '?'}. ₹500, ₹1000 if 4+.`, { urgent: true });
      prematch++;
    }
  }

  return NextResponse.json({ ok: true, ...summary, digestReleased: drained.released, prematch });
}
