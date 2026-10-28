// The goal that decided the money, to the two people it happened to. Reads
// the recorded result rather than taking the poller's word for it, so manual
// entries and corrections get the same treatment.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildNearMiss } from '@/lib/notify/format';
import { sendPlayer } from '@/lib/notify/send';
import { nearMiss, deltaFor, type NearMissGoal } from '@/lib/stats/near-miss';

export async function nearMissDms(db: SupabaseClient, fixtureId: string): Promise<number> {
  const [{ data: fx }, { data: r }, { data: clubs }, { data: players }] = await Promise.all([
    db.from('fixtures').select('id,home_club_id,away_club_id').eq('id', fixtureId).maybeSingle(),
    db.from('results').select('h90,a90,raw_payload').eq('fixture_id', fixtureId).maybeSingle(),
    db.from('clubs').select('id,name,owner_id'),
    db.from('players').select('id,name'),
  ]);
  if (!fx || !r) return 0;

  const F = fx as { home_club_id: string; away_club_id: string };
  const R = r as { h90: number; a90: number; raw_payload?: { goals?: NearMissGoal[] } | null };
  const goals = R.raw_payload?.goals ?? [];
  if (!goals.length) return 0;

  const m = nearMiss({
    goals, h90: Number(R.h90), a90: Number(R.a90),
    homeClubId: F.home_club_id, awayClubId: F.away_club_id,
  });
  if (!m) return 0;

  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const pmap = new Map(((players ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const homeOwner = cmap.get(F.home_club_id)?.owner_id;
  const awayOwner = cmap.get(F.away_club_id)?.owner_id;
  // One owner on both sides: no money moved, so no goal decided any.
  if (!homeOwner || !awayOwner || homeOwner === awayOwner) return 0;

  let sent = 0;
  for (const isHome of [true, false]) {
    const me = isHome ? homeOwner : awayOwner;
    const them = isHome ? awayOwner : homeOwner;
    const delta = deltaFor(m, isHome, Number(R.h90), Number(R.a90));
    if (delta === 0) continue;
    const text = buildNearMiss({
      home: cmap.get(F.home_club_id)?.name ?? F.home_club_id,
      away: cmap.get(F.away_club_id)?.name ?? F.away_club_id,
      h90: Number(R.h90), a90: Number(R.a90),
      minute: m.minute, scorer: m.player, before: m.before, kind: m.kind,
      delta, opponent: pmap.get(them) ?? them,
    });
    if (await sendPlayer(db, me, 'near_miss', text)) sent++;
  }
  return sent;
}
