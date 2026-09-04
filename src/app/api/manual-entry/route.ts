import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { submitManualLine } from '@/lib/entry/submit';

/** Manual result entry — thin wrapper; logic lives in lib/entry/submit. */
export async function POST(req: Request) {
  try {
    const { line } = (await req.json().catch(() => ({}))) as { line?: string };
    const r = await submitManualLine(supabaseService(), line ?? '', 'web');
    if (!r.ok) {
      const status = r.error === 'Already waiting for approval.' ? 409 : 400;
      return NextResponse.json(r, { status });
    }
    return NextResponse.json(r);
  } catch (e) {
    console.error('manual-entry failed:', e);
    return NextResponse.json({ error: `Server error: ${(e as Error).message}` }, { status: 500 });
  }
}
