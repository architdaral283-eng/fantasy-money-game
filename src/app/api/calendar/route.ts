// The fixture calendar as a subscribable feed.
//
// Rejected ideas in this project all had one thing in common: they needed
// somebody to keep doing something. This needs one tap, once, and then works
// for the rest of the season with no messages and no commands.
//
//   /api/calendar                -> every counted fixture
//   /api/calendar?player=archit  -> only the ones with your money on them
//
// Public on purpose: it carries fixtures and stakes, nothing that is not
// already on the site, and a calendar subscription cannot send headers.

import { supabaseService } from '@/lib/db/supabase';
import { buildIcs, type IcsEvent } from '@/lib/calendar/ics';

export const dynamic = 'force-dynamic';

const istFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
});

export async function GET(req: Request) {
  const db = supabaseService();
  const want = new URL(req.url).searchParams.get('player')?.toLowerCase() ?? null;

  const [{ data: fx }, { data: clubs }, { data: bal }, { data: comps }] = await Promise.all([
    db.from('fixtures').select('id,home_club_id,away_club_id,competition_id,kickoff_utc,status,round')
      .not('kickoff_utc', 'is', null).order('kickoff_utc'),
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
    db.from('competitions').select('id,name'),
  ]);

  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const pmap = new Map(((bal ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const kmap = new Map(((comps ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const rows = (fx ?? []) as {
    id: string; home_club_id: string; away_club_id: string; competition_id: string;
    kickoff_utc: string; status: string; round?: string | null;
  }[];

  const events: IcsEvent[] = [];
  for (const f of rows) {
    const home = cmap.get(f.home_club_id);
    const away = cmap.get(f.away_club_id);
    const oa = home?.owner_id ?? '';
    const ob = away?.owner_id ?? '';
    if (want && oa !== want && ob !== want) continue;

    const sameOwner = oa !== '' && oa === ob;
    const owners = sameOwner
      ? `${pmap.get(oa) ?? oa} owns both`
      : `${pmap.get(oa) ?? oa} v ${pmap.get(ob) ?? ob}`;

    const comp = [kmap.get(f.competition_id) ?? f.competition_id, f.round || null].filter(Boolean).join(' · ');
    const stake = sameOwner ? 'Nothing moves — same owner.' : '₹500 on it. ₹1,000 if it finishes 4+.';
    const played = f.status === 'RECORDED';

    events.push({
      uid: `fixture-${f.id}@fantasy-money-game`,
      startUtc: f.kickoff_utc,
      minutes: 120,
      summary: `${home?.name ?? f.home_club_id} v ${away?.name ?? f.away_club_id} — ${owners}`,
      description: [comp, stake, `${istFmt.format(new Date(f.kickoff_utc))} IST`, played ? 'Already recorded.' : null]
        .filter(Boolean).join('\n'),
      // A reminder on a fixture already in the ledger is just a buzz.
      alarmMinutes: played || sameOwner ? undefined : 30,
    });
  }

  const name = want
    ? `Fantasy Money Game — ${pmap.get(want) ?? want}`
    : 'Fantasy Money Game';

  return new Response(buildIcs(events, name), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="fantasy-money-game${want ? `-${want}` : ''}.ics"`,
      // Calendar clients poll on their own schedule; a short cache keeps a
      // refresh storm off the database without making the feed stale.
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}
