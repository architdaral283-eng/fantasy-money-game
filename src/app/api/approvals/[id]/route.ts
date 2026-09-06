import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { approveProposal } from '@/lib/ledger/writer';
import { zeroSumAlert, clearLedgerLock } from '@/lib/notify/send';
import { COMMISSIONER_ID, requireCommissioner } from '@/lib/auth/require-commissioner';

/** Commissioner approve/reject — ADMIN_SECRET bearer + idempotency (§6). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireCommissioner(req);
  if (denied) return denied;
  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== 'APPROVE' && action !== 'REJECT') {
    return NextResponse.json({ error: 'action must be APPROVE or REJECT.' }, { status: 400 });
  }
  const db = supabaseService();
  if (action === 'REJECT') {
    await db.from('pending_approvals').update({ status: 'REJECTED', decided_at: new Date().toISOString(), decided_by: COMMISSIONER_ID }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  try {
    const r = await approveProposal(db, id, COMMISSIONER_ID);
    await clearLedgerLock(db);
    return NextResponse.json(r);
  } catch (e) {
    const msg = (e as Error).message;
    if (/Zero-sum broken/.test(msg)) await zeroSumAlert(db, msg);
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
