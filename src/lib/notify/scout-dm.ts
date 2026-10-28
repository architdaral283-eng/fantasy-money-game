// The day-before DM to the two people with money on a fixture. The group gets
// the fixture; these two get what it does to them. Separate surface, separate
// budget — DMs do not count against the group ceiling.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildScoutBrief, type ScoutLine } from '@/lib/notify/format';
import { sendPlayer } from '@/lib/notify/send';
import { h2hTally, h2hText, lastMeeting, lastMeetingText } from '@/lib/stats/h2h';
import { formTable, type WldRow } from '@/lib/stats/weekly';
import { impact, type Scenario } from '@/lib/stats/scout';

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
interface FxRow { id: string; home_club_id: string; away_club_id: string; status: string; kickoff_utc: string | null }

/** Returns how many briefs actually left. 0 is a legitimate answer: one owner
 *  on both sides means nothing is at stake. */
export async function scoutDms(db: SupabaseClient, f: ScoutFixture, today = false): Promise<number> {
  const [{ data: clubs }, { data: bal }, { data: comps }, { data: fx }, { data: wld }, { data: res }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name,net_inr'),
    db.from('competitions').select('id,name').eq('id', f.competition_id),
    db.from('fixtures').select('id,home_club_id,away_club_id,status,kickoff_utc').eq('status', 'RECORDED'),
    db.from('wld_records').select('player_id,fixture_id,outcome,occurred_at'),
    db.from('results').select('fixture_id,h90,a90'),
  ]);

  const cmap = new Map(((clubs ?? []) as ClubRow[]).map((c) => [c.id, c]));
  const home = cmap.get(f.home_club_id);
  const away = cmap.get(f.away_club_id);
  const oa = home?.owner_id;
  const ob = away?.owner_id;
  if (!oa || !ob || oa === ob) return 0;

  const bals = (bal ?? []) as { id: string; name: string; net_inr: number }[];
  const nameOf = (id: string) => bals.find((b) => b.id === id)?.name ?? id;
  const nets: Record<string, number> = {};
  for (const b of bals) nets[b.id] = Number(b.net_inr);

  const fxRows = (fx ?? []) as FxRow[];
  const wldRows = (wld ?? []) as WldRow[];
  const resRows = (res ?? []) as { fixture_id: string; h90: number; a90: number }[];
  const ownerOf = (id: string) => cmap.get(id)?.owner_id;
  const forms = formTable(wldRows);

  const whenLabel = f.kickoff_utc
    ? `${today ? 'Today' : dateFmt.format(new Date(f.kickoff_utc))}, ${timeFmt.format(new Date(f.kickoff_utc))} IST`
    : 'date to be confirmed';

  // Each owner gets the same facts read from their own side of the table.
  const sides: { me: string; them: string; mine: ClubRow; theirs: ClubRow }[] = [
    { me: oa, them: ob, mine: home as ClubRow, theirs: away as ClubRow },
    { me: ob, them: oa, mine: away as ClubRow, theirs: home as ClubRow },
  ];

  let sent = 0;
  for (const s of sides) {
    const line = (sc: Scenario): ScoutLine => ({
      rank: sc.rank, net: sc.net,
      aheadOf: sc.aheadOf ? nameOf(sc.aheadOf) : null, gapAhead: sc.gapAhead,
      behind: sc.behind ? nameOf(sc.behind) : null, gapBehind: sc.gapBehind,
    });
    const i = impact(nets, s.me, s.them, 500);
    const form = forms.find((r) => r.player === s.them) ?? { form: '—', points: 0 };
    const tally = h2hTally(s.me, s.them, fxRows, ownerOf, wldRows);

    const prev = lastMeeting(s.me, s.them, fxRows, ownerOf, wldRows, resRows);
    // A reminder must not report the fixture it is reminding you about.
    const history = prev && prev.fixtureId !== f.id ? prev : null;
    const samePair = history
      ? [history.homeClubId, history.awayClubId].every((c) => c === f.home_club_id || c === f.away_club_id)
      : false;

    const text = buildScoutBrief({
      whenLabel,
      home: home?.name ?? f.home_club_id,
      away: away?.name ?? f.away_club_id,
      compId: f.competition_id,
      compName: ((comps ?? []) as { name: string }[])[0]?.name ?? null,
      yourClub: s.mine.name,
      theirClub: s.theirs.name,
      opponent: nameOf(s.them),
      oppForm: form.form,
      oppPoints: form.points,
      h2h: h2hText(nameOf(s.me), nameOf(s.them), tally),
      lastMeeting: history
        ? lastMeetingText(
            history,
            (id) => cmap.get(id)?.name ?? id,
            (id) => (id === s.me ? 'you' : nameOf(id)),
            history.at ? dateFmt.format(new Date(history.at)) : null,
            samePair,
          )
        : null,
      now: line(i.now),
      win: line(i.win),
      lose: line(i.lose),
    });

    if (await sendPlayer(db, s.me, 'scout_brief', text)) sent++;
  }
  return sent;
}
