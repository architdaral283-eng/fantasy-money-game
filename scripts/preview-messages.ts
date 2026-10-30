// Prints every outbound message shape with sample data, so a format change can
// be eyeballed before it reaches the group.  npm run preview:messages
import {
  buildFixtureNotice, buildFixtureList, buildLedgerList, buildTrophies, buildSettle, buildHelp, buildRules,
} from '../src/lib/notify/format';
import { buildPinText } from '../src/lib/notify/panel';

const show = (title: string, body: string) => {
  console.log('\n' + '─'.repeat(60));
  console.log(title);
  console.log('─'.repeat(60));
  console.log(body.replace(/<\/?pre>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
};

const fixture = {
  home: 'Barcelona', away: 'Real Madrid', compId: 'laliga',
  ownerA: 'Anmol', ownerB: 'Vedant', timeIST: '01:30', dateIST: 'Sun 26 Oct',
  h2h: 'Anmol leads 3–1', netA: 1500, netB: -500,
};

show('REMINDER — day before', buildFixtureNotice({ ...fixture, kind: 'tomorrow'}));
show('PRE-MATCH — 30 minutes', buildFixtureNotice({ ...fixture, kind: 'prematch', mins: 28}));
show('CUP TIE DRAWN — no date yet', buildFixtureNotice({ ...fixture, kind: 'drawn', compId: 'facup', timeIST: null, dateIST: null, round: 'Quarter-final'}));
show('/next and /fixtures', buildFixtureList([
  { home: 'Barcelona', away: 'Real Madrid', compId: 'laliga', ownerA: 'Anmol', ownerB: 'Vedant', timeIST: '01:30', dateIST: 'Sun 26 Oct' },
  { home: 'Arsenal', away: 'Inter', compId: 'ucl', ownerA: 'Archit', ownerB: 'Harshal', timeIST: '23:15', dateIST: 'Sun 26 Oct' },
  { home: 'Aston Villa', away: 'Manchester City', compId: 'epl', ownerA: 'Anmol', ownerB: 'Harshal', timeIST: '19:00', dateIST: 'Tue 28 Oct' },
  { home: 'Chelsea', away: 'Bayern Munich', compId: 'facup', ownerA: 'Harshal', ownerB: 'Vedant', timeIST: null, dateIST: null },
]));
show('/last and /ledger', buildLedgerList([
  { from: 'Vedant', to: 'Anmol', amount: 500, description: 'Barcelona 2–1 Real Madrid, La Liga' },
  { from: 'Harshal', to: 'Archit', amount: 1000, description: 'Arsenal 3–0 Inter, UCL' },
], 'Last results', '2 most recent'));
show('/trophies', buildTrophies([
  { name: 'UEFA Champions League', status: 'Live', eachOtherPays: 2000 },
  { name: 'Premier League', status: 'Live', eachOtherPays: 1000 },
  { name: 'FA Cup', status: 'Live', eachOtherPays: 500 },
]));
show('/settle', buildSettle([{ from: 'Anmol', to: 'Harshal', amount: 2000 }, { from: 'Vedant', to: 'Archit', amount: 500 }]));
show('/rules', buildRules());
show('/help', buildHelp(true));
show('PINNED PANEL', buildPinText(
  [{ name: 'Harshal', net: 2500, w: 7, l: 3, d: 1 }, { name: 'Archit', net: 500, w: 5, l: 4, d: 2 },
   { name: 'Vedant', net: -1000, w: 4, l: 6, d: 1 }, { name: 'Anmol', net: -2000, w: 2, l: 8, d: 1 }],
  14, 63, { home: 'Barcelona', away: 'Real Madrid', ownerA: 'Anmol', ownerB: 'Vedant', whenIST: '01:30' }, '21:14',
));

// ——— the result message, end to end, through the real builders ———
// Napoli 3–3 Roma, 24 Oct 2026. Scorers as ESPN reported them; balances and
// head to head as the database had them that night.
import { readFileSync } from 'node:fs';
import { buildContext } from '../src/lib/roast/context';
import { statPrefix, renderBody, pickTemplate, type RoastTemplate } from '../src/lib/roast/select';
import { scorerLines } from '../src/lib/notify/format';

{
  const goals = [
    { minute: "28'", player: 'F. Anguissa', clubId: 'napoli' },
    { minute: "48'", player: 'S. McTominay', clubId: 'napoli' },
    { minute: "69'", player: 'M. Soulè', clubId: 'roma' },
    { minute: "74'", player: 'L. Balerdi', clubId: 'roma' },
    { minute: "83'", player: 'S. McTominay', clubId: 'napoli' },
    { minute: "89'", player: 'L. Balerdi', clubId: 'roma' },
  ];
  const ctx = buildContext({
    homeClub: { id: 'napoli', name: 'Napoli', pick: 2, owner: 'vedant', ownerName: 'Vedant', league: 'Serie A' },
    awayClub: { id: 'roma', name: 'AS Roma', pick: 3, owner: 'harshal', ownerName: 'Harshal', league: 'Serie A' },
    homeGoals: 3, awayGoals: 3, competition: 'Serie A', amount: 0, derbyId: 'derby-del-sole',
    dossier: { marquee: 'Scott McTominay', manager: 'Antonio Conte' },
    nets: { archit: 3000, harshal: 500, anmol: 0, vedant: -3500 }, fixtureDelta: {},
    h2h: { aWins: 0, bWins: 2, leader: 'Harshal' }, owed: 1000, streakLosses: 0, rankOfLoser: 4,
    isShootout: false, isLeadChange: false,
    scorers: scorerLines(goals, { id: 'napoli', name: 'Napoli' }, { id: 'roma', name: 'AS Roma' }),
  });
  // draw lines straight from the migration, so the preview shows what will actually be picked from
  const sql = readFileSync('supabase/migrations/0020_draw_taunts.sql', 'utf8');
  const rows = [...sql.matchAll(/\(\$B\$([\s\S]*?)\$B\$,'(\w+)','(\w+)',NULL,NULL,'(\{[^']*\})',(\d),(\d+)\)/g)];
  const templates: RoastTemplate[] = rows.map((m, i) => ({
    id: i + 1, body: m[1], target: m[2] as RoastTemplate['target'], scope: m[3] as RoastTemplate['scope'],
    club_id: null, derby_id: null, conditions: JSON.parse(m[4]), severity: Number(m[5]), weight: Number(m[6]),
    author_player_id: null, use_count: 0, last_used_at: null,
  }));
  const pick = pickTemplate(templates, ctx, Date.now(), () => 0.3);
  show('RESULT — Napoli 3–3 Roma (real data)', `${statPrefix(ctx)}\n\n${pick ? renderBody(pick.body, ctx) : '(no taunt)'}`);
  console.log('\nOther lines the same result could draw:');
  for (const r of [0.05, 0.6, 0.95]) {
    const p = pickTemplate(templates, ctx, Date.now(), () => r);
    if (p) console.log(' • ' + renderBody(p.body, ctx));
  }
  show('THEN THE STANDINGS IMAGE (same data)', buildPinText(
    [{ name: 'Archit', net: 3000, w: 6, l: 0, d: 1 }, { name: 'Harshal', net: 500, w: 4, l: 4, d: 3 },
     { name: 'Anmol', net: 0, w: 3, l: 3, d: 1 }, { name: 'Vedant', net: -3500, w: 2, l: 8, d: 1 }],
    18, 65, null, '23:45',
  ));
}
