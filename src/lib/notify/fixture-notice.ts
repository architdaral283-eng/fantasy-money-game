// Builds the text for every fixture-shaped announcement: the day-before
// reminder, the 30-minute warning, and a freshly drawn tie. One place, so the
// three never drift apart again.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFixtureNotice } from '@/lib/notify/format';
import { preMatchNeedle } from '@/lib/notify/needle';
import { h2hTally, h2hText } from '@/lib/stats/h2h';

export interface NoticeFixture {
  id?: string;
  home_club_id: string;
  away_club_id: string;
  competition_id: string;
  kickoff_utc: string | null;
  round?: string | null;
}

const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** '01:30' IST. */
export function istClock(iso: string): string { return timeFmt.format(new Date(iso)); }
/** 'Sun 26 Oct' IST. */
export function istDay(iso: string): string { return dateFmt.format(new Date(iso)); }

export function isTodayIST(iso: string, now = new Date()): boolean {
  return dayKey.format(now) === dayKey.format(new Date(iso));
}

export async function fixtureNotice(
  db: SupabaseClient,
  f: NoticeFixture,
  kind: 'tomorrow' | 'today' | 'prematch' | 'drawn',
  mins?: number,
): Promise<string> {
  const [{ data: clubs }, { data: bal }, { data: comps }, { data: fx }, { data: wld }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name,net_inr'),
    db.from('competitions').select('id,name').eq('id', f.competition_id),
    db.from('fixtures').select('id,home_club_id,away_club_id,status').eq('status', 'RECORDED'),
    db.from('wld_records').select('player_id,fixture_id,outcome'),
  ]);

  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const bmap = new Map(((bal ?? []) as { id: string; name: string; net_inr: number }[]).map((b) => [b.id, { name: b.name, net: Number(b.net_inr) }]));
  const home = cmap.get(f.home_club_id);
  const away = cmap.get(f.away_club_id);
  const oa = home?.owner_id ?? '';
  const ob = away?.owner_id ?? '';
  const aName = bmap.get(oa)?.name ?? oa ?? '?';
  const bName = bmap.get(ob)?.name ?? ob ?? '?';
  const netA = bmap.get(oa)?.net ?? 0;
  const netB = bmap.get(ob)?.net ?? 0;

  const tally = h2hTally(
    oa, ob,
    ((fx ?? []) as { id: string; home_club_id: string; away_club_id: string; status: string }[]),
    (id) => cmap.get(id)?.owner_id,
    ((wld ?? []) as { player_id: string; fixture_id: string | null; outcome: string }[]),
  );

  const seed = f.id ?? `${f.competition_id}:${f.home_club_id}:${f.away_club_id}`;
  const sameOwner = oa !== '' && oa === ob;

  return buildFixtureNotice({
    kind,
    home: home?.name ?? f.home_club_id,
    away: away?.name ?? f.away_club_id,
    compId: f.competition_id,
    compName: ((comps ?? []) as { name: string }[])[0]?.name ?? null,
    round: f.round ?? null,
    timeIST: f.kickoff_utc ? timeFmt.format(new Date(f.kickoff_utc)) : null,
    dateIST: f.kickoff_utc ? dateFmt.format(new Date(f.kickoff_utc)) : null,
    ownerA: aName,
    ownerB: bName,
    h2h: sameOwner ? null : h2hText(aName, bName, tally),
    netA: sameOwner ? null : netA,
    netB: sameOwner ? null : netB,
    mins: mins ?? null,
    needle: sameOwner ? 'Same owner. No money moves, so nobody gets to gloat.' : preMatchNeedle(seed, aName, bName, netA, netB),
  });
}
