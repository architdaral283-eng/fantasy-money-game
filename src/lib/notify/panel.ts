// Pinned panel + matchday brief text builders — pure, tested.
// HTML parse mode with <pre> so columns align in every client. No Markdown:
// club names with underscores would break it.
// House style and the shared primitives live in format.ts.

import { block, head, pre, esc, money, padR, compShort, STAKE_LINE } from '@/lib/notify/format';

export interface StandingRow { name: string; net: number; w: number; l: number; d: number }
export interface NextFixture { home: string; away: string; ownerA: string; ownerB: string; whenIST: string }

export function inr(n: number): string {
  return `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

/** Signature pinned message: table + zero-sum + next fixture. */
export function buildPinText(rows: StandingRow[], played: number, totalPaying: number, next: NextFixture | null, updatedIST: string): string {
  const table = rows
    .map((r, i) => `${i + 1}  ${r.name.padEnd(9)} ${inr(r.net).padStart(9)}   ${r.w}W ${r.l}L ${r.d}D`)
    .join('\n');
  const sum = rows.reduce((s, r) => s + r.net, 0);
  const lines = [
    `LEAGUE TABLE              after ${played} of ${totalPaying}`,
    ``,
    `<pre>${table}</pre>`,
    ``,
    sum === 0 ? `◎ balances sum to ₹0` : `Balances do not sum to ₹0. Ledger locked.`,
  ];
  if (next) {
    lines.push(``, `Next: ${next.home} v ${next.away}, ${next.whenIST} IST`, `${next.ownerA} v ${next.ownerB}. ${STAKE_LINE}`);
  }
  lines.push(``, `updated ${updatedIST} IST`);
  return lines.join('\n');
}

export interface BriefFixture { home: string; away: string; compId: string; comp?: string | null; ownerA: string; ownerB: string; whenIST: string }

/** 09:00 IST matchday brief. Same shape as /next, one day's worth. */
export function buildBriefText(fixtures: BriefFixture[]): string {
  if (fixtures.length === 0) return '';
  const body = fixtures.map((f) => [
    ` ${padR(f.whenIST, 5)}  ${f.home} v ${f.away}`,
    `        ${f.ownerA} v ${f.ownerB} · ${compShort(f.compId, f.comp)}`,
  ].join('\n')).join('\n\n');
  const base = fixtures.length * 500;
  return block(
    head('Today', `${fixtures.length} counted fixture${fixtures.length > 1 ? 's' : ''}`),
    pre(esc(body)),
    `${money(base)} in play. ${money(base * 2)} if they all go big.`,
  );
}
