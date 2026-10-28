// House style for every outbound Telegram message.
//
// One shape everywhere:
//   HEADER LINE (caps, optional · subtitle)
//   <blank>
//   subject block
//   <blank>
//   money block
//   <blank>
//   context              — head to head, standings
//
// Rules, learned the hard way:
//  - never print a raw id (`anmol`, `laliga`) — resolve to a name first
//  - every rupee figure goes through money()/signed() so separators are real
//  - scores and ranges use en dash, negatives use U+2212, never a hyphen
//  - tables live inside <pre> so columns survive every Telegram client
//  - parse_mode is HTML, so anything interpolated gets esc()'d
// Pure functions only. Tested in format.test.ts.

export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** ₹1,000 — absolute value, Indian digit grouping. */
export function money(n: number): string {
  return `₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

/** +₹1,500 / −₹500 / ₹0 — the sign is a real minus, not a hyphen. */
export function signed(n: number): string {
  const v = Math.round(n);
  if (v === 0) return '₹0';
  return `${v < 0 ? '−' : '+'}${money(v)}`;
}

/** Title Case for the four player ids, when a display name is missing. */
export function nameish(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const COMP_NAME: Record<string, string> = {
  epl: 'Premier League', laliga: 'La Liga', bundesliga: 'Bundesliga', seriea: 'Serie A',
  ucl: 'UEFA Champions League', facup: 'FA Cup', copadelrey: 'Copa del Rey',
  coppa: 'Coppa Italia', dfbpokal: 'DFB-Pokal',
  communityshield: 'Community Shield', dflsupercup: 'DFL-Supercup',
};
const COMP_SHORT: Record<string, string> = {
  epl: 'PL', laliga: 'La Liga', bundesliga: 'Bundesliga', seriea: 'Serie A',
  ucl: 'UCL', facup: 'FA Cup', copadelrey: 'Copa del Rey',
  coppa: 'Coppa Italia', dfbpokal: 'DFB-Pokal',
  communityshield: 'Community Shield', dflsupercup: 'DFL-Supercup',
};

/** Full competition name. Never returns the slug if we know better. */
export function compName(id: string, fromDb?: string | null): string {
  return fromDb || COMP_NAME[id] || nameish(id);
}
/** Short competition label for cramped table rows. */
export function compShort(id: string, fromDb?: string | null): string {
  return COMP_SHORT[id] || fromDb || nameish(id);
}

/** Join sections with one blank line, dropping anything empty. */
export function block(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join('\n\n');
}

/** HEADER or HEADER · subtitle */
export function head(label: string, sub?: string | null): string {
  return sub ? `${label.toUpperCase()} · ${sub}` : label.toUpperCase();
}

export function pre(body: string): string {
  return `<pre>${body}</pre>`;
}

export function padR(s: string, n: number): string { return s.length >= n ? s : s + ' '.repeat(n - s.length); }
export function padL(s: string, n: number): string { return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

/** Two aligned columns inside a <pre>. */
export function cols(rows: [string, string][], gap = 3): string {
  const w = rows.reduce((m, r) => Math.max(m, r[0].length), 0);
  return rows.map(([a, b]) => `${padR(a, w)}${' '.repeat(gap)}${b}`.trimEnd()).join('\n');
}

/** The one stake line every fixture message shares. */
export const STAKE_LINE = '₹500 on it. ₹1,000 if it finishes 4+.';

/** "Anmol +₹1,500 · Vedant −₹500" — where the two of them stand right now. */
export function standingLine(a: string, netA: number, b: string, netB: number): string {
  return `Table: ${esc(a)} ${signed(netA)} · ${esc(b)} ${signed(netB)}`;
}

// ——————————————————————————— fixture notices ———————————————————————————

export interface FixtureNotice {
  kind: 'tomorrow' | 'today' | 'prematch' | 'drawn';
  home: string;
  away: string;
  compId: string;
  compName?: string | null;
  round?: string | null;
  timeIST?: string | null;   // '01:30'
  dateIST?: string | null;   // 'Sun 26 Oct'
  ownerA: string;
  ownerB: string;
  h2h?: string | null;       // 'Anmol leads 3–1'
  netA?: number | null;
  netB?: number | null;
  mins?: number | null;      // prematch only
  sameOwner?: boolean;       // both clubs owned by the same player: no money moves
}

/** The day-before notice, the 30-minute warning and a freshly drawn cup tie. */
export function buildFixtureNotice(n: FixtureNotice): string {
  const header =
    n.kind === 'prematch' ? head('Kickoff', `${Math.max(1, n.mins ?? 30)} minutes`)
      : n.kind === 'drawn' ? head('Cup tie drawn')
        : head(n.kind === 'today' ? 'Today' : 'Tomorrow', n.timeIST ? `${n.timeIST} IST` : 'time TBC');

  const where = [compName(n.compId, n.compName), n.round || null, n.kind === 'prematch' ? null : n.dateIST || null]
    .filter(Boolean).join(' · ');

  const subject = `${esc(n.home)} v ${esc(n.away)}\n${esc(where)}`;
  const moneyBlock = n.sameOwner
    ? `${esc(n.ownerA)} owns both. Nothing moves.`
    : `${esc(n.ownerA)} v ${esc(n.ownerB)}\n${STAKE_LINE}`;

  const context: string[] = [];
  if (n.h2h) context.push(`Head to head: ${esc(n.h2h)}`);
  if (typeof n.netA === 'number' && typeof n.netB === 'number') {
    context.push(standingLine(n.ownerA, n.netA, n.ownerB, n.netB));
  }
  const tail = n.kind === 'drawn' && !n.timeIST
    ? 'No date yet. It shows up in /next the moment the provider gives one.'
    : null;

  // No taunt before a result. The roast lands when the money actually moves.
  return block(header, subject, moneyBlock, context.join('\n'), tail);
}

// ——————————————————————————— scorers ———————————————————————————

export interface ScorerGoal { minute: string; player: string; clubId: string; pen?: boolean; og?: boolean }

/**
 * "Napoli: F. Anguissa 28', S. McTominay 48' 83'" — one line per club that
 * scored, home first, each player's goals grouped in match order.
 */
export function scorerLines(goals: ScorerGoal[], home: { id: string; name: string }, away: { id: string; name: string }): string[] {
  const line = (club: { id: string; name: string }): string | null => {
    const mine = goals.filter((g) => g.clubId === club.id);
    if (!mine.length) return null;
    const order: string[] = [];
    const by = new Map<string, string[]>();
    for (const g of mine) {
      const who = g.og ? `${g.player} (og)` : g.player;
      if (!by.has(who)) { by.set(who, []); order.push(who); }
      by.get(who)!.push(`${g.minute}${g.pen ? ' (pen)' : ''}`);
    }
    return esc(`${club.name}: ${order.map((w) => `${w} ${by.get(w)!.join(' ')}`).join(', ')}`);
  };
  return [line(home), line(away)].filter((x): x is string => x !== null);
}

// ——————————————————————————— fixture list ———————————————————————————

export interface ListFixture {
  home: string; away: string; compId: string; compName?: string | null;
  ownerA: string; ownerB: string; timeIST: string | null; dateIST: string | null;
}

/** /next and /fixtures — grouped by day, stakes totalled at the bottom. */
export function buildFixtureList(rows: ListFixture[], title = 'Next up'): string {
  if (!rows.length) return block(head(title), 'Nothing counted on the calendar. Enjoy the peace.');
  const days: { day: string; items: ListFixture[] }[] = [];
  for (const r of rows) {
    const day = r.dateIST || 'Date TBC';
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(r);
    else days.push({ day, items: [r] });
  }
  const body = days.map(({ day, items }) => [
    day,
    ...items.map((f) => [
      ` ${padR(f.timeIST || '—', 5)}  ${f.home} v ${f.away}`,
      `        ${f.ownerA} v ${f.ownerB} · ${compShort(f.compId, f.compName)}`,
    ].join('\n')),
  ].join('\n')).join('\n\n');

  const base = rows.length * 500;
  return block(
    head(title, `${rows.length} counted`),
    pre(esc(body)),
    `${money(base)} in play. ${money(base * 2)} if they all go big.`,
  );
}

// ——————————————————————————— nightly brief ———————————————————————————

export interface DigestClubItem { club: string; owner: string; headline: string }
export interface DigestNext {
  home: string; away: string; ownerA: string; ownerB: string;
  compId: string; compName?: string | null; timeIST: string | null; dateIST: string | null;
}

/**
 * The 23:00 IST brief, for the days between fixtures when the group goes quiet.
 *
 * Headlines only — no commentary, no invented context. Every line is something
 * ESPN published today about a club one of these four owns, so the club name
 * and the owner's name sit together and the rest of the group can do the work.
 */
export function buildDigestText(
  dateLabel: string,
  ours: DigestClubItem[],
  general: string[],
  next: DigestNext | null,
  weekStake = 0,
): string {
  const lines: string[] = [];
  if (ours.length) {
    lines.push('YOUR SIXTEEN');
    for (const it of ours) lines.push(` ${it.club} · ${it.owner}`, `   ${it.headline}`);
  }
  if (general.length) {
    if (lines.length) lines.push('');
    lines.push('ELSEWHERE');
    for (const h of general) lines.push(`   ${h}`);
  }

  const body = lines.length
    ? pre(esc(lines.join('\n')))
    : 'Nothing happened to any of your sixteen today. Sixteen clubs, four leagues, not one of them worth a headline.';

  const nextBlock = next
    ? [
      `Next: ${esc(next.home)} v ${esc(next.away)}${next.timeIST ? `, ${next.dateIST} ${next.timeIST} IST` : ', date TBC'}`,
      `${esc(next.ownerA)} v ${esc(next.ownerB)} · ${compShort(next.compId, next.compName)}. ${STAKE_LINE}`,
    ].join('\n')
    : 'Nothing counted on the calendar.';

  return block(
    head('Tonight', dateLabel),
    body,
    nextBlock,
    weekStake > 0 ? `${money(weekStake)} in play over the next seven days.` : null,
  );
}

// ——————————————————————————— ledger ———————————————————————————

export interface LedgerLine { from: string; to: string; amount: number; description?: string | null }

/** /last, /ledger and /rewind all render through here. */
export function buildLedgerList(rows: LedgerLine[], title: string, sub?: string | null): string {
  if (!rows.length) return block(head(title), 'Nothing written yet. Suspiciously quiet.');
  const left = rows.map((r) => `${r.from} → ${r.to}`);
  const w = left.reduce((m, s) => Math.max(m, s.length), 0);
  const amtW = rows.reduce((m, r) => Math.max(m, money(r.amount).length), 0);
  const body = rows.map((r, i) => {
    const line = `${padR(left[i], w)}  ${padL(money(r.amount), amtW)}`;
    return r.description ? `${line}\n  ${r.description}` : line;
  }).join('\n');
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return block(head(title, sub), pre(esc(body)), `${money(total)} changed hands.`);
}

// ——————————————————————————— trophies ———————————————————————————

export interface TrophyRow { name: string; status: string; eachOtherPays: number }

export function buildTrophies(rows: TrophyRow[], poolInr = 24000): string {
  if (!rows.length) return block(head('Trophies'), 'No races open.');
  const body = cols(rows.map((r) => [r.name, `${padR(r.status, 9)}${r.eachOtherPays ? `${money(r.eachOtherPays)} each` : 'no trophy'}`]));
  return block(
    head('Trophies', `${money(poolInr)} pool`),
    pre(esc(body)),
    'Winner collects from each of the other three. Nobody splits anything.',
  );
}

// ——————————————————————————— settle ———————————————————————————

export function buildSettle(pays: { from: string; to: string; amount: number }[]): string {
  if (!pays.length) return block(head('Settle up'), 'Everyone is square. Nothing to transfer, nothing to argue about.');
  const body = cols(pays.map((p) => [`${p.from} → ${p.to}`, money(p.amount)]));
  return block(
    head('Settle up', `${pays.length} payment${pays.length > 1 ? 's' : ''}`),
    pre(esc(body)),
    'Pay up and the table resets to zero.',
  );
}

// ——————————————————————————— static ———————————————————————————

export function buildHelp(commissioner: boolean): string {
  const sections: [string, [string, string][]][] = [
    ['Money', [
      ['/standings', 'table + photo'],
      ['/balance', 'one player, net'],
      ['/me', 'your record'],
      ['/settle', 'who pays whom'],
      ['/ledger', 'recent payments'],
      ['/stakes', 'money in play this week'],
      ['/exposure', 'your ceiling and floor'],
      ['/swing', 'biggest swing left'],
    ]],
    ['Football', [
      ['/next', 'what counts next'],
      ['/last', 'recent results'],
      ['/trophies', 'live races'],
      ['/club', 'one club, whole season'],
      ['/streak', 'everyone’s form'],
    ]],
    ['Needle', [
      ['/taunt', 'roast the latest loser'],
      ['/h2h', 'two of you, head to head'],
      ['/nemesis', 'who you keep paying'],
      ['/rewind', 'the last seven days'],
      ['/awards', 'season honours'],
    ]],
    ['Admin', [
      ['/report', 'file a result'],
      ['/rules', 'the money rules'],
    ]],
  ];
  if (commissioner) sections.push(['Commissioner', [['/pending', 'approval queue'], ['/health', 'provider + cron'], ['/pin', 'refresh the panel'], ['/correct', 'fix a wrong result'], ['/quiet', 'force quiet on/off']]]);
  const body = sections.map(([t, rows]) => `${t}\n${cols(rows).split('\n').map((l) => ` ${l}`).join('\n')}`).join('\n\n');
  return block(head('Commands'), pre(esc(body)));
}

export function buildRules(): string {
  const body = cols([
    ['Win by 1–3', `${money(500)} from the loser`],
    ['Win by 4+', `${money(1000)} from the loser`],
    ['Draw', 'nothing moves'],
    ['Same owner', 'nothing moves'],
  ]);
  return block(
    head('The rules'),
    pre(esc(body)),
    'Knockouts: whoever advances wins the tie. Two legs count as one aggregate.\nTrophies: the winner collects from each of the other three.',
  );
}
