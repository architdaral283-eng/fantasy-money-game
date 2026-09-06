import { NextResponse } from 'next/server';
import { supabaseService } from '@/lib/db/supabase';
import { COMMISSIONER_ID, requireCommissioner } from '@/lib/auth/require-commissioner';

/** Ratify a pending amendment — Commissioner only (ADMIN_SECRET bearer), single action, audited. */
export async function POST(req: Request) {
  const denied = requireCommissioner(req);
  if (denied) return denied;
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  if (!key) return NextResponse.json({ error: 'Missing amendment key.' }, { status: 400 });
  const db = supabaseService();
  const { data: cfg } = await db.from('config').select('value').eq('key', key).single();
  if (!cfg) return NextResponse.json({ error: 'Unknown amendment.' }, { status: 404 });
  const value = { ...(cfg.value as object), status: 'ratified', ratifiedBy: COMMISSIONER_ID, ratifiedAt: new Date().toISOString() };
  const { error } = await db.from('config').update({ value }).eq('key', key);
  if (error) return NextResponse.json({ error: 'Could not ratify.' }, { status: 500 });
  await db.from('audit_log').insert({ actor_id: COMMISSIONER_ID, action: `RATIFY ${key}`, subject_type: 'CONFIG', subject_id: key });
  return NextResponse.json({ ok: true, key });
}
