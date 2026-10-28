// Banker picks. One a week, by DM, one tap.
//
// Offered on Sunday night alongside the roundup, so the week's fixtures are
// known and nobody has to remember to ask. A pick can be changed right up
// until that fixture kicks off; after that it is settled with everything else.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPlayer, linkedPlayers } from '@/lib/notify/send';
import { buildBankerOffer } from '@/lib/notify/format';
import { weekStartIST } from '@/lib/predictions/score';

const istDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const istClock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

export interface BankerFixture {
  id: string; home_club_id: string; away_club_id: string; kickoff_utc: string;
}

/** DM every linked player the week's fixtures, one button each. */
export async function offerBankers(db: SupabaseClient, nowMs = Date.now()): Promise<number> {
  const week = weekStartIST(nowMs);
  const { data: fx } = await db.from('fixtures')
    .select('id,home_club_id,away_club_id,kickoff_utc')
    .eq('status', 'SCHEDULED').eq('is_same_owner', false)
    .gt('kickoff_utc', new Date(nowMs).toISOString())
    .lte('kickoff_utc', new Date(nowMs + 7 * 864e5).toISOString())
    .order('kickoff_utc');

  const fixtures = (fx ?? []) as BankerFixture[];
  if (!fixtures.length) return 0;

  const { data: clubs } = await db.from('clubs').select('id,name');
  const nameOf = (id: string) =>
    ((clubs ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;

  // Already picked this week? Say so rather than pretending it is open.
  const { data: picked } = await db.from('prediction_bankers')
    .select('player_id,fixture_id').eq('week_start', week);
  const already = new Map(((picked ?? []) as { player_id: string; fixture_id: string }[])
    .map((r) => [r.player_id, r.fixture_id]));

  const rows = fixtures.slice(0, 8).map((f) => ({
    id: f.id,
    label: `${nameOf(f.home_club_id)} v ${nameOf(f.away_club_id)}`,
    when: `${istDay.format(new Date(f.kickoff_utc))}, ${istClock.format(new Date(f.kickoff_utc))}`,
  }));

  let sent = 0;
  for (const p of await linkedPlayers(db)) {
    const current = already.get(p.id);
    const text = buildBankerOffer(
      rows,
      current ? rows.find((r) => r.id === current)?.label ?? 'a fixture' : null,
    );
    const keyboard = rows.map((r) => [{ text: r.label, callback_data: `banker:${r.id}` }]);
    if (await sendPlayer(db, p.id, 'banker_offer', text, keyboard)) sent++;
  }
  return sent;
}

/**
 * Record a pick. Refuses a fixture that has already kicked off, and replaces
 * any earlier pick for the same week.
 */
export async function recordBanker(
  db: SupabaseClient,
  playerId: string,
  fixtureId: string,
  nowMs = Date.now(),
): Promise<{ ok: boolean; message: string }> {
  const { data: f } = await db.from('fixtures')
    .select('id,home_club_id,away_club_id,kickoff_utc,status,is_same_owner')
    .eq('id', fixtureId).maybeSingle();
  const fixture = f as (BankerFixture & { status: string; is_same_owner: boolean }) | null;
  if (!fixture) return { ok: false, message: 'That fixture is gone.' };
  if (fixture.status !== 'SCHEDULED' || Date.parse(fixture.kickoff_utc) <= nowMs) {
    return { ok: false, message: 'That one has already kicked off.' };
  }

  // The week of the FIXTURE, not of the tap. A pick made on Sunday night for
  // a Saturday match has to land in the week that match belongs to.
  const week = weekStartIST(Date.parse(fixture.kickoff_utc));
  await db.from('prediction_bankers').upsert(
    { week_start: week, player_id: playerId, fixture_id: fixtureId, picked_at: new Date(nowMs).toISOString() },
    { onConflict: 'week_start,player_id' },
  );

  const { data: clubs } = await db.from('clubs').select('id,name')
    .in('id', [fixture.home_club_id, fixture.away_club_id]);
  const nameOf = (id: string) =>
    ((clubs ?? []) as { id: string; name: string }[]).find((c) => c.id === id)?.name ?? id;

  return {
    ok: true,
    message: `Banker set: ${nameOf(fixture.home_club_id)} v ${nameOf(fixture.away_club_id)}. Double or nothing.`,
  };
}

/** Who bankered this fixture. Used at settlement. */
export async function bankersFor(db: SupabaseClient, fixtureId: string): Promise<Set<string>> {
  const { data } = await db.from('prediction_bankers').select('player_id').eq('fixture_id', fixtureId);
  return new Set(((data ?? []) as { player_id: string }[]).map((r) => r.player_id));
}
