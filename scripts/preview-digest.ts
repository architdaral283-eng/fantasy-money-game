// Renders the nightly brief exactly as the group receives it, so a format
// change can be read before it ships. Sample data, not a live fetch — the
// live dry run is the route itself.
//   npx vite-node -c vitest.config.ts scripts/preview-digest.ts
import { buildDigestText } from '../src/lib/notify/format';

const t = buildDigestText('Wed 28 Oct', [
  { club: 'Bayern Munich', owner: 'Harshal', headline: "Kane's long road to Ballon d'Or glory ends with his crowning moment" },
  { club: 'Arsenal', owner: 'Archit', headline: "Is Fleetwood Town's defeat of Arsenal the biggest upset in League Cup history?" },
  { club: 'Napoli', owner: 'Vedant', headline: 'Napoli coach Massimiliano Allegri will not appeal touchline ban' },
], [
  { headline: "USMNT's Christian Pulisic set to sign new AC Milan contract", context: 'United States star Christian Pulisic is set to sign a new contract with AC Milan through to 2031, sources have told ESPN.' },
]);
console.log(t.replace(/<\/?pre>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log('\n' + '─'.repeat(60) + '\nDEAD NEWS DAY\n' + '─'.repeat(60));
console.log(buildDigestText('Thu 29 Oct', [], []));
