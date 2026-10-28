import { buildDigestText } from '../src/lib/notify/format';
const t = buildDigestText('Wed 28 Oct', [
  { club: 'Arsenal', owner: 'Archit', headline: "Is Fleetwood Town's defeat of Arsenal the biggest upset in League Cup history?" },
  { club: 'Borussia Dortmund', owner: 'Anmol', headline: "Transfer rumors: Dortmund's Nmecha among Liverpool's midfield targets" },
  { club: 'Manchester United', owner: 'Vedant', headline: "Wayne Rooney's son Kai scores 4 goals for Man United under-18s" },
  { club: 'Bayern Munich', owner: 'Harshal', headline: 'Arsenal, Chelsea, City tracking PSG star Doué' },
]);
console.log(t.replace(/<\/?pre>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
console.log('\n--- dead news day ---\n');
console.log(buildDigestText('Thu 29 Oct', []));
