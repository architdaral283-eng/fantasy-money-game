import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';

/** Ratify a pending amendment — Commissioner only, single action, audited. */
export async function POST(req: Request) {
  const { key, decidedBy } = (await req.json().catch(() => ({}))) as { key?: string; decidedBy?: string };
  if (!key) return NextResponse.json({ error: 'Missing amendment key.' }, { status: 400 });
  const db = supabaseService();
  const { data: actor } = await db.from('players').select('role').eq('id', decidedBy ?? 'archit').single();
  if (actor?.role !== 'COMMISSIONER') {
    return NextResponse.json({ error: 'Commissioner only.' }, { status: 403 });
  }
  const { data: cfg } = await db.from('config').select('value').eq('key', key).single();
  if (!cfg) return NextResponse.json({ error: 'Unknown amendment.' }, { status: 404 });
  const value = { ...(cfg.value as object), status: 'ratified', ratifiedBy: decidedBy ?? 'archit', ratifiedAt: new Date().toISOString() };
  const { error } = await db.from('config').update({ value }).eq('key', key);
  if (error) return NextResponse.json({ error: 'Could not ratify.' }, { status: 500 });
  await db.from('audit_log').insert({ actor_id: decidedBy ?? 'archit', action: `RATIFY ${key}`, subject_type: 'CONFIG', subject_id: key });
  return NextResponse.json({ ok: true, key });
}
