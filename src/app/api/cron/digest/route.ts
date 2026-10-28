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
import { buildDigestText, buildSilenceLine, type DigestClubItem } from '@/lib/notify/format';
import { silentPlayers } from '@/lib/stats/silence';
import { PLAYERS } from '@/lib/stats/weekly';
import { istDay } from '@/lib/notify/fixture-notice';
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

  const [{ data: clubs }, { data: bal }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name,net_inr'),
  ]);
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const bals = (bal ?? []) as { id: string; name: string; net_inr: number }[];
  const pmap = new Map(bals.map((b) => [b.id, b.name]));

  const ours: DigestClubItem[] = picked.ours.map((it) => ({
    club: cmap.get(it.clubIds[0])?.name ?? it.clubIds[0],
    owner: pmap.get(cmap.get(it.clubIds[0])?.owner_id ?? '') ?? cmap.get(it.clubIds[0])?.owner_id ?? '?',
    headline: it.headline,
  }));

  const general = picked.general.map((g) => ({ headline: g.headline, context: g.description }));
  // Whoever has stopped talking gets named here rather than in a message of
  // their own. markInbound() already stamps config on every inbound message,
  // so this is a read of something we already had, not new tracking.
  const { data: inbound } = await db.from('config').select('key,value').like('key', 'last_inbound_%');
  const lastInbound: Record<string, string | null> = {};
  for (const r of (inbound ?? []) as { key: string; value: { at?: string } | null }[]) {
    lastInbound[r.key.replace('last_inbound_', '')] = r.value?.at ?? null;
  }
  const silence = buildSilenceLine(
    silentPlayers(lastInbound, PLAYERS, nowMs).map((s) => ({
      name: pmap.get(s.player) ?? s.player,
      days: s.days,
      net: Number(bals.find((b) => b.id === s.player)?.net_inr ?? 0),
    })),
  );

  const text = [buildDigestText(istDay(new Date(nowMs).toISOString()), ours, general), silence]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n\n');
  await sendGroup(db, text, { urgent: true });

  // Remember what went out, newest first, capped.
  const nextSeen = [...picked.ids, ...seenIds].slice(0, SEEN_CAP);
  await db.from('config').upsert({ key: SEEN_KEY, value: { ids: nextSeen } }, { onConflict: 'key' });

  return NextResponse.json({ ok: true, scanned: items.length, ours: ours.length, general: general.length, silence: silence !== null, errors });
}
