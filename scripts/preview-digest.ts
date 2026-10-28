// Renders the nightly brief with real headlines, so a format change can be
// read before it reaches the group.  npx vite-node -c vitest.config.ts scripts/preview-digest.ts
import { buildDigestText } from '../src/lib/notify/format';

const t = buildDigestText('Wed 28 Oct', [
  { club: 'Bayern Munich', owner: 'Harshal', headline: "Vincent Kompany 'stable', could be away for weeks after collapse" },
  { club: 'Arsenal', owner: 'Archit', headline: "Is Fleetwood Town's defeat of Arsenal the biggest upset in League Cup history?" },
  { club: 'Borussia Dortmund', owner: 'Anmol', headline: "Transfer rumours: Dortmund's Nmecha among Liverpool's midfield targets" },
  { club: 'Manchester United', owner: 'Vedant', headline: 'Manchester United beaten by Como in Italy' },
], [
  { headline: "Kane's long road to Ballon d'Or glory ends with his crowning moment", context: "After a remarkable year for Bayern Munich and England, Harry Kane becoming the world's best player is the ultimate reward for years of perseverance." },
  { headline: 'Lens fans banned from Liverpool match for throwing flares', context: 'Fans of Ligue 1 club Lens were banned from buying tickets for a Champions League game at Liverpool by a UEFA disciplinary ruling.' },
]);
console.log(t.replace(/<\/?pre>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log('\n' + '─'.repeat(60) + '\nDEAD NEWS DAY\n' + '─'.repeat(60));
console.log(buildDigestText('Thu 29 Oct', [], []));
