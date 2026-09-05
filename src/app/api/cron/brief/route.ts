import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { groupId } from '@/lib/notify/send';
import { sendGroup } from '@/lib/notify/quiet';
import { buildBriefText } from '@/lib/notify/panel';

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function istParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
  return { y: parts[0], m: parts[1], day: parts[2] };
}

/** 09:00 IST matchday brief — counted fixtures playing today, stakes attached. */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const gid = await groupId(db);
  if (!gid) return NextResponse.json({ ok: false, reason: 'No group registered. Send /setgroup in the group first.' });

  const now = new Date();
  const t = istParts(now);
  // IST midnight boundaries in UTC (IST = UTC+5:30)
  const startUtc = Date.UTC(t.y, t.m - 1, t.day, 0, 0, 0) - 5.5 * 3600 * 1000;
  const endUtc = startUtc + 24 * 3600 * 1000;

  const { data: fx } = await db.from('fixtures')
    .select('home_club_id,away_club_id,competition_id,kickoff_utc')
    .eq('status', 'SCHEDULED')
    .gte('kickoff_utc', new Date(startUtc).toISOString())
    .lt('kickoff_utc', new Date(endUtc).toISOString())
    .order('kickoff_utc');
  const [{ data: clubs }] = [await db.from('clubs').select('id,name,owner_id')];
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  const list = ((fx ?? []) as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string }[]).map((f) => ({
    home: cmap.get(f.home_club_id)?.name ?? f.home_club_id,
    away: cmap.get(f.away_club_id)?.name ?? f.away_club_id,
    comp: f.competition_id,
    ownerA: cmap.get(f.home_club_id)?.owner_id ?? '?',
    ownerB: cmap.get(f.away_club_id)?.owner_id ?? '?',
    whenIST: fmt(f.kickoff_utc),
  }));
  const text = buildBriefText(list);
  if (!text) return NextResponse.json({ ok: true, brief: false });
  await sendGroup(db, text);
  return NextResponse.json({ ok: true, brief: true, fixtures: list.length });
}
