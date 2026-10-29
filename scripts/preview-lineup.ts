// Renders the team-news card to a PNG so it can be looked at before it is
// ever posted to the group.
//
//   npx tsx scripts/preview-lineup.ts [outPath]
//
// Sample data only — the real card is built from ESPN's rosters at kickoff.
import { ImageResponse } from 'next/og';
import { writeFileSync } from 'node:fs';
import { lineupTree, lineupSize, type LineupCard } from '../src/lib/images/lineups';

const card: LineupCard = {
  competition: 'Bundesliga',
  kickoffIST: '23:00',
  derby: 'Der Klassiker',
  home: {
    club: 'Bayern Munich', owner: 'Harshal', formation: '4-2-3-1',
    xi: ['Neuer', 'Laimer', 'Upamecano', 'Tah', 'Guerreiro', 'Kimmich', 'Pavlović', 'Olise', 'Müller', 'Coman', 'Kane'],
    missing: null,
  },
  away: {
    club: 'Borussia Dortmund', owner: 'Anmol', formation: '4-3-3',
    xi: ['Kobel', 'Ryerson', 'Schlotterbeck', 'Anton', 'Svensson', 'Groß', 'Sabitzer', 'Nmecha', 'Adeyemi', 'Beier', 'Brandt'],
    missing: 'Serhou Guirassy',
  },
  stake: '₹500 on it. ₹1,000 if it is won by four.',
  h2h: 'Harshal leads 2–1',
};

(async () => {
  const out = process.argv[2] ?? 'lineup-preview.png';
  const buf = await new ImageResponse(lineupTree(card), lineupSize()).arrayBuffer();
  if (buf.byteLength < 1000) throw new Error(`Satori returned ${buf.byteLength} bytes — the tree is malformed`);
  writeFileSync(out, Buffer.from(buf));
  console.log(`${out}  ${buf.byteLength} bytes`);
})();
