import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMMAND_SECTIONS, COMMISSIONER_COMMANDS, playerCommands } from '@/lib/notify/format';

// The bot has had the same bug twice in two different lists: a command
// advertised in one place and wired in another. /roastadd, /roastkill and
// /roaststats stayed in Telegram's menu for months after their handlers were
// deleted; /setup and /predictions were written, menued, and then fell
// through the dispatch allowlist into the score parser, which answered
// "Could not parse. Format: Arsenal 2-0 Manchester City".
//
// This reads the router source and checks that everything advertised is at
// least mentioned there. It is a crude test on purpose: a command that does
// not appear in the router at all is definitely not handled by it.
const ROUTER = 'src/app/api/webhook/telegram/route.ts';

describe('every advertised command is wired', () => {
  const src = readFileSync(ROUTER, 'utf8');
  const mentioned = new Set([...src.matchAll(/'(\/[a-z0-9]+)'/g)].map((m) => m[1]));
  const advertised = [
    ...COMMAND_SECTIONS.flatMap(([, rows]) => rows).map(([c]) => c),
    ...COMMISSIONER_COMMANDS.map(([c]) => c),
  ];

  it('has something in the router for each one', () => {
    const missing = advertised.filter((c) => !mentioned.has(c));
    expect(missing).toEqual([]);
  });

  it('routes the ones that go through statsReply', () => {
    const list = src.match(/\[((?:'\/[a-z0-9]+',\s*)+'\/[a-z0-9]+')\]\.includes\(cmdline\)/);
    expect(list, 'the statsReply dispatch list moved or changed shape').not.toBeNull();
    const routed = (list?.[1] ?? '').match(/\/[a-z0-9]+/g) ?? [];
    expect(routed).toContain('/predictions');
    expect(routed).toContain('/setup');
  });

  it('advertises no duplicates', () => {
    expect(new Set(advertised).size).toBe(advertised.length);
  });

  it('offers the menu without leading slashes and with help on the end', () => {
    const menu = playerCommands();
    expect(menu.every((c) => !c.command.startsWith('/'))).toBe(true);
    expect(menu.at(-1)?.command).toBe('help');
    expect(menu.map((c) => c.command)).toContain('predictions');
    // Commissioner commands never go in the menu: it shows to all four and
    // three of them would only ever get "Commissioner only."
    expect(menu.map((c) => c.command)).not.toContain('setup');
    expect(menu.map((c) => c.command)).not.toContain('correct');
  });
});
