// Builds the text for every fixture-shaped announcement: the day-before
// reminder, the 30-minute warning, and a freshly drawn tie. One place, so the
// three never drift apart again.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFixtureNotice } from '@/lib/notify/format';
import { mention } from '@/lib/notify/mention';

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
  const [{ data: clubs }, { data: bal }, { data: comps }, { data: people }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
    db.from('competitions').select('id,name').eq('id', f.competition_id),
    // For the mention. telegram_chat_id IS the user id in a private chat.
    db.from('players').select('id,telegram_chat_id'),
  ]);

  const chatOf = new Map(((people ?? []) as { id: string; telegram_chat_id: string | null }[])
    .map((p) => [p.id, p.telegram_chat_id]));

  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const bmap = new Map(((bal ?? []) as { id: string; name: string }[]).map((b) => [b.id, { name: b.name }]));
  const home = cmap.get(f.home_club_id);
  const away = cmap.get(f.away_club_id);
  const oa = home?.owner_id ?? '';
  const ob = away?.owner_id ?? '';
  const aName = bmap.get(oa)?.name ?? oa ?? '?';
  const bName = bmap.get(ob)?.name ?? ob ?? '?';
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
    ownerAHtml: mention(aName, chatOf.get(oa)),
    ownerBHtml: mention(bName, chatOf.get(ob)),
    mins: mins ?? null,
    sameOwner,
  });
}
