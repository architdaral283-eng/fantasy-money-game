// Pinned panel + matchday brief text builders — pure, tested.
// HTML parse mode with <pre> so columns align in every client. No Markdown:
// club names with underscores would break it.

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
    lines.push(``, `Next: ${next.home} v ${next.away}, ${next.whenIST} IST`, `${next.ownerA} v ${next.ownerB}. ₹500, ₹1000 if 4+.`);
  }
  lines.push(``, `updated ${updatedIST} IST`);
  return lines.join('\n');
}

export interface BriefFixture { home: string; away: string; comp: string; ownerA: string; ownerB: string; whenIST: string }

/** 09:00 IST matchday brief. */
export function buildBriefText(fixtures: BriefFixture[]): string {
  if (fixtures.length === 0) return '';
  const lines = [`TODAY, ${fixtures.length} counted fixture${fixtures.length > 1 ? 's' : ''}`, ``];
  for (const f of fixtures) {
    lines.push(`${f.whenIST}  ${f.home} v ${f.away}   ${f.comp}`, `       ${f.ownerA} v ${f.ownerB}   ₹500. ₹1000 if 4+`, ``);
  }
  const base = fixtures.length * 500;
  lines.push(`₹${base.toLocaleString('en-IN')} in play. ₹${(base * 2).toLocaleString('en-IN')} if all go big.`);
  return lines.join('\n');
}
