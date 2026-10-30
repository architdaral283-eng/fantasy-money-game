// Pinned panel text builder — pure, tested.
// HTML parse mode with <pre> so columns align in every client. No Markdown:
// club names with underscores would break it.
// House style and the shared primitives live in format.ts.

import { STAKE_LINE } from '@/lib/notify/format';

export interface StandingRow { name: string; net: number; w: number; l: number; d: number }
export interface NextFixture { home: string; away: string; ownerA: string; ownerB: string; whenIST: string; inText?: string | null }

/**
 * 'in 2d 14h'. The pin is the one surface that costs nothing to update, so it
 * can carry a countdown that is right to the minute. Null once kickoff passes.
 */
export function countdown(msUntil: number): string | null {
  if (!Number.isFinite(msUntil) || msUntil <= 0) return null;
  const mins = Math.round(msUntil / 60000);
  if (mins <= 1) return 'any moment';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `in ${h}h ${m}m` : `in ${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `in ${d}d ${rh}h` : `in ${d}d`;
}

export function inr(n: number): string {
  return `${n < 0 ? '−' : '+'}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

export interface LivePanelEntry { home: string; away: string; h: number; a: number; clock: string }

/**
 * Signature pinned message: live match, table, zero-sum, next fixture.
 *
 * The live block goes FIRST and only when there is one. A pinned message
 * nobody scrolls is a pinned message that has to lead with the thing that
 * changed.
 */
export function buildPinText(
  rows: StandingRow[],
  played: number,
  totalPaying: number,
  next: NextFixture | null,
  updatedIST: string,
  live: LivePanelEntry[] = [],
): string {
  const table = rows
    .map((r, i) => `${i + 1}  ${r.name.padEnd(9)} ${inr(r.net).padStart(9)}   ${r.w}W ${r.l}L ${r.d}D`)
    .join('\n');
  const sum = rows.reduce((s, r) => s + r.net, 0);
  const lines: string[] = [];
  if (live.length) {
    lines.push(`● LIVE`);
    for (const m of live) {
      lines.push(`${m.home} ${m.h}–${m.a} ${m.away}${m.clock ? `  ${m.clock}` : ''}`);
    }
    lines.push(``);
  }
  lines.push(
    `LEAGUE TABLE              after ${played} of ${totalPaying}`,
    ``,
    `<pre>${table}</pre>`,
    ``,
    sum === 0 ? `◎ balances sum to ₹0` : `Balances do not sum to ₹0. Ledger locked.`,
  );
  if (next) {
    const when = next.inText ? `${next.whenIST} IST · ${next.inText}` : `${next.whenIST} IST`;
    lines.push(``, `Next: ${next.home} v ${next.away}, ${when}`, `${next.ownerA} v ${next.ownerB}. ${STAKE_LINE}`);
  }
  lines.push(``, `updated ${updatedIST} IST`);
  return lines.join('\n');
}
