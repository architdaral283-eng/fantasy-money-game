import { describe, it, expect } from 'vitest';
import { mention, mentionMap } from '@/lib/notify/mention';

describe('telegram mentions', () => {
  it('links a numeric user id', () => {
    expect(mention('Vedant', '123456789')).toBe('<a href="tg://user?id=123456789">Vedant</a>');
  });

  it('falls back to the plain name when the player is not linked', () => {
    expect(mention('Vedant', null)).toBe('Vedant');
    expect(mention('Vedant', undefined)).toBe('Vedant');
    expect(mention('Vedant', '')).toBe('Vedant');
  });

  it('refuses anything that is not a plain number', () => {
    // A group chat id is negative; tg://user would render as a dead link.
    expect(mention('Vedant', '-1001234567')).toBe('Vedant');
    expect(mention('Vedant', 'abc')).toBe('Vedant');
  });

  it('escapes the name either way, so a club or nickname cannot break the HTML', () => {
    expect(mention('A & B', '42')).toBe('<a href="tg://user?id=42">A &amp; B</a>');
    expect(mention('<b>', null)).toBe('&lt;b&gt;');
  });
});

describe('the mention map', () => {
  const players = [
    { id: 'vedant', name: 'Vedant', telegram_chat_id: '111' },
    { id: 'anmol', name: 'Anmol', telegram_chat_id: null },
  ];

  it('mentions the linked and names the unlinked', () => {
    const m = mentionMap(players);
    expect(m('vedant')).toBe('<a href="tg://user?id=111">Vedant</a>');
    expect(m('anmol')).toBe('Anmol');
  });

  it('uses the fallback for someone it has never heard of', () => {
    expect(mentionMap(players)('ghost', 'Ghost')).toBe('Ghost');
    expect(mentionMap(players)('ghost')).toBe('ghost');
  });
});
