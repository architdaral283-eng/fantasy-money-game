/** Boot assertion runner — §4.5. Refuses to start if seed totals don't reconcile. */
import { bootCheck } from '../src/lib/seed/fixtures';

const c = bootCheck();
console.log(`League fixtures : ${c.leagueCount} (want 48)`);
console.log(`UCL ties        : ${c.uclCount} (want 21)`);
console.log(`Logged total    : ${c.totalLogged} (want 69)`);
console.log(`Paying          : ${c.payingCount} (want 63)`);
console.log(`UCL per player  : ${JSON.stringify(c.uclPerPlayer)} (want {"harshal":10,"vedant":9,"archit":7,"anmol":4})`);
if (!c.ok) {
  console.error('\nBOOT REFUSED:');
  for (const e of c.errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nBOOT OK: 69 logged · 63 paying.');
