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
import { silentPlayers, silenceObservable } from '@/lib/stats/silence';
import { CHATTER_KEY } from '@/lib/notify/quiet';
import { PLAYERS } from '@/lib/stats/weekly';
import { istDay } from '@/lib/notify/fixture-notice';
import { NEWS_LEAGUES, fetchLeagueNews, parseNews, selectDigest, type NewsItem } from '@/lib/news/espn-news';

export const maxDuration = 60;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

const SEEN_KEY = 'digest_seen_ids';
const SEEN_CAP = 400;

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const nowMs = Date.now();
  const errors: string[] = [];

  // Headlines already shown on a previous night never come back.
  const { data: seenCfg } = await db.from('config').select('value').eq('key', SEEN_KEY).maybeSingle();
  const seenVal = seenCfg?.value as { ids?: string[]; keys?: string[] } | null;
  const str = (xs: unknown): string[] => (Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === 'string');
  const seenIds = str(seenVal?.ids);
  // Headline keys, not just ids: ESPN gives the same story a different article
  // id in every league feed it syndicates to, so an id alone does not identify
  // a story. Rows written before this existed simply have no keys yet.
  const seenKeys = str(seenVal?.keys);

  const feeds = await Promise.all(NEWS_LEAGUES.map((lg) => fetchLeagueNews(lg)));
  if (feeds.every((f) => f === null)) errors.push('espn news: every league returned nothing');

  const parseAll = (hours: number): NewsItem[] =>
    feeds.flatMap((j) => (j === null ? [] : parseNews(j, nowMs, hours)));

  // Today first. A quiet day is the normal case between fixtures, and that is
  // exactly when this message matters most — one headline is a worse answer
  // than a story from yesterday the group has not been shown yet. Widening
  // cannot repeat anything: seenIds still excludes everything already used.
  let windowHours = 24;
  let items = parseAll(windowHours);
  let picked = selectDigest(items, { seenIds, seenKeys });
  if (picked.ours.length < 3) {
    for (const hours of [48, 72]) {
      const wider = selectDigest(parseAll(hours), { seenIds, seenKeys });
      if (wider.ours.length > picked.ours.length) {
        picked = wider;
        items = parseAll(hours);
        windowHours = hours;
      }
      if (picked.ours.length >= 3) break;
    }
  }

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
  // Silent only if the bot has actually been WATCHING for long enough to say
  // so. Until three days after the first ordinary group message it ever saw,
  // there is no line at all — and in privacy mode there never will be.
  const [{ data: inbound }, { data: chatter }] = await Promise.all([
    db.from('config').select('key,value').like('key', 'last_inbound_%'),
    db.from('config').select('value').eq('key', CHATTER_KEY).maybeSingle(),
  ]);
  const lastInbound: Record<string, string | null> = {};
  for (const r of (inbound ?? []) as { key: string; value: { at?: string } | null }[]) {
    lastInbound[r.key.replace('last_inbound_', '')] = r.value?.at ?? null;
  }
  const observedSince = silenceObservable((chatter?.value as { first_at?: string } | null)?.first_at, nowMs);
  const silence = observedSince === null ? null : buildSilenceLine(
    silentPlayers(lastInbound, PLAYERS, nowMs, 3, observedSince).map((s) => ({
      name: pmap.get(s.player) ?? s.player,
      days: s.days,
      net: Number(bals.find((b) => b.id === s.player)?.net_inr ?? 0),
    })),
  );

  const text = [buildDigestText(istDay(new Date(nowMs).toISOString()), ours, general), silence]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n\n');

  // ?dry=1 builds the real message from real data and returns it, sending
  // nothing and remembering nothing. It is how a scheduled message gets
  // checked in production before the first time it goes to the group.
  if (new URL(req.url).searchParams.get('dry') === '1') {
    return NextResponse.json({
      ok: true, dry: true, text,
      scanned: items.length, windowHours, ours: ours.length, general: general.length,
      silence: { watchingSince: (chatter?.value as { first_at?: string } | null)?.first_at ?? null, line: silence },
      errors,
    });
  }

  await sendGroup(db, text, { urgent: true });

  // Remember what went out, newest first, capped.
  const nextSeen = {
    ids: [...new Set([...picked.ids, ...seenIds])].slice(0, SEEN_CAP),
    keys: [...new Set([...picked.keys, ...seenKeys])].slice(0, SEEN_CAP),
  };
  await db.from('config').upsert({ key: SEEN_KEY, value: nextSeen }, { onConflict: 'key' });

  return NextResponse.json({ ok: true, scanned: items.length, windowHours, ours: ours.length, general: general.length, silence: silence !== null, errors });
}
