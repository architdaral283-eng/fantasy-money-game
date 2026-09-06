import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  COMMISSIONER_ID, bearerToken, commissionerHeaders, isCommissioner, metaSignatureValid,
  requireCommissioner, secretsEqual, telegramWebhookAuthed,
} from '@/lib/auth/require-commissioner';

const URL_ = 'https://example.test/api/x';
const req = (headers: Record<string, string> = {}) => new Request(URL_, { method: 'POST', headers });

describe('secretsEqual (constant-time, fails closed)', () => {
  it('matches identical strings only', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true);
    expect(secretsEqual('abc', 'abd')).toBe(false);
    expect(secretsEqual('abc', 'abcd')).toBe(false);
    expect(secretsEqual('', 'abc')).toBe(false);
  });
  it('never matches when the expected secret is unset or empty', () => {
    expect(secretsEqual('', '')).toBe(false);
    expect(secretsEqual('x', undefined)).toBe(false);
    expect(secretsEqual('x', null)).toBe(false);
    expect(secretsEqual(null, 'x')).toBe(false);
    expect(secretsEqual(undefined, undefined)).toBe(false);
  });
});

describe('bearerToken', () => {
  it('parses a Bearer header case-insensitively', () => {
    expect(bearerToken(req({ authorization: 'Bearer tok' }))).toBe('tok');
    expect(bearerToken(req({ Authorization: 'bearer tok' }))).toBe('tok');
    expect(bearerToken(req({ authorization: 'Bearer   tok  ' }))).toBe('tok');
  });
  it('rejects other schemes and malformed values', () => {
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req({ authorization: 'Basic tok' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer a b' }))).toBeNull();
  });
});

describe('requireCommissioner / isCommissioner', () => {
  const SECRET = 'league-admin-secret';

  it('allows the request that bears the configured secret', () => {
    const r = req({ authorization: `Bearer ${SECRET}` });
    expect(isCommissioner(r, SECRET)).toBe(true);
    expect(requireCommissioner(r, SECRET)).toBeNull();
  });
  it('returns 401 for a missing, wrong, or non-Bearer credential', async () => {
    for (const r of [req(), req({ authorization: 'Bearer nope' }), req({ authorization: `Basic ${SECRET}` })]) {
      const denied = requireCommissioner(r, SECRET);
      expect(denied?.status).toBe(401);
      expect(await denied?.json()).toEqual({ error: 'Unauthorized: commissioner credential required.' });
    }
  });
  it('fails closed when the secret is unset or empty', () => {
    expect(requireCommissioner(req({ authorization: 'Bearer ' }), undefined)?.status).toBe(401);
    expect(requireCommissioner(req({ authorization: 'Bearer undefined' }), undefined)?.status).toBe(401);
    expect(requireCommissioner(req({ authorization: 'Bearer x' }), '')?.status).toBe(401);
    expect(requireCommissioner(req(), '')?.status).toBe(401);
  });
  it('ignores identity claims carried in the body — only the header counts', async () => {
    const r = new Request(URL_, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decidedBy: 'archit', action: 'APPROVE' }),
    });
    expect(requireCommissioner(r, SECRET)?.status).toBe(401);
  });

  describe('reads ADMIN_SECRET from the environment by default', () => {
    afterEach(() => vi.unstubAllEnvs());
    it('denies everything while ADMIN_SECRET is unset', () => {
      vi.stubEnv('ADMIN_SECRET', '');
      expect(requireCommissioner(req({ authorization: 'Bearer ' }))?.status).toBe(401);
      expect(commissionerHeaders()).toEqual({});
    });
    it('accepts the env secret and round-trips through commissionerHeaders()', () => {
      vi.stubEnv('ADMIN_SECRET', 'env-secret');
      expect(commissionerHeaders()).toEqual({ Authorization: 'Bearer env-secret' });
      expect(requireCommissioner(req(commissionerHeaders()))).toBeNull();
      expect(requireCommissioner(req({ authorization: 'Bearer other' }))?.status).toBe(401);
    });
  });

  it('attributes authenticated writes to the single Commissioner', () => {
    expect(COMMISSIONER_ID).toBe('archit');
  });
});

describe('telegramWebhookAuthed', () => {
  const SECRET = 'tg-webhook-secret';
  it('accepts the X-Telegram-Bot-Api-Secret-Token header', () => {
    expect(telegramWebhookAuthed(req({ 'x-telegram-bot-api-secret-token': SECRET }), SECRET)).toBe(true);
    expect(telegramWebhookAuthed(req({ 'X-Telegram-Bot-Api-Secret-Token': SECRET }), SECRET)).toBe(true);
  });
  it('rejects a missing or wrong header', () => {
    expect(telegramWebhookAuthed(req(), SECRET)).toBe(false);
    expect(telegramWebhookAuthed(req({ 'x-telegram-bot-api-secret-token': 'wrong' }), SECRET)).toBe(false);
  });
  it('ignores the legacy ?secret= query string', () => {
    const r = new Request(`${URL_}?secret=${SECRET}`, { method: 'POST' });
    expect(telegramWebhookAuthed(r, SECRET)).toBe(false);
  });
  it('fails closed when TELEGRAM_WEBHOOK_SECRET is unset', () => {
    expect(telegramWebhookAuthed(req({ 'x-telegram-bot-api-secret-token': '' }), undefined)).toBe(false);
    expect(telegramWebhookAuthed(req({ 'x-telegram-bot-api-secret-token': 'x' }), '')).toBe(false);
  });
});

describe('metaSignatureValid (X-Hub-Signature-256)', () => {
  const APP_SECRET = 'meta-app-secret';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1' }] });
  const sign = (b: string, s = APP_SECRET) => `sha256=${createHmac('sha256', s).update(b, 'utf8').digest('hex')}`;

  it('accepts a correctly signed body (string or Buffer, any hex case)', () => {
    expect(metaSignatureValid(body, sign(body), APP_SECRET)).toBe(true);
    expect(metaSignatureValid(Buffer.from(body, 'utf8'), sign(body), APP_SECRET)).toBe(true);
    expect(metaSignatureValid(body, sign(body).toUpperCase().replace('SHA256=', 'sha256='), APP_SECRET)).toBe(true);
  });
  it('rejects a tampered body, wrong secret, or malformed header', () => {
    expect(metaSignatureValid(body + ' ', sign(body), APP_SECRET)).toBe(false);
    expect(metaSignatureValid(body, sign(body, 'other'), APP_SECRET)).toBe(false);
    expect(metaSignatureValid(body, sign(body).slice(7), APP_SECRET)).toBe(false);
    expect(metaSignatureValid(body, 'sha1=abc', APP_SECRET)).toBe(false);
    expect(metaSignatureValid(body, null, APP_SECRET)).toBe(false);
  });
  it('fails closed when WHATSAPP_APP_SECRET is unset', () => {
    expect(metaSignatureValid(body, sign(body, ''), undefined)).toBe(false);
    expect(metaSignatureValid(body, sign(body), '')).toBe(false);
  });
});
