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

import { nthTime } from '@/lib/predictions/score';

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
// "4+" alone reads as four goals between them. It is the margin — §5 of the
// constitution, marginToAmount() in the engine — and the ambiguity has
// already put a wrong number in one function.
export const STAKE_LINE = '₹500 on it. ₹1,000 if it is won by four.';

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
  /**
   * The same two names as ready-made HTML mentions, when they are linked.
   * Already escaped and already markup, so these are interpolated RAW — never
   * put anything through esc() that arrives in one of these.
   */
  ownerAHtml?: string | null;
  ownerBHtml?: string | null;
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

  // A mention pierces a muted group; a plain name does not. Only the two
  // with money on this fixture get one.
  const a = n.ownerAHtml || esc(n.ownerA);
  const b = n.ownerBHtml || esc(n.ownerB);

  const subject = `${esc(n.home)} v ${esc(n.away)}\n${esc(where)}`;
  const moneyBlock = n.sameOwner
    ? `${a} owns both. Nothing moves.`
    : `${a} v ${b}\n${STAKE_LINE}`;

  const tail = n.kind === 'drawn' && !n.timeIST
    ? 'No date yet. It shows up in /next the moment the provider gives one.'
    : null;

  // A reminder says what is happening and what it costs. Nothing else.
  // Head to head, the last meeting and the money table used to ride along
  // here; they are available on demand as /h2h, /nemesis and /standings, and
  // in a reminder they were noise that buried the fixture.
  //
  // No taunt before a result either. The roast lands when the money moves.
  return block(header, subject, moneyBlock, tail);
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
export interface DigestGeneralItem { headline: string; context: string }

/**
 * The 23:00 IST brief, for the days between fixtures when the group goes quiet.
 *
 * Club, owner, headline — the owner's name is what makes a headline worth
 * reacting to. Then a little general football, each item carrying ESPN's own
 * one-line summary: the first draft printed bare headlines about clubs nobody
 * owns and they read as non sequiturs.
 *
 * The next fixture is deliberately NOT here. The 24-hour reminder and the
 * 30-minute warning already carry it, and repeating it nightly only teaches
 * people to skim.
 */
export function buildDigestText(
  dateLabel: string,
  ours: DigestClubItem[],
  general: DigestGeneralItem[] = [],
): string {
  const header = head('Daily news brief', `Tonight · ${dateLabel}`);
  if (!ours.length && !general.length) {
    return block(header, 'Nothing happened to any of your sixteen today. Sixteen clubs, four leagues, not one of them worth a headline.');
  }
  const clubBlock = ours.length
    ? pre(ours.map((it) => `${esc(it.club)} · ${esc(it.owner)}\n   ${esc(it.headline)}`).join('\n\n'))
    : null;
  const generalBlock = general.length
    ? block('ELSEWHERE', pre(general.map((g) => `${esc(g.headline)}\n   ${esc(g.context)}`).join('\n\n')))
    : null;
  return block(header, clubBlock, generalBlock);
}

// ——————————————————————————— the Sunday roundup ———————————————————————————

export interface WeeklyInput {
  weekLabel: string;
  /** name, title, net, form string, points */
  table: { name: string; title: string; net: number; form: string }[];
  rivalry: { a: string; b: string; moved: number; leader: string | null } | null;
  moment: { description: string; amount: number; from: string; to: string } | null;
  unlucky: { name: string; narrow: number } | null;
  exposed: { name: string; fixtures: number }[];
  chase: { chaser: string; leader: string; wins: number } | null;
  landmark: string | null;
}

/**
 * One message a week carrying eight features: the form table, running titles,
 * rivalry heat, the moment of the week, the unlucky table, who is exposed,
 * title-race maths and season landmarks.
 *
 * It is one message on purpose. The group ceiling is six a day and eight
 * separate posts would read as noise — a Sunday roundup reads as an event.
 */
export function buildWeeklyText(w: WeeklyInput): string {
  const tableRows = w.table.map((r) => [`${r.name} — ${r.title}`, `${signed(r.net)}  ${r.form}`] as [string, string]);

  const parts: string[] = [];
  if (w.moment) {
    parts.push(`Moment of the week: ${esc(w.moment.description)} — ${money(w.moment.amount)} off ${esc(w.moment.from)}.`);
  }
  if (w.rivalry && w.rivalry.moved > 0) {
    const lead = w.rivalry.leader ? `${esc(w.rivalry.leader)} is ahead on it.` : 'Dead level.';
    parts.push(`Hottest rivalry: ${esc(w.rivalry.a)} v ${esc(w.rivalry.b)}, ${money(w.rivalry.moved)} across the season. ${lead}`);
  }
  if (w.unlucky && w.unlucky.narrow > 1) {
    parts.push(`${esc(w.unlucky.name)} has lost ${w.unlucky.narrow} by a single goal. He will mention it.`);
  }
  if (w.chase && w.chase.wins > 0) {
    parts.push(`${esc(w.chase.chaser)} needs ${w.chase.wins} more wins than ${esc(w.chase.leader)} to catch him.`);
  }
  const exposed = w.exposed.filter((e) => e.fixtures > 0);
  if (exposed.length) {
    parts.push(`This week: ${exposed.map((e) => `${esc(e.name)} ${e.fixtures}`).join(' · ')}${
      w.exposed.some((e) => e.fixtures === 0) ? `. ${esc(w.exposed.filter((e) => e.fixtures === 0).map((e) => e.name).join(' and '))} has nothing on.` : ''}`);
  }

  return block(
    head('The week', w.weekLabel),
    pre(esc(cols(tableRows))),
    parts.join('\n\n'),
    w.landmark ? esc(w.landmark) : null,
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

/**
 * The command list, in one place.
 *
 * Telegram's "/" menu is server-side state on Telegram's machines, not
 * something the code controls — which is why /roastadd, /roastkill and
 * /roaststats were still being offered months after their handlers were
 * deleted. Both /help and the menu registration read THIS, so the two can no
 * longer drift apart: adding a command here puts it in both.
 *
 * Commissioner commands are deliberately excluded from the menu — it shows to
 * all four players and three of them would only ever get "Commissioner only."
 */
export const COMMAND_SECTIONS: [string, [string, string][]][] = [
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
      ['/clubform', 'your four clubs, added up'],
    ]],
    ['Needle', [
      ['/taunt', 'roast the latest loser'],
      ['/h2h', 'two of you, head to head'],
      ['/nemesis', 'who you keep paying'],
      ['/rewind', 'the last seven days'],
      ['/predictions', 'the prediction league'],
      ['/awards', 'season honours'],
    ]],
    ['Admin', [
      ['/report', 'file a result'],
      ['/rules', 'the money rules'],
    ]],
];

export const COMMISSIONER_COMMANDS: [string, string][] = [
  ['/pending', 'approval queue'],
  ['/health', 'provider + cron'],
  ['/pin', 'refresh the panel'],
  ['/correct', 'fix a wrong result'],
  ['/quiet', 'force quiet on/off'],
  ['/setup', 're-register webhook + menu'],
];

/** Flat list for setMyCommands: no leading slash, players only. */
export function playerCommands(): { command: string; description: string }[] {
  const out = COMMAND_SECTIONS.flatMap(([, rows]) => rows)
    .map(([c, d]) => ({ command: c.replace(/^\//, ''), description: d }));
  out.push({ command: 'help', description: 'all commands' });
  return out;
}

export function buildHelp(commissioner: boolean): string {
  const sections: [string, [string, string][]][] = [...COMMAND_SECTIONS];
  if (commissioner) sections.push(['Commissioner', COMMISSIONER_COMMANDS]);
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

// ---------------------------------------------------------------------------
// DMs. These two go to one person, so they can say "you" and spend as many
// messages as they like — the ceiling is a group-chat rule.

export function ordinal(n: number): string {
  // 11th, 12th, 13th are the exceptions; past them the last digit decides.
  // Minutes run past 90, so 91st and 92nd are reachable.
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  const d = n % 10;
  return `${n}${d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}`;
}

export interface ScoutClub {
  name: string;
  rank: number;
  points: number;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
}
export interface ScoutNews { club: string; headline: string }
export interface ScoutBrief {
  whenLabel: string;          // 'Sat, 31 Oct, 23:00 IST'
  home: string;
  away: string;
  compId: string;
  compName?: string | null;
  yourClub: string;
  theirClub: string;
  opponent: string;           // the other owner's name
  /** The opposition, in its own league. Null when ESPN gave nothing. */
  theirs: ScoutClub | null;
  /** Your club, same table, for comparison. */
  mine: ScoutClub | null;
  /** Injuries, bans, signings — for either club, in the last week. */
  news: ScoutNews[];
}

/** ' 2nd · 20 pts from 9 · W6 D2 L1 · 22 scored, 9 conceded' */
function scoutClubLines(c: ScoutClub): string {
  const where = c.rank > 0 ? `${ordinal(c.rank)}` : 'unranked';
  return [
    ` ${where} · ${c.points} pt${c.points === 1 ? '' : 's'} from ${c.played}`,
    ` W${c.w} D${c.d} L${c.l} · ${c.gf} scored, ${c.ga} conceded`,
  ].join('\n');
}

/**
 * The DM that goes to the two people with money on a fixture.
 *
 * It scouts the OPPOSITION CLUB. It used to scout the opposing player —
 * their last five results in this game, the head to head, what the table
 * would look like if you won — which told you nothing about the match you
 * were about to watch, and all of which is a command away anyway.
 */
export function buildScoutBrief(s: ScoutBrief): string {
  const where = [compName(s.compId, s.compName), s.whenLabel].filter(Boolean).join(' · ');

  const them = s.theirs
    ? `${esc(s.theirClub)} — ${esc(s.opponent)}\n${esc(scoutClubLines(s.theirs))}`
    : `${esc(s.theirClub)} — ${esc(s.opponent)}\n No league table available.`;
  const mine = s.mine ? `Your ${esc(s.yourClub)}\n${esc(scoutClubLines(s.mine))}` : null;

  const news = s.news.length
    ? ['Team news', ...s.news.map((n) => ` ${esc(n.club)} · ${esc(n.headline)}`)].join('\n')
    : 'No team news for either club this week.';

  return block(
    head('Scouting', s.theirClub),
    `${esc(s.home)} v ${esc(s.away)}\n${esc(where)}`,
    them,
    mine,
    news,
    STAKE_LINE,
  );
}

export interface NearMissNote {
  home: string;
  away: string;
  h90: number;
  a90: number;
  minute: number;
  scorer: string;
  before: { h: number; a: number };
  kind: 'flip' | 'bonus';
  /** What it did to your balance: negative means it cost you. */
  delta: number;
  opponent: string;
}

/** The goal that decided it, to whichever of the two it happened to. */
export function buildNearMiss(n: NearMissNote): string {
  const cost = n.delta < 0;
  const amount = money(Math.abs(n.delta));
  const was = `${n.before.h}–${n.before.a}`;
  const body = n.kind === 'flip'
    ? (n.before.h === n.before.a
        ? `Until the ${ordinal(n.minute)} minute it was ${was} and nothing was moving.`
        : `Until the ${ordinal(n.minute)} minute it was ${was}.`)
    : `Until the ${ordinal(n.minute)} minute it was ${was}. The fourth goal doubled it.`;
  const verdict = cost
    ? `That goal cost you ${amount} to ${esc(n.opponent)}.`
    : `That goal took ${amount} off ${esc(n.opponent)}.`;

  return block(
    head('Near miss', `${n.minute}'`),
    `${esc(n.home)} ${n.h90}–${n.a90} ${esc(n.away)}\n${esc(n.scorer)} ${n.minute}'`,
    `${body} ${verdict}`,
  );
}

// ---------------------------------------------------------------------------
// Silence, and the month in review.

export interface SilenceRow { name: string; days: number | null; net: number }

/**
 * One line naming whoever has stopped talking. Rides on the nightly brief
 * rather than taking a message of its own — the point is to be noticed, not
 * to add to the noise.
 */
export function buildSilenceLine(rows: SilenceRow[]): string | null {
  if (!rows.length) return null;
  const names = rows.map((r) => esc(r.name));
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  if (rows.length === 1) {
    const r = rows[0];
    if (r.days === null) return `${list} has not said one word in here all season.`;
    const v = [
      `Nobody has heard from ${list} in ${r.days} days. ${signed(r.net)} will do that to a man.`,
      `${r.days} days without a word from ${list}. The ledger is louder than he is.`,
      `${list} has gone ${r.days} days silent, sitting on ${signed(r.net)} with nothing to add.`,
    ];
    return v[r.days % v.length];
  }

  const worst = rows[0].days;
  if (worst === null) return `${list} have not said one word in here all season.`;
  const v = [
    `Silence from ${list}. ${worst} days at the longest.`,
    `${list} have all gone quiet, the longest run ${worst} days and counting.`,
    `Not a word from ${list}. ${worst} days at the worst of it.`,
  ];
  return v[worst % v.length];
}

export interface MonthlyLine { name: string; amount: number }
export interface MonthlyBrief {
  /** 'month' heads it "THE MONTH"; 'season' heads it "THE SEASON" and renames the awards. */
  period?: 'month' | 'season';
  label: string;                       // 'October 2026'
  owner: MonthlyLine | null;
  flop: MonthlyLine | null;
  club: (MonthlyLine & { owner: string }) | null;
  worstClub: (MonthlyLine & { owner: string }) | null;
  biggest: { description: string; amount: number; from: string; to: string } | null;
  moved: number;
  results: number;
}

/** The 1st-of-the-month message, and the same shape again in June. */
export function buildMonthlyAwards(m: MonthlyBrief): string {
  const season = m.period === 'season';
  const heading = season ? 'The season' : 'The month';
  const of = season ? 'of the season' : 'of the month';

  if (m.results === 0 && m.moved === 0) {
    return block(
      head(heading, m.label),
      season
        ? 'Nothing moved all season. Which would take some explaining.'
        : 'Nothing moved. Nobody won anything. A month of pure talk.',
    );
  }
  const people = [
    m.owner ? `Owner ${of}: ${esc(m.owner.name)}, ${signed(m.owner.amount)}` : null,
    m.flop ? `Flop ${of}: ${esc(m.flop.name)}, ${signed(m.flop.amount)}` : null,
  ].filter(Boolean).join('\n');

  const clubs = [
    m.club ? `Club ${of}: ${esc(m.club.name)} — ${esc(m.club.owner)}, ${signed(m.club.amount)}` : null,
    m.worstClub ? `Worst club: ${esc(m.worstClub.name)} — ${esc(m.worstClub.owner)}, ${signed(m.worstClub.amount)}` : null,
  ].filter(Boolean).join('\n');

  const big = m.biggest
    ? `Biggest single result: ${esc(m.biggest.description)}. ${money(m.biggest.amount)}, ${esc(m.biggest.from)} to ${esc(m.biggest.to)}.`
    : null;

  const tally = `${money(m.moved)} moved across ${m.results} result${m.results === 1 ? '' : 's'}.`;

  return block(head(heading, m.label), people, clubs, big, tally);
}

// ---------------------------------------------------------------------------
// The prediction league. No money on it, which is exactly why all four can
// play every fixture instead of only the two who drafted the clubs.

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface PredictionOutcome {
  hits: string[];
  /** `nth` is how many they have now called wrong this month, this one included. */
  misses: { name: string; backed: string; nth: number }[];
}

/**
 * Appended to the result message, never sent on its own — the point of the
 * poll is to make the result message mean something to all four.
 */
export function buildPredictionResult(p: PredictionOutcome): string | null {
  const total = p.hits.length + p.misses.length;
  if (!total) return null;

  const lines: string[] = [];
  if (!p.hits.length) {
    lines.push('Nobody called that one.');
  } else if (!p.misses.length) {
    lines.push(total === 1 ? `${esc(p.hits[0])} called it, alone.` : `All ${total} called it.`);
  } else {
    lines.push(`Called it: ${esc(nameList(p.hits))}.`);
  }

  // Two named misses at most. A third is a paragraph, and this rides on
  // someone else's message.
  for (const m of p.misses.slice(0, 2)) {
    lines.push(`${esc(m.name)} backed ${esc(m.backed)}. ${nthTime(m.nth)} time this month.`);
  }

  return block(head('Predictions'), lines.join('\n'));
}

export interface PredictionStanding { name: string; played: number; hits: number; points: number; pct: number }

/** The /predictions table. */
export function buildPredictionTable(rows: PredictionStanding[], settled: number): string {
  if (!rows.length || !settled) {
    return block(
      head('Predictions'),
      'Nothing settled yet. A poll goes out with every fixture reminder — one tap, no money.',
    );
  }
  const body = rows
    .map((r) => `${padR(r.name, 9)} ${String(r.hits).padStart(2)}/${String(r.played).padEnd(2)}  ${String(r.pct).padStart(3)}%  ${String(r.points).padStart(2)} pt`)
    .join('\n');
  return block(
    head('Predictions', `${settled} settled`),
    pre(esc(body)),
    'No money on it. There is a trophy in May.',
  );
}

/** One line of it, for the Sunday roundup. */
export function predictionLine(rows: PredictionStanding[]): string | null {
  const played = rows.filter((r) => r.played > 0);
  if (played.length < 2) return null;
  const [top, ...rest] = played;
  return `Predictions: ${esc(top.name)} leads on ${top.points}, ${rest.map((r) => `${esc(r.name)} ${r.points}`).join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Achievements and the six head-to-head trophies.

export interface BadgeLine { name: string; blurb: string; earned: boolean; detail?: string }

/** Compact enough to ride at the bottom of /me. */
export function buildBadges(rows: BadgeLine[]): string | null {
  if (!rows.length) return null;
  const got = rows.filter((r) => r.earned);
  const missing = rows.filter((r) => !r.earned).map((r) => r.name);

  if (!got.length) {
    return block(head('Badges', `0 of ${rows.length}`), 'Nothing yet. Not even the bad ones.');
  }

  const body = got.map((r) => `${padR(r.name, 13)} ${r.detail ?? ''}`.trimEnd()).join('\n');
  return block(
    head('Badges', `${got.length} of ${rows.length}`),
    pre(esc(body)),
    missing.length ? `Still missing: ${esc(missing.join(', '))}.` : 'All of them. Including the ones nobody wants.',
  );
}

export interface TrophyLine {
  a: string;
  b: string;
  holder: string | null;
  aWins: number;
  bWins: number;
  draws: number;
  games: number;
}

/** The six pairings and who currently holds each. */
export function buildRivalryTrophies(rows: TrophyLine[], you?: string | null): string {
  const body = rows.map((r) => {
    const score = r.games ? `${r.aWins}–${r.bWins}` : '—';
    return `${padR(r.a, 8)} ${padR(score, 5)} ${padR(r.b, 8)}  ${r.holder ?? 'vacant'}`;
  }).join('\n');

  const mine = you ? rows.filter((r) => r.holder === you).length : null;
  const tail = mine === null
    ? 'Held until the other man goes ahead.'
    : mine === 0
      ? 'You hold none of them. Held until the other man goes ahead.'
      : `You hold ${mine} of ${rows.length}. Held until the other man goes ahead.`;

  return block(head('Head to head', `${rows.length} trophies`), pre(esc(body)), tail);
}

// ---------------------------------------------------------------------------
// The club form side-table. A second leaderboard, for whoever is losing the
// first one.

export interface ClubFormRow { name: string; points: number; gf: number; ga: number; diff: number; clubs: number }

export function buildClubForm(
  rows: ClubFormRow[],
  best: { club: string; owner: string; diff: number } | null,
  worst: { club: string; owner: string; diff: number } | null,
): string {
  if (!rows.length || rows.every((r) => r.clubs === 0)) {
    return block(head('Club form'), 'No league tables available right now. Try again later.');
  }
  const body = rows
    .map((r) => `${padR(r.name, 9)} ${String(r.points).padStart(3)} pts   ${String(r.gf).padStart(3)} GF  ${String(r.ga).padStart(3)} GA  ${r.diff >= 0 ? '+' : '−'}${String(Math.abs(r.diff)).padStart(2)}`)
    .join('\n');

  const notes = [
    best ? `Best club: ${esc(best.club)} — ${esc(best.owner)}, ${best.diff >= 0 ? '+' : '−'}${Math.abs(best.diff)}.` : null,
    worst ? `Worst: ${esc(worst.club)} — ${esc(worst.owner)}, ${worst.diff >= 0 ? '+' : '−'}${Math.abs(worst.diff)}.` : null,
  ].filter(Boolean).join('\n');

  return block(
    head('Club form', 'league games only'),
    pre(esc(body)),
    notes,
    'Four clubs each, added up. The money table says something else.',
  );
}

/** One line of it for the Sunday roundup. */
export function clubFormLine(rows: ClubFormRow[]): string | null {
  const live = rows.filter((r) => r.clubs > 0);
  if (live.length < 2) return null;
  const top = live[0];
  const bottom = live[live.length - 1];
  return `Club form: ${esc(top.name)}'s four lead on ${top.points} points, ${esc(bottom.name)}'s bottom on ${bottom.points}.`;
}

// ---------------------------------------------------------------------------
// A fixture that is not happening after all.

export interface PostponedNotice {
  home: string;
  away: string;
  /** 'Postponed', 'Abandoned' or 'Cancelled'. */
  reason: string;
  /** True when the group had already been told it was on. */
  wasAnnounced: boolean;
  /** True when a poll had been opened and is being thrown away. */
  hadPoll: boolean;
}

export function buildPostponed(n: PostponedNotice): string {
  const tail = [
    'Nothing moves.',
    n.hadPoll ? 'The poll is void.' : null,
    'It goes back in the diary the moment a new date lands.',
  ].filter(Boolean).join(' ');

  return block(
    head('Called off', n.reason),
    `${esc(n.home)} v ${esc(n.away)}`,
    tail,
  );
}

export interface PositionLine { rank: number; club: string; owner: string; points: number }
export interface PositionBlock { label: string; lines: PositionLine[] }

/**
 * Where the sixteen clubs sit, league by league. Monthly only: it is thirty
 * lines, and it goes out as its own message rather than a photo caption,
 * because Telegram caps a caption at 1024 characters.
 *
 * A rank of 0 means ESPN has not computed one — printed as a dash rather
 * than as a confident "0th".
 */
export function buildPositions(blocks: PositionBlock[], label: string): string | null {
  if (!blocks.length) return null;
  const body = blocks
    .map((b) => [
      b.label,
      ...b.lines.map((l) =>
        `${padL(l.rank > 0 ? String(l.rank) : '–', 2)}  ${padR(l.club, 18)} ${padR(l.owner, 8)}${padL(String(l.points), 3)}`),
    ].join('\n'))
    .join('\n\n');

  return block(
    head('Positions', label),
    pre(esc(body)),
    'League position and points as they stand this morning.',
  );
}
