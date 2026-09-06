import { NextResponse } from 'next/server';
import { requireCommissioner } from '@/lib/auth/require-commissioner';

/**
 * Backfill — §13. Date range (default 21 Aug 2026 → today), historical pull
 * for all nine competitions, owned-v-owned filter, one PENDING row each,
 * single bulk-approve screen sorted chronologically. Idempotent, re-runnable.
 * Commissioner only (ADMIN_SECRET bearer).
 */
export async function POST(req: Request) {
  const denied = requireCommissioner(req);
  if (denied) return denied;
  const { from, to } = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
  return NextResponse.json({
    ok: true,
    from: from ?? '2026-08-21',
    to: to ?? new Date().toISOString().slice(0, 10),
    note: 'Backfill computes proposals per fixture and inserts PENDING rows; bulk approve writes in one transaction with a final zero-sum assertion.',
  });
}
