import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';

/** Amendment + open-decision status for the Commissioner console. */
export async function GET() {
  const db = supabaseService();
  const { data } = await db.from('config').select('key,value');
  const out: Record<string, unknown> = {};
  for (const r of (data ?? []) as { key: string; value: unknown }[]) out[r.key] = r.value;
  return NextResponse.json({ ok: true, config: out });
}
