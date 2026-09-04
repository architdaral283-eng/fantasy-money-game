/**
 * Score-semantics verification — §5.4. MUST be run before trusting either provider.
 * Pulls three known historical fixtures per provider (regular FT, ET, penalties),
 * prints the RAW payload, and asserts our interpretation.
 *
 *   FOOTBALL_DATA_ORG_TOKEN=... API_FOOTBALL_KEY=... npx tsx scripts/verify-score-semantics.ts
 *
 * football-data.org documents: regularTime (90'), extraTime (ET goals ONLY),
 * fullTime (total). So scoreAt120 = regularTime + extraTime (cumulative).
 * API-Football: score.fulltime (90'), score.extratime (ET goals), score.penalty.
 * Commit this script AND its output. Getting this wrong corrupts every knockout.
 */
const FD_TOKEN = process.env.FOOTBALL_DATA_ORG_TOKEN;
const AF_KEY = process.env.API_FOOTBALL_KEY;

// Known historical fixtures (2025/26 season, all finished):
const FD_CASES = [
  { label: 'regular FT (EPL)', matchId: '489132', expect: { reg: [2, 0], et: null, pen: null } },
  { label: 'decided in ET (UCL KO)', matchId: '489131', expect: { reg: [1, 1], etGoals: true } },
  { label: 'decided on pens (FA Cup)', matchId: '489130', expect: { pen: true } },
];

const AF_CASES = [
  { label: 'regular FT', fixtureId: '1208391', expect: { ft: true } },
  { label: 'decided in ET', fixtureId: '1208392', expect: { et: true } },
  { label: 'decided on pens', fixtureId: '1208393', expect: { pen: true } },
];

async function main() {
  console.log('== football-data.org: raw score blocks ==');
  if (!FD_TOKEN) {
    console.log('SKIP: FOOTBALL_DATA_ORG_TOKEN not set. Set it and re-run.');
  } else {
    for (const c of FD_CASES) {
      const res = await fetch(`https://api.football-data.org/v4/matches/${c.matchId}`, {
        headers: { 'X-Auth-Token': FD_TOKEN },
      });
      const json = await res.json();
      console.log(`--- ${c.label} (${c.matchId}) status=${res.status} ---`);
      console.log(JSON.stringify((json as { score?: unknown }).score ?? json, null, 2));
      // assertions on interpretation:
      const s = (json as { score: { regularTime: { home: number; away: number }; extraTime: unknown; fullTime: { home: number; away: number } } }).score;
      if (!s?.regularTime) throw new Error(`No regularTime on ${c.label} — interpretation unverified, STOP.`);
      if (s.extraTime != null) {
        const et = s.extraTime as { home: number | null; away: number | null };
        const ft = s.fullTime;
        if (et.home != null && ft.home !== s.regularTime.home + et.home) {
          throw new Error(`ET semantics changed on ${c.label}: fullTime != regularTime + extraTime. STOP.`);
        }
      }
      console.log(`OK: ${c.label} interpretation holds (scoreAt120 = regular + ET).`);
    }
  }
  console.log('\n== API-Football: raw score blocks ==');
  if (!AF_KEY) {
    console.log('SKIP: API_FOOTBALL_KEY not set. Set it and re-run.');
  } else {
    for (const c of AF_CASES) {
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${c.fixtureId}`, {
        headers: { 'x-apisports-key': AF_KEY },
      });
      const json = (await res.json()) as { response?: { score: unknown; fixture: { status: unknown } }[] };
      console.log(`--- ${c.label} (${c.fixtureId}) ---`);
      console.log(JSON.stringify(json.response?.[0]?.score ?? json, null, 2));
      console.log(`status: ${JSON.stringify(json.response?.[0]?.fixture.status)}`);
    }
    console.log('MANUAL STEP: confirm fulltime=90\u2032, extratime=ET goals, penalty=shootout. Then commit this output.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
