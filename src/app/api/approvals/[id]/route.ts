import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { approveProposal } from '@/lib/ledger/writer';
import { zeroSumAlert, clearLedgerLock } from '@/lib/notify/send';

/** Commissioner approve/reject — role check + idempotency (§6). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action, decidedBy } = (await req.json()) as { action: 'APPROVE' | 'REJECT'; decidedBy: string };
  const db = supabaseService();
  const { data: actor } = await db.from('players').select('role').eq('id', decidedBy).single();
  if (actor?.role !== 'COMMISSIONER') {
    return NextResponse.json({ error: 'Commissioner only.' }, { status: 403 });
  }
  if (action === 'REJECT') {
    await db.from('pending_approvals').update({ status: 'REJECTED', decided_at: new Date().toISOString(), decided_by: decidedBy }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  try {
    const r = await approveProposal(db, id, decidedBy);
    await clearLedgerLock(db);
    return NextResponse.json(r);
  } catch (e) {
    const msg = (e as Error).message;
    if (/Zero-sum broken/.test(msg)) await zeroSumAlert(db, msg);
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
