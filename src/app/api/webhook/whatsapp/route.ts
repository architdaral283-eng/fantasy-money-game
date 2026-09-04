import { NextResponse } from 'next/server';

/** WhatsApp Cloud API webhook: verification + inbound (buttons + one-line results). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

export async function POST(req: Request) {
  // TODO: verify X-Hub-Signature-256 with WHATSAPP_APP_SECRET, parse button taps
  // (approve/reject/edit per §6.5) and one-line results (§7.3) into pending_approvals.
  // Anything unparseable gets a helpful reply, never a silent failure.
  await req.json().catch(() => null);
  return NextResponse.json({ ok: true });
}
