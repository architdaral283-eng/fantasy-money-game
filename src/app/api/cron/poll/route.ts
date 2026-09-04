import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Matchday poller entry — hit by GitHub Actions cron (§9), NEVER on page load.
 * Reads cached schedule from Postgres, calls providers only for competitions
 * with a known owned-v-owned fixture today, inserts pending_approvals.
 * Gated behind Amendment I ratification (§2).
 */
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const db = supabaseService();
  const { data: cfg } = await db.from('config').select('*').eq('key', 'poller_enabled').single();
  if ((cfg?.value as { enabled?: boolean })?.enabled !== true) {
    return NextResponse.json({ ok: false, reason: 'Poller gated: Amendment I not ratified.' });
  }
  // Full polling logic lives here post-ratification: consult cached schedule,
  // call providers for today's competitions, normalise, cross-validate (§5.5),
  // score via the pure engine, insert PENDING rows. Never auto-approve (§1.4).
  return NextResponse.json({ ok: true, note: 'poller ran (schedule consult not yet wired to live providers)' });
}
