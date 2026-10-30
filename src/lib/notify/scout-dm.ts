// The DM to the two people with money on a fixture. The group gets the
// fixture; these two get a scouting report on the club they are about to play.
// Separate surface, separate budget — DMs do not count against the group ceiling.
//
// WHAT CHANGED, 30 Oct 2026. This used to scout the opposing PLAYER: their
// last five results in this game, the head to head, the last meeting, and
// what the money table would look like if you won or lost. None of that is
// scouting, none of it helps you watch the match, and every line of it is a
// command away (/h2h, /nemesis, /standings, /exposure). It now reports the
// opposition club's real league standing, your own club's for comparison,
// and the week's team news — injuries, bans and signings — for both.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildScoutBrief, type ScoutClub, type ScoutNews } from '@/lib/notify/format';
import { sendPlayer } from '@/lib/notify/send';
import { scoutFeed } from '@/lib/providers/scout-feed';
import { clubHeadlines } from '@/lib/news/espn-news';
import type { ClubStanding } from '@/lib/providers/espn-standings';

const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });

export interface ScoutFixture {
  id: string;
  home_club_id: string;
  away_club_id: string;
  competition_id: string;
  kickoff_utc: string | null;
  round?: string | null;
}

interface ClubRow { id: string; name: string; owner_id: string }

/** A standings row, shaped for the message. Null when ESPN had nothing. */
export function scoutClubOf(name: string, clubId: string, standings: ClubStanding[]): ScoutClub | null {
  const s = standings.find((r) => r.clubId === clubId);
  if (!s) return null;
  return { name, rank: s.rank, points: s.points, played: s.played, w: s.w, d: s.d, l: s.l, gf: s.gf, ga: s.ga };
}

/** Returns how many briefs actually left. 0 is a legitimate answer: one owner
 *  on both sides means nothing is at stake. */
export async function scoutDms(db: SupabaseClient, f: ScoutFixture, today = false): Promise<number> {
  const [{ data: clubs }, { data: bal }, { data: comps }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
    db.from('competitions').select('id,name').eq('id', f.competition_id),
  ]);

  const cmap = new Map(((clubs ?? []) as ClubRow[]).map((c) => [c.id, c]));
  const home = cmap.get(f.home_club_id);
  const away = cmap.get(f.away_club_id);
  const oa = home?.owner_id;
  const ob = away?.owner_id;
  if (!oa || !ob || oa === ob) return 0;

  const bals = (bal ?? []) as { id: string; name: string }[];
  const nameOf = (id: string) => bals.find((b) => b.id === id)?.name ?? id;

  // One fetch for both sides, and for every other fixture scouted this tick.
  // A dead feed costs the report its detail, never the message.
  const { standings, news } = await scoutFeed().catch(() => ({ standings: [], news: [] }));

  const whenLabel = f.kickoff_utc
    ? `${today ? 'Today' : dateFmt.format(new Date(f.kickoff_utc))}, ${timeFmt.format(new Date(f.kickoff_utc))} IST`
    : 'date to be confirmed';

  const sides: { me: string; them: string; mine: ClubRow; theirs: ClubRow }[] = [
    { me: oa, them: ob, mine: home as ClubRow, theirs: away as ClubRow },
    { me: ob, them: oa, mine: away as ClubRow, theirs: home as ClubRow },
  ];

  let sent = 0;
  for (const s of sides) {
    // The opposition first: this is their report. Two items each at most, so
    // a noisy week at one club cannot bury the other.
    const items: ScoutNews[] = [
      ...clubHeadlines(news, s.theirs.id, 2).map((n) => ({ club: s.theirs.name, headline: n.headline })),
      ...clubHeadlines(news, s.mine.id, 2).map((n) => ({ club: s.mine.name, headline: n.headline })),
    ];

    const text = buildScoutBrief({
      whenLabel,
      home: home?.name ?? f.home_club_id,
      away: away?.name ?? f.away_club_id,
      compId: f.competition_id,
      compName: ((comps ?? []) as { name: string }[])[0]?.name ?? null,
      yourClub: s.mine.name,
      theirClub: s.theirs.name,
      opponent: nameOf(s.them),
      theirs: scoutClubOf(s.theirs.name, s.theirs.id, standings),
      mine: scoutClubOf(s.mine.name, s.mine.id, standings),
      news: items,
    });

    if (await sendPlayer(db, s.me, 'scout_brief', text)) sent++;
  }
  return sent;
}
