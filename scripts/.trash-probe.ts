// Live dry run of the nightly brief: real ESPN feeds, real selection, no send.
import { NEWS_LEAGUES, parseNews, selectDigest, clubOfHeadline, prominence } from '../src/lib/news/espn-news';

const NAME: Record<string, [string, string]> = {
  arsenal: ['Arsenal', 'Archit'], 'man-city': ['Manchester City', 'Harshal'],
  'man-utd': ['Manchester United', 'Vedant'], 'aston-villa': ['Aston Villa', 'Anmol'],
  'real-madrid': ['Real Madrid', 'Vedant'], barcelona: ['Barcelona', 'Anmol'],
  atletico: ['Atletico Madrid', 'Archit'], 'real-betis': ['Real Betis', 'Harshal'],
  bayern: ['Bayern Munich', 'Harshal'], leverkusen: ['Bayer Leverkusen', 'Archit'],
  dortmund: ['Borussia Dortmund', 'Anmol'], 'rb-leipzig': ['RB Leipzig', 'Vedant'],
  inter: ['Inter', 'Anmol'], napoli: ['Napoli', 'Vedant'],
  roma: ['AS Roma', 'Harshal'], juventus: ['Juventus', 'Archit'],
};
const now = Date.now();
const all = (await Promise.all(NEWS_LEAGUES.map(async (lg) => {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/news?limit=25`, { cache: 'no-store' });
  return r.ok ? parseNews(await r.json(), now) : [];
}))).flat();

const picked = selectDigest(all);
console.log(`scanned ${all.length} kept items\n`);
console.log('DAILY NEWS BRIEF · Tonight · Wed 28 Oct\n');
for (const it of picked.ours) {
  const [club, owner] = NAME[clubOfHeadline(it) ?? ''] ?? ['?', '?'];
  console.log(`${club} · ${owner}`);
  console.log(`   ${it.headline}`);
  console.log(`      [score ${prominence(it)} · ${it.sources} feed(s) · ${it.prominent ? 'headline' : 'story'} · ${it.mentions} tags]\n`);
}
for (const g of picked.general) {
  console.log('ELSEWHERE\n');
  console.log(g.headline);
  console.log(`   ${g.description.slice(0, 150)}`);
  console.log(`      [score ${prominence(g)} · ${g.sources} feed(s)]`);
}
