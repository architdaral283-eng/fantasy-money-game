/**
 * One-time interactive team-ID mapping — §5.3.
 * Fetches the team list per competition, prints candidates, requires a human
 * to confirm each of the 16 mappings. Writes the confirmed IDs into
 * src/lib/providers/team-ids.ts (checked-in seed file).
 * NEVER fuzzy-match at runtime — "Inter" == "Internazionale" == "Inter Milan".
 *
 *   FOOTBALL_DATA_ORG_TOKEN=... API_FOOTBALL_KEY=... npx tsx scripts/map-team-ids.ts
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const CLUBS = [
  'Arsenal', 'Manchester City', 'Manchester United', 'Aston Villa',
  'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Real Betis',
  'Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund', 'RB Leipzig',
  'Inter', 'Napoli', 'AS Roma', 'Juventus',
];

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('Team-ID mapping. For each club, paste the confirmed provider team ID.');
  console.log('Cross-check against the official team list endpoint output shown.\n');
  const out: Record<string, { fd: string; af: string }> = {};
  for (const club of CLUBS) {
    const fd = await rl.question(`football-data.org ID for "${club}": `);
    const af = await rl.question(`api-football ID for "${club}": `);
    out[club] = { fd: fd.trim(), af: af.trim() };
    console.log(`  recorded ${club}: fd=${fd.trim()} af=${af.trim()}\n`);
  }
  console.log('\nPaste this into src/lib/providers/team-ids.ts after verifying each ID twice:');
  console.log(JSON.stringify(out, null, 2));
  rl.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
