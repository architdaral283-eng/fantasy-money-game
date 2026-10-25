import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { FootballDataOrgProvider, normalizeRound, isKnockoutRound } from '@/lib/providers/football-data';
import { mappingConfirmed } from '@/lib/providers/team-ids';
import { scoreSingleFixture, type NormalisedResult } from '@/lib/scoring/engine';
import { ownerOf } from '@/lib/domain/constants';
import { fanOutText, notifyArchitApproval } from '@/lib/notify/send';
import { dueReminders } from '@/lib/notify/send';
import { drainQueue, architAwake, sendGroup } from '@/lib/notify/quiet';
import { fixtureNotice, isTodayIST } from '@/lib/notify/fixture-notice';
import {
  espnScoreboard, espnDateOf, findMatch, toNormalised, goalsMatching,
  ESPN_ONLY_COMPS, ENGINE_CODE, espnRound, cupDates, espnCupSweep, type EspnMatch, type Goal,
} from '@/lib/providers/espn';

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
  const summary = { synced: 0, proposed: 0, autoWritten: 0, autoLogged: 0, reminders: 0, espnFallback: 0, batched: false, errors: [] as string[], perCompetition: [] as { code: string; total: number; ownedReturned: number; matched: number; scheduled: number; skipped?: boolean }[] };

  // Per-run reads that cannot change mid-run, memoised on first use so an idle
  // tick (no finished fixture, no reminder due) issues no extra query. A read
  // that errors is not cached, so the next caller retries exactly as before.
  let amd3Ratified: boolean | undefined;
  const amendment3Ratified = async (): Promise<boolean> => {
    if (amd3Ratified !== undefined) return amd3Ratified;
    const { data: amd3, error } = await db.from('config').select('value').eq('key', 'amendment_3_auto_write').single();
    const ratified = (amd3?.value as { status?: string })?.status === 'ratified';
    if (!error) amd3Ratified = ratified;
    return ratified;
  };
  let architChatIdCache: string | null | undefined;
  const architChatId = async (): Promise<string | null> => {
    if (architChatIdCache !== undefined) return architChatIdCache;
    const { data: archit, error } = await db.from('players').select('telegram_chat_id').eq('id', 'archit').single();
    const id = ((archit as { telegram_chat_id?: string | null } | null)?.telegram_chat_id) || null;
    if (!error) architChatIdCache = id;
    return id;
  };

  // schedule sync runs when fixtures lack dates or the last sync is >24h old (quota care)
  const { data: lastSync } = await db.from('config').select('value').eq('key', 'last_schedule_sync').single();
  // one-offs never get provider dates — exclude them or sync runs every tick
  const { count: undated } = await db.from('fixtures').select('id', { count: 'exact', head: true })
    .is('kickoff_utc', null)
    .in('competition_id', ['epl', 'laliga', 'bundesliga', 'seriea', 'ucl']);
  const lastMs = Date.parse((lastSync?.value as { at?: string })?.at ?? '2000-01-01');
  // ?sync=1 forces a full schedule + cup discovery pass on demand. The daily
  // gate exists to protect the 100-call API-Football quota, not to be absolute.
  const forceSync = new URL(req.url).searchParams.get('sync') === '1';
  const doScheduleSync = forceSync || (undated ?? 0) > 0 || nowMs - lastMs > 24 * 3600 * 1000;

  // live window: only competitions with a fixture near kickoff get polled.
  //
  // The lookback used to be 5 hours, on the assumption that a 5-minute cron
  // would always catch a finished fixture inside it. That assumption broke on
  // 24 Oct 2026: GitHub throttled the schedule to ~3 runs/day, football-data's
  // free tier had not marked Aston Villa 2-1 Man City as FT when the single
  // in-window poll ran 53 min after full time, and by the next poll the fixture
  // had aged past now-5h. Its competition stopped being polled, so the result
  // was never recorded and could never be recovered automatically.
  //
  // A SCHEDULED fixture whose kickoff has passed is BY DEFINITION unrecorded
  // and still needs attention, so the lookback is now 7 days. This only widens
  // which competitions get polled (<=5 calls per tick), and it self-limits:
  // once a fixture is RECORDED it leaves the window, and anything older than a
  // week is a human problem (/report), not a polling one.
  const { data: live } = await db.from('fixtures').select('competition_id,kickoff_utc')
    .eq('status', 'SCHEDULED')
    .gte('kickoff_utc', new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString())
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
          // Use the provider's ACTUAL stage. This used to be hardcoded to
          // 'League Phase' for UCL, so a tie drawn after the seed ran (every
          // knockout round: playoff, R16, QF, SF, final) could never be matched
          // and — because the branch below only UPDATEs — was never created
          // either. UCL pays 2000 a fixture; a missed R16 tie is a 2000 hole.
          const sRound = normalizeRound(code, s.stage);
          // exact venue only: each leg is dated by its own provider match.
          // (Never OR both legs + maybeSingle: two rows make maybeSingle
          // return nothing, silently skipping every league pair.)
          const { data: fx, error: fxErr } = await db.from('fixtures').select('id,kickoff_utc,provider_fixture_id')
            .eq('competition_id', COMP_ID[code]).eq('round', sRound)
            .eq('home_club_id', s.homeClubId).eq('away_club_id', s.awayClubId)
            .maybeSingle();
          if (fxErr) throw new Error(`fixture lookup: ${fxErr.message}`);

          // CREATE a fixture the seed never knew about. listSchedule already
          // filters to owned-v-owned (reverseLookup returns null otherwise),
          // so anything here is in scope. The UNIQUE (competition_id, round,
          // home, away) constraint makes a double insert impossible.
          if (!fx) {
            const sameOwner = ownerOf(s.homeClubId) === ownerOf(s.awayClubId);
            const { error: insErr } = await db.from('fixtures').insert({
              competition_id: COMP_ID[code], round: sRound,
              home_club_id: s.homeClubId, away_club_id: s.awayClubId,
              kickoff_utc: new Date(s.kickoffUtc).toISOString(),
              provider_fixture_id: s.providerFixtureId,
              status: 'SCHEDULED', is_same_owner: sameOwner,
            });
            if (insErr && !/duplicate key/i.test(insErr.message)) {
              summary.errors.push(`insert ${code} ${sRound} ${s.homeClubId} v ${s.awayClubId}: ${insErr.message}`);
            } else if (!insErr) {
              diag.scheduled++; summary.synced++;
              const { sendGroup } = await import('@/lib/notify/quiet');
              await sendGroup(db, await fixtureNotice(db, {
                home_club_id: s.homeClubId, away_club_id: s.awayClubId,
                competition_id: COMP_ID[code], kickoff_utc: s.kickoffUtc ? new Date(s.kickoffUtc).toISOString() : null, round: sRound,
              }, 'drawn') + (isKnockoutRound(sRound) ? '\n\nKnockout tie. The result goes to approval, not auto-write.' : ''));
            }
            continue;
          }

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

    // ——— ESPN: late results + goal scorers ———
    // Every fixture of ours in this competition that kicked off 105+ minutes
    // ago and is still SCHEDULED. Where football-data has already returned it
    // as finished, ESPN only contributes the scorers. Where it has NOT — its
    // free tier sat on Napoli 3–3 Roma for five hours — ESPN's completed
    // full-time result joins `results` and goes through exactly the same
    // scoring and approval path below. One ESPN call per league per date.
    const goalsByFixture = new Map<string, Goal[]>();
    try {
      const espnCache = new Map<string, Promise<EspnMatch[]>>();
      const espnFor = (iso: string) => {
        const key = espnDateOf(iso);
        if (!espnCache.has(key)) espnCache.set(key, espnScoreboard(COMP_ID[code], key));
        return espnCache.get(key)!;
      };
      const { data: due } = await db.from('fixtures').select('id,home_club_id,away_club_id,kickoff_utc,round')
        .eq('competition_id', COMP_ID[code]).eq('status', 'SCHEDULED')
        .lt('kickoff_utc', new Date(nowMs - 105 * 60 * 1000).toISOString())
        .gte('kickoff_utc', new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString());
      for (const f of (due ?? []) as { id: string; home_club_id: string; away_club_id: string; kickoff_utc: string; round: string | null }[]) {
        const m = findMatch(await espnFor(f.kickoff_utc), f.home_club_id, f.away_club_id, f.kickoff_utc);
        if (!m) continue;
        goalsByFixture.set(f.id, m.goals);
        const fdHasIt = results.some((r) =>
          new Set([r.homeClubId, r.awayClubId, f.home_club_id, f.away_club_id]).size === 2
          && Math.abs(Date.parse(r.kickoffUtc) - Date.parse(f.kickoff_utc)) < 36 * 3600 * 1000);
        if (fdHasIt) continue;
        const n = toNormalised(m, code, f.round ?? 'League');
        if (n) { results.push(n); summary.espnFallback++; }
      }
    } catch (e) {
      summary.errors.push(`espn ${code}: ${(e as Error).message}`);
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
      if (r.provider !== 'espn' && (!fixture.kickoff_utc || !fixture.provider_fixture_id)) {
        await db.from('fixtures').update({ kickoff_utc: new Date(r.kickoffUtc).toISOString(), provider_fixture_id: r.providerFixtureId ?? null }).eq('id', fixture.id);
        summary.synced++;
      }
      if (fixture.status !== 'SCHEDULED') {
        // ESPN wrote it first; now football-data has caught up. If the two
        // disagree, Archit hears about it once. Nothing is changed
        // automatically: the ledger is append-only and /correct exists.
        if (fixture.status === 'RECORDED' && r.provider !== 'espn' && (r.terminalStatus === 'FT' || r.terminalStatus === 'AET' || r.terminalStatus === 'PEN')
          && Date.parse(r.kickoffUtc) > nowMs - 7 * 24 * 3600 * 1000) {
          try {
            const { data: rec } = await db.from('results').select('h90,a90,raw_payload').eq('fixture_id', fixture.id).maybeSingle();
            const recP = (rec as { raw_payload?: { provider?: string } } | null)?.raw_payload;
            const fdH = swapped ? r.scoreAt90.away : r.scoreAt90.home;
            const fdA = swapped ? r.scoreAt90.home : r.scoreAt90.away;
            const R0 = rec as { h90: number; a90: number } | null;
            if (R0 && recP?.provider === 'espn' && (R0.h90 !== fdH || R0.a90 !== fdA)) {
              const key = `xcheck:${fixture.id}`;
              const { data: seen } = await db.from('config').select('key').eq('key', key).maybeSingle();
              if (!seen) {
                await db.from('config').insert({ key, value: { espn: [R0.h90, R0.a90], footballData: [fdH, fdA], at: new Date().toISOString() } });
                const { TelegramAdapter: TX } = await import('@/lib/notify/channels');
                const ac = await architChatId();
                if (process.env.TELEGRAM_BOT_TOKEN && ac) {
                  await new TX(process.env.TELEGRAM_BOT_TOKEN).send(ac, 'result_mismatch', {
                    text: `Score mismatch: ${fixture.home_club_id} v ${fixture.away_club_id}. Recorded ${R0.h90}–${R0.a90} from ESPN; football-data now says ${fdH}–${fdA}. Check it, and /correct if ESPN was wrong.`,
                  }).catch(() => undefined);
                }
              }
            }
          } catch (e) {
            summary.errors.push(`cross-check ${fixture.id}: ${(e as Error).message}`);
          }
        }
        continue;
      }
      // finished? terminal status AND past kickoff+100min (provider may lag)
      const terminal = r.terminalStatus === 'FT' || r.terminalStatus === 'AET' || r.terminalStatus === 'PEN';
      if (!terminal) continue;
      if (Date.parse(r.kickoffUtc) + 100 * 60 * 1000 > nowMs) continue;

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
          terminal_status: r.terminalStatus, provider: r.provider ?? 'football-data',
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
          provider: r.provider ?? 'football-data',
          // scorers are display-only; kept only if they add up to the score being written
          goals: goalsMatching(
            goalsByFixture.get(fixture.id) ?? [],
            fixture.home_club_id, swapped ? r.scoreAt90.away : r.scoreAt90.home,
            fixture.away_club_id, swapped ? r.scoreAt90.home : r.scoreAt90.away,
          ),
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
      // Amendment III auto-writes machine-verified results. Knockout ties are
      // deliberately excluded: two-legged aggregation (and away goals, and
      // extra time) is an unresolved rules question in the constitution, and
      // guessing it writes a wrong number into an append-only ledger. These go
      // to the Commissioner instead.
      const knockout = isKnockoutRound(String((fixture as { round?: string }).round ?? ''));
      const autoOk = !knockout && !requiresApproval('poller', await amendment3Ratified());
      if (autoOk) {
        try {
          const { approveProposal } = await import('@/lib/ledger/writer');
          const { refreshPin, fireRoast } = await import('@/app/api/webhook/telegram/route');
          await approveProposal(db, (approval as { id: string }).id, 'archit');
          summary.autoWritten++;
          await refreshPin(db);

          // ORDER MATTERS. The result + taunt goes FIRST, then the standings
          // photo immediately after it. It used to be the other way round, so
          // the group saw a bare table and then the text explaining it. Nobody
          // reads the pinned message, which is why the photo is posted inline.
          const roast = await fireRoast(db, fixture.id, false).catch(() => null);
          if (roast) {
            const { sendGroup } = await import('@/lib/notify/quiet');
            await sendGroup(db, roast);
          }
          try {
            const pngRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app'}/api/og/standings`);
            if (!pngRes.ok) throw new Error(`og/standings HTTP ${pngRes.status}`);
            const png = await pngRes.arrayBuffer();
            if (png.byteLength < 1000) throw new Error(`og/standings returned ${png.byteLength} bytes`);
            const { fanOutPhoto } = await import('@/lib/notify/send');
            await fanOutPhoto(db, 'result_recorded', 'Standings after that result.', async () => png);
            const { sendGroupPhoto } = await import('@/lib/notify/quiet');
            // caption left empty: the result message above already has the score,
            // and the old caption printed raw club ids ("aston-villa 2-1 man-city")
            await sendGroupPhoto(db, '', async () => png);
          } catch (e) {
            // was a silent `catch {}`, which hid a broken standings image for weeks
            summary.errors.push(`standings photo failed for ${fixture.id}: ${(e as Error).message}`);
          }
          const { TelegramAdapter: TA } = await import('@/lib/notify/channels');
          const tat = process.env.TELEGRAM_BOT_TOKEN ? new TA(process.env.TELEGRAM_BOT_TOKEN) : null;
          const architChat = await architChatId();
          if (tat && architChat) {
            const { data: cn } = await db.from('clubs').select('id,name').in('id', [fixture.home_club_id, fixture.away_club_id]);
            const nm = new Map(((cn ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
            const hs = swapped ? r.scoreAt90.away : r.scoreAt90.home;
            const as = swapped ? r.scoreAt90.home : r.scoreAt90.away;
            const via = r.provider === 'espn' ? ' (from ESPN — football-data had not confirmed it)' : '';
            await tat.send(architChat, 'result_recorded', {
              text: `Recorded automatically: ${nm.get(fixture.home_club_id) ?? fixture.home_club_id} ${hs}–${as} ${nm.get(fixture.away_club_id) ?? fixture.away_club_id}${via}.`,
            }).catch(() => undefined);
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
      // football-data only in this loop (single source); API-Football cross-check lands with cups
      if ((pendN ?? 0) > 5) {
        if (!summary.batched) {
          const { TelegramAdapter } = await import('@/lib/notify/channels');
          const tg = process.env.TELEGRAM_BOT_TOKEN ? new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN) : null;
          const architChat = await architChatId();
          if (tg && architChat && (await architAwake(db).catch(() => true))) {
            await tg.send(architChat, 'result_approval_request', {
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
      const architChat = await architChatId();
      if (tg && architChat) {
        try {
          const { data: bals } = await db.from('player_balances').select('id,net_inr');
          const net = new Map(((bals ?? []) as { id: string; net_inr: number }[]).map((b) => [b.id, Number(b.net_inr)]));
          for (const t of proposal.transfers) {
            net.set(t.from, (net.get(t.from) ?? 0) - t.amount);
            net.set(t.to, (net.get(t.to) ?? 0) + t.amount);
          }
          const after = ['archit', 'vedant', 'harshal', 'anmol']
            .map((p) => `${p} ${(net.get(p) ?? 0) >= 0 ? '+' : '−'}₹${Math.abs(net.get(p) ?? 0).toLocaleString('en-IN')}`).join(' ');
          const sent = await tg.send(architChat, 'result_approval_request', {
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

  // ── Domestic cups via API-Football ────────────────────────────────────────
  // football-data's free tier is 12 competitions and carries NONE of the four
  // domestic cups, which is why every cup in domain/constants has
  // fdOrgCode: null. API-Football does cover them, team ids for all 16 clubs
  // are already mapped, and the adapter was written but never wired in.
  //
  // SCOPE: this discovers and dates cup ties so they appear on the site and
  // get a kickoff reminder. It does NOT auto-record cup results — scoring a
  // two-legged cup tie is the same unresolved rules question as the UCL
  // knockouts, so results stay on /report, which the constitution already
  // specifies for cups.
  //
  // ——— cups: ESPN is the only source ———
  // football-data's free tier carries no domestic cup at all, so without this
  // an FA Cup / Copa del Rey / Coppa Italia / DFB-Pokal tie between two of the
  // sixteen clubs would never appear and never be recorded.
  //
  // One pass does both jobs for each cup: it inserts ties that have been drawn
  // (announcing each in the group) and turns finished ones into proposals.
  // Every cup tie is a knockout, so nothing here is ever auto-written — the
  // knockout gate below routes them all to the Commissioner's Approve button.
  // Extra time and penalties are read from ESPN's goal list; anything that
  // does not add up is left alone rather than guessed at.
  //
  // Dates are only scanned on the daily schedule sync. Otherwise this is one
  // undated call per cup (ESPN's current round), which is what catches a
  // result on the day it is played.
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
        // Our row for this tie, in either venue order.
        const { data: rows } = await db.from('fixtures').select('id,round,status,kickoff_utc,home_club_id,away_club_id')
          .eq('competition_id', compId)
          .in('home_club_id', [m.homeClubId, m.awayClubId])
          .in('away_club_id', [m.homeClubId, m.awayClubId]);
        let fx = ((rows ?? []) as { id: string; round: string; status: string; kickoff_utc: string | null; home_club_id: string; away_club_id: string }[])
          .find((f) => Math.abs(Date.parse(f.kickoff_utc ?? '') - Date.parse(m.kickoffUtc)) < 36 * 3600 * 1000)
          ?? ((rows ?? []) as { id: string; round: string; status: string; kickoff_utc: string | null; home_club_id: string; away_club_id: string }[])
            .find((f) => f.round === round);

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
        } else if (fx.kickoff_utc && Date.parse(fx.kickoff_utc) !== Date.parse(m.kickoffUtc) && fx.status === 'SCHEDULED') {
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

  // 24h reminders — group only, flag FIRST so a hiccup can never re-send
  const { data: sched } = await db.from('fixtures').select('id,status,kickoff_utc,reminder_sent_at,home_club_id,away_club_id,competition_id,round').eq('status', 'SCHEDULED');
  for (const id of dueReminders((sched ?? []) as { id: string; status: string; kickoff_utc: string | null; reminder_sent_at: string | null }[], nowMs)) {
    const f = (sched ?? []).find((x: { id: string }) => x.id === id) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string; round?: string | null };
    await db.from('fixtures').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id);
    await sendGroup(db, await fixtureNotice(db, { ...f, id }, isTodayIST(f.kickoff_utc) ? 'today' : 'tomorrow'));
    summary.reminders++;
  }

  // release anything queued through quiet hours or the daily ceiling
  // Without a fetcher drainQueue skips queued photos forever, so a standings
  // image raised during quiet hours was never sent. Render it fresh at release.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasy-money-game.vercel.app';
  const drained = await drainQueue(db, async () => {
    const res = await fetch(`${appUrl}/api/og/standings`, { cache: 'no-store' });
    const png = await res.arrayBuffer();
    if (!res.ok || png.byteLength < 1000) throw new Error(`og/standings ${res.status}, ${png.byteLength} bytes`);
    return png;
  }).catch(() => ({ released: 0 }));

  // 30-minute pre-match group warning — time-sensitive by definition, always immediate
  const { data: soon } = await db.from('fixtures').select('id,competition_id,home_club_id,away_club_id,kickoff_utc,round')
    .eq('status', 'SCHEDULED').is('pre_match_sent_at', null)
    .gt('kickoff_utc', new Date(nowMs).toISOString())
    .lte('kickoff_utc', new Date(nowMs + 35 * 60 * 1000).toISOString());
  let prematch = 0;
  if ((soon ?? []).length) {
    const { sendGroup } = await import('@/lib/notify/quiet');
    for (const f of (soon ?? []) as { id: string; competition_id: string; home_club_id: string; away_club_id: string; kickoff_utc: string; round?: string | null }[]) {
      const mins = Math.max(1, Math.ceil((Date.parse(f.kickoff_utc) - Date.now()) / 60000));
      await db.from('fixtures').update({ pre_match_sent_at: new Date().toISOString() }).eq('id', f.id);
      await sendGroup(db, await fixtureNotice(db, f, 'prematch', mins), { urgent: true });
      prematch++;
    }
  }

  return NextResponse.json({ ok: true, ...summary, digestReleased: drained.released, prematch, cupsFound, cupResults, scheduleSync: doScheduleSync, forced: forceSync });
}
