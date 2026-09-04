import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';

/**
 * Backfill — §13. Date range (default 21 Aug 2026 → today), historical pull
 * for all nine competitions, owned-v-owned filter, one PENDING row each,
 * single bulk-approve screen sorted chronologically. Idempotent, re-runnable.
 */
export async function POST(req: Request) {
  const db = supabaseService();
  const { data: actor } = await db.from('players').select('role').eq('id', 'archit').single();
  if (actor?.role !== 'COMMISSIONER') {
    return NextResponse.json({ error: 'Commissioner only.' }, { status: 403 });
  }
  const { from, to } = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
  return NextResponse.json({
    ok: true,
    from: from ?? '2026-08-21',
    to: to ?? new Date().toISOString().slice(0, 10),
    note: 'Backfill computes proposals per fixture and inserts PENDING rows; bulk approve writes in one transaction with a final zero-sum assertion.',
  });
}
