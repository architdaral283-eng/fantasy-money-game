// Team news an hour before kickoff, to the two with money on it.
//
// ESPN publishes lineups roughly an hour out and not before, so "nothing yet"
// is the normal answer. The caller must only mark a fixture as done when this
// returns a non-zero count, or a single early tick would silence it for good.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTeamNews } from '@/lib/notify/format';
import { sendPlayer } from '@/lib/notify/send';
import { espnScoreboard, espnDateOf, findMatch, ESPN_LEAGUE } from '@/lib/providers/espn';
import { espnLineups, inXI } from '@/lib/providers/espn-lineups';

export interface LineupFixture {
  id: string;
  home_club_id: string;
  away_club_id: string;
  competition_id: string;
  kickoff_utc: string;
}

export async function lineupDms(db: SupabaseClient, f: LineupFixture): Promise<number> {
  if (!ESPN_LEAGUE[f.competition_id]) return 0;

  const board = await espnScoreboard(f.competition_id, espnDateOf(f.kickoff_utc));
  const match = findMatch(board, f.home_club_id, f.away_club_id, f.kickoff_utc);
  if (!match?.espnId) return 0;

  const lineups = await espnLineups(f.competition_id, match.espnId);
  if (lineups.length < 2) return 0;

  const [{ data: clubs }, { data: dossiers }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('club_dossiers').select('club_id,marquee'),
  ]);
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const marqueeOf = (id: string) =>
    ((dossiers ?? []) as { club_id: string; marquee: string }[]).find((d) => d.club_id === id)?.marquee ?? null;

  const home = cmap.get(f.home_club_id);
  const away = cmap.get(f.away_club_id);
  if (!home || !away || home.owner_id === away.owner_id) return 0;

  const mins = Math.max(1, Math.round((Date.parse(f.kickoff_utc) - Date.now()) / 60000));
  let sent = 0;

  for (const [mine, theirs] of [[home, away], [away, home]] as const) {
    const lineup = lineups.find((l) => l.clubId === mine.id);
    if (!lineup) continue;
    const marquee = marqueeOf(mine.id);
    const text = buildTeamNews({
      club: mine.name,
      opponent: theirs.name,
      minsToKickoff: mins,
      formation: lineup.formation,
      xi: lineup.xi,
      bench: lineup.bench,
      marquee,
      marqueeStarts: marquee ? inXI(lineup.xi, marquee) : null,
    });
    if (await sendPlayer(db, mine.owner_id, 'team_news', text)) sent++;
  }
  return sent;
}
