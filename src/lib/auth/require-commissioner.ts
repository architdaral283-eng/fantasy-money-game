import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PLAYERS, type PlayerId } from '@/lib/domain/constants';

/**
 * Caller authentication for the money-writing API routes.
 *
 * Every write route uses the Supabase SERVICE-ROLE client, which bypasses RLS,
 * so the handler's own check is the only gate. The caller is authenticated from
 * a verified credential — the `Authorization: Bearer <ADMIN_SECRET>` header,
 * compared in constant time against the server-side env var — NEVER from a
 * request-body field such as `decidedBy`, which anyone can type.
 *
 * Fails closed: while ADMIN_SECRET is unset or empty, every commissioner route
 * answers 401. Same rule as CRON_SECRET in /api/cron/*.
 *
 * The league has exactly one Commissioner (Constitution Article I) and no user
 * accounts, so "holds the admin secret" is "is the Commissioner". Attribution
 * (decided_by / actor_id) therefore comes from COMMISSIONER_ID, not the body.
 */

/** Player id written into decided_by / actor_id for authenticated writes. */
export const COMMISSIONER_ID: PlayerId = PLAYERS.find((p) => p.role === 'COMMISSIONER')?.id ?? 'archit';

/**
 * Constant-time equality for secrets. Both sides are hashed first so the
 * comparison never depends on length or content. False whenever the expected
 * value is missing or empty, so an unset secret can never match anything.
 */
export function secretsEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** `Authorization: Bearer <token>` → token; null when absent or malformed. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/** True only when the request bears the configured ADMIN_SECRET. */
export function isCommissioner(req: Request, secret: string | undefined = process.env.ADMIN_SECRET): boolean {
  return secretsEqual(bearerToken(req), secret);
}

/**
 * Route guard. At the top of a handler:
 *   const denied = requireCommissioner(req); if (denied) return denied;
 */
export function requireCommissioner(req: Request, secret: string | undefined = process.env.ADMIN_SECRET): NextResponse | null {
  if (isCommissioner(req, secret)) return null;
  return NextResponse.json({ error: 'Unauthorized: commissioner credential required.' }, { status: 401 });
}

/** Headers for the server's own calls into commissioner routes (Telegram handler → /api/corrections). */
export function commissionerHeaders(secret: string | undefined = process.env.ADMIN_SECRET): Record<string, string> {
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

/**
 * Telegram webhook: the `secret_token` given to setWebhook arrives on every
 * update as `X-Telegram-Bot-Api-Secret-Token`. Fails closed when
 * TELEGRAM_WEBHOOK_SECRET is unset. The query string is never consulted.
 */
export function telegramWebhookAuthed(req: Request, secret: string | undefined = process.env.TELEGRAM_WEBHOOK_SECRET): boolean {
  return secretsEqual(req.headers.get('x-telegram-bot-api-secret-token'), secret);
}

/**
 * Meta (WhatsApp Cloud API) webhook: `X-Hub-Signature-256: sha256=<hex>` where
 * hex = HMAC-SHA256(appSecret, raw request body). Fails closed when
 * WHATSAPP_APP_SECRET is unset or the header is missing/malformed.
 */
export function metaSignatureValid(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined = process.env.WHATSAPP_APP_SECRET,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!m) return false;
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = createHmac('sha256', appSecret).update(body).digest('hex');
  return secretsEqual(m[1].toLowerCase(), expected);
}
