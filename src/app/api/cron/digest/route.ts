// The 23:00 IST nightly brief.
//
// Between fixtures the group goes quiet for a week at a time. This fills that
// with the one thing everybody in it already cares about: what happened today
// to the sixteen clubs they own, plus whatever else football did.
//
// Straight headlines, no commentary and nothing generated — every line is
// something ESPN published, attached to the club and the man who drafted it.
// Five ESPN calls, one message, outside quiet hours so it sends immediately.

import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { sendGroup } from '@/lib/notify/quiet';
import { buildDigestText, type DigestClubItem, type DigestNext } from '@/lib/notify/format';
import { istClock, istDay } from '@/lib/notify/fixture-notice';
import { NEWS_LEAGUES, parseNews, selectDigest, type NewsItem } from '@/lib/news/espn-news';

export const maxDuration = 60;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const SEEN_KEY = 'digest_seen_ids';
const SEEN_CAP = 400;

async function leagueNews(lg: string, nowMs: number, timeoutMs = 8000): Promise<NewsItem[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/${lg}/news?limit=25`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return [];
    return parseNews(await r.json(), nowMs);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const nowMs = Date.now();
  const errors: string[] = [];

  // Headlines already shown on a previous night never come back.
  const { data: seenCfg } = await db.from('config').select('value').eq('key', SEEN_KEY).maybeSingle();
  const seenIds: string[] = ((seenCfg?.value as { ids?: string[] } | null)?.ids ?? []).filter((x) => typeof x === 'string');

  const feeds = await Promise.all(NEWS_LEAGUES.map((lg) => leagueNews(lg, nowMs)));
  const items = feeds.flat();
  if (!items.length) errors.push('espn news: every league returned nothing');

  const picked = selectDigest(items, { seenIds });

  const [{ data: clubs }, { data: bal }, { data: comps }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
    db.from('competitions').select('id,name'),
  ]);
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const pmap = new Map(((bal ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const kmap = new Map(((comps ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const ownerOfClub = (clubId: string) => pmap.get(cmap.get(clubId)?.owner_id ?? '') ?? cmap.get(clubId)?.owner_id ?? '?';

  const ours: DigestClubItem[] = picked.ours.map((it) => ({
    club: cmap.get(it.clubIds[0])?.name ?? it.clubIds[0],
    owner: ownerOfClub(it.clubIds[0]),
    headline: it.headline,
  }));

  // Next counted fixture, and what the coming week is worth.
  const weekEnd = new Date(nowMs + 7 * 24 * 3600 * 1000).toISOString();
  const { data: fx } = await db.from('fixtures')
    .select('home_club_id,away_club_id,competition_id,kickoff_utc')
    .eq('status', 'SCHEDULED').eq('is_same_owner', false)
    .gt('kickoff_utc', new Date(nowMs).toISOString())
    .order('kickoff_utc').limit(20);
  const upcoming = (fx ?? []) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string }[];
  const first = upcoming[0];
  const next: DigestNext | null = first ? {
    home: cmap.get(first.home_club_id)?.name ?? first.home_club_id,
    away: cmap.get(first.away_club_id)?.name ?? first.away_club_id,
    ownerA: ownerOfClub(first.home_club_id),
    ownerB: ownerOfClub(first.away_club_id),
    compId: first.competition_id,
    compName: kmap.get(first.competition_id) ?? null,
    timeIST: istClock(first.kickoff_utc),
    dateIST: istDay(first.kickoff_utc),
  } : null;
  const weekStake = upcoming.filter((f) => f.kickoff_utc <= weekEnd).length * 500;

  const text = buildDigestText(istDay(new Date(nowMs).toISOString()), ours, picked.general.map((g) => g.headline), next, weekStake);
  await sendGroup(db, text, { urgent: true });

  // Remember what went out, newest first, capped.
  const nextSeen = [...picked.ids, ...seenIds].slice(0, SEEN_CAP);
  await db.from('config').upsert({ key: SEEN_KEY, value: { ids: nextSeen } }, { onConflict: 'key' });

  return NextResponse.json({
    ok: true, scanned: items.length, ours: ours.length, general: picked.general.length,
    weekStake, errors,
  });
}
