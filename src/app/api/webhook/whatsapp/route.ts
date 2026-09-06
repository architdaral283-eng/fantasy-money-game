import { NextResponse } from 'next/server';
import { metaSignatureValid, secretsEqual } from '@/lib/auth/require-commissioner';

/** WhatsApp Cloud API webhook: verification + inbound (buttons + one-line results). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  // Meta's subscribe handshake. Fails closed: unset WHATSAPP_VERIFY_TOKEN never matches.
  if (u.searchParams.get('hub.mode') === 'subscribe'
    && secretsEqual(u.searchParams.get('hub.verify_token'), process.env.WHATSAPP_VERIFY_TOKEN)) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

export async function POST(req: Request) {
  // Meta signs every delivery: X-Hub-Signature-256 = sha256=HMAC-SHA256(WHATSAPP_APP_SECRET, raw body).
  // Verified over the raw bytes, constant-time. Fails closed: no app secret → nothing is accepted.
  const raw = Buffer.from(await req.arrayBuffer());
  if (!metaSignatureValid(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // TODO: parse button taps (approve/reject/edit per §6.5) and one-line results (§7.3)
  // into pending_approvals. Anything unparseable gets a helpful reply, never a silent failure.
  // Until then the verified payload is acknowledged and ignored.
  return NextResponse.json({ ok: true });
}
