// Prints every outbound message shape with sample data, so a format change can
// be eyeballed before it reaches the group.  npm run preview:messages
import {
  buildFixtureNotice, buildFixtureList, buildLedgerList, buildTrophies, buildSettle, buildHelp, buildRules,
} from '../src/lib/notify/format';
import { buildBriefText, buildPinText } from '../src/lib/notify/panel';

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
show('09:00 BRIEF', buildBriefText([
  { home: 'Barcelona', away: 'Real Madrid', compId: 'laliga', ownerA: 'Anmol', ownerB: 'Vedant', whenIST: '01:30' },
  { home: 'Arsenal', away: 'Inter', compId: 'ucl', ownerA: 'Archit', ownerB: 'Harshal', whenIST: '23:15' },
]));
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
