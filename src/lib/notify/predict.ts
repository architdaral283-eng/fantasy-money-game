// The prediction league's moving parts: open a poll with the reminder, close
// it at kickoff, settle it when the result lands.
//
// Everything here is IO. The rules live in @/lib/predictions/score and are
// tested there.

import type { SupabaseClient } from '@supabase/supabase-js';
import { groupId, sendPoll, stopPoll } from '@/lib/notify/send';
import { buildPredictionResult, buildPredictionTable, predictionLine, type PredictionStanding } from '@/lib/notify/format';
import {
  outcomeOf, scorePoll, leaderboard, missesSince, choiceToOutcome,
  HOME, AWAY, type ScoreRow,
} from '@/lib/predictions/score';
import { monthBounds } from '@/lib/awards/monthly';
import { PLAYERS } from '@/lib/stats/weekly';

interface PollRow { fixture_id: string; poll_id: string; chat_id: string; message_id: number; closed_at: string | null }

/** One poll per fixture, ever. Returns false when there already is one. */
export async function openPollFor(
  db: SupabaseClient,
  f: { id: string; home_club_id: string; away_club_id: string },
): Promise<boolean> {
  const { data: existing } = await db.from('prediction_polls').select('fixture_id').eq('fixture_id', f.id).maybeSingle();
  if (existing) return false;

  const gid = await groupId(db);
  if (!gid) return false;

  const { data: clubs } = await db.from('clubs').select('id,name').in('id', [f.home_club_id, f.away_club_id]);
  const nameOf = (id: string) =>
    ((clubs ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;
  const home = nameOf(f.home_club_id);
  const away = nameOf(f.away_club_id);

  // Option order is the contract: 0 home, 1 draw, 2 away. score.ts reads the
  // stored index and nothing re-derives it, so this must never be reordered.
  const sent = await sendPoll(gid, `${home} v ${away} — your call?`, [home, 'Draw', away]);
  if (!sent) return false;

  // Logged so the ceiling can see it. A poll is a message in the group like
  // any other, and it was previously counted as nothing at all.
  await db.from('notifications').insert({
    player_id: null, channel: 'telegram', template_key: 'poll',
    payload: { fixture: f.id }, status: 'SENT', provider_message_id: String(sent.messageId),
  }).then(() => undefined, () => undefined);

  const { error } = await db.from('prediction_polls').insert({
    fixture_id: f.id, poll_id: sent.pollId, chat_id: String(gid), message_id: sent.messageId,
  });
  // An orphaned poll is better than a duplicate one: leave it closed rather
  // than letting the next tick open a second.
  if (error) {
    await stopPoll(gid, sent.messageId);
    return false;
  }
  return true;
}

/** Stop voting. Called 30 minutes before kickoff. */
export async function closePollFor(db: SupabaseClient, fixtureId: string): Promise<boolean> {
  const { data } = await db.from('prediction_polls').select('*').eq('fixture_id', fixtureId).maybeSingle();
  const row = data as PollRow | null;
  if (!row || row.closed_at) return false;
  const ok = await stopPoll(row.chat_id, row.message_id);
  if (ok) await db.from('prediction_polls').update({ closed_at: new Date().toISOString() }).eq('fixture_id', fixtureId);
  return ok;
}

/**
 * Settle one fixture's poll and return the line to append to the result
 * message. Null when there was no poll or nobody voted.
 */
export async function settlePredictions(db: SupabaseClient, fixtureId: string): Promise<string | null> {
  const [{ data: pollRow }, { data: res }, { data: fx }] = await Promise.all([
    db.from('prediction_polls').select('*').eq('fixture_id', fixtureId).maybeSingle(),
    db.from('results').select('h90,a90').eq('fixture_id', fixtureId).maybeSingle(),
    db.from('fixtures').select('id,home_club_id,away_club_id,kickoff_utc').eq('id', fixtureId).maybeSingle(),
  ]);
  const poll = pollRow as PollRow | null;
  if (!poll || !res || !fx) return null;

  const R = res as { h90: number; a90: number };
  const F = fx as { home_club_id: string; away_club_id: string; kickoff_utc: string | null };

  const { data: votes } = await db.from('predictions')
    .select('player_id,choice,answered_at').eq('poll_id', poll.poll_id);
  const cast = (votes ?? []) as { player_id: string; choice: number; answered_at: string }[];
  if (!cast.length) {
    await closePollFor(db, fixtureId);
    return null;
  }

  const actual = outcomeOf(Number(R.h90), Number(R.a90));
  const kickoff = F.kickoff_utc ? Date.parse(F.kickoff_utc) : NaN;
  const scored = scorePoll(cast, actual, kickoff);
  if (!scored.length) {
    await closePollFor(db, fixtureId);
    return null;
  }

  await db.from('prediction_scores').upsert(
    scored.map((s) => ({
      fixture_id: fixtureId, player_id: s.player, choice: s.choice,
      correct: s.correct, points: s.points,
    })),
    { onConflict: 'fixture_id,player_id' },
  );
  await closePollFor(db, fixtureId);

  // Counts read AFTER the write, so "fourth time this month" includes this one.
  const monthStart = monthBounds(Date.now()).to;
  const [{ data: all }, { data: clubs }, { data: bal }] = await Promise.all([
    db.from('prediction_scores').select('player_id,points,correct,scored_at'),
    db.from('clubs').select('id,name').in('id', [F.home_club_id, F.away_club_id]),
    db.from('player_balances').select('id,name'),
  ]);
  const scoreRows = (all ?? []) as ScoreRow[];
  const nameOf = (id: string) =>
    ((bal ?? []) as { id: string; name: string }[]).find((p) => p.id === id)?.name ?? id;
  const clubName = (id: string) =>
    ((clubs ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;
  const backed = (choice: number) =>
    choice === HOME ? clubName(F.home_club_id) : choice === AWAY ? clubName(F.away_club_id) : 'a draw';

  return buildPredictionResult({
    hits: scored.filter((s) => s.correct).map((s) => nameOf(s.player)),
    misses: scored
      .filter((s) => !s.correct && choiceToOutcome(s.choice) !== null)
      .map((s) => ({
        name: nameOf(s.player),
        backed: backed(s.choice),
        nth: missesSince(scoreRows, s.player, monthStart),
      }))
      .sort((a, b) => b.nth - a.nth),
  });
}

async function standings(db: SupabaseClient): Promise<{ rows: PredictionStanding[]; settled: number }> {
  const [{ data: all }, { data: bal }] = await Promise.all([
    db.from('prediction_scores').select('player_id,points,correct,scored_at,fixture_id'),
    db.from('player_balances').select('id,name'),
  ]);
  const rows = (all ?? []) as (ScoreRow & { fixture_id: string })[];
  const nameOf = (id: string) =>
    ((bal ?? []) as { id: string; name: string }[]).find((p) => p.id === id)?.name ?? id;
  return {
    rows: leaderboard(rows, PLAYERS).map((r) => ({ ...r, name: nameOf(r.player) })),
    settled: new Set(rows.map((r) => r.fixture_id)).size,
  };
}

/** The /predictions table. */
export async function predictionTable(db: SupabaseClient): Promise<string> {
  const { rows, settled } = await standings(db);
  return buildPredictionTable(rows, settled);
}

/** One line of it for the Sunday roundup. */
export async function predictionSummary(db: SupabaseClient): Promise<string | null> {
  const { rows } = await standings(db);
  return predictionLine(rows);
}
