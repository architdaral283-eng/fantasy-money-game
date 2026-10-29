import { ImageResponse } from 'next/og';
import { supabaseService } from '@/lib/db/supabase';
import { lineupTree, lineupSize, type LineupCard } from '@/lib/images/lineups';
import { optimisePng } from '@/lib/images/optimise';
import { espnScoreboard, espnDateOf, findMatch, ESPN_LEAGUE } from '@/lib/providers/espn';
import { espnLineups, inXI } from '@/lib/providers/espn-lineups';
import { h2hTally, h2hText } from '@/lib/stats/h2h';
import { STAKE_LINE, compName } from '@/lib/notify/format';

// sharp is native, so this one cannot run on the edge like the other two
// image routes. A normal Node function is fine here — nothing renders this
// on a user's critical path.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const istClock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * The pre-match lineup card.
 *
 *   /api/og/lineup?fixture=fx_abc123
 *
 * 404 means ESPN has not published team sheets yet, which is the normal
 * answer until roughly an hour before kickoff. The caller is expected to try
 * again rather than treat it as broken.
 */
export async function GET(req: Request) {
  const fixtureId = new URL(req.url).searchParams.get('fixture');
  if (!fixtureId) return new Response('fixture required', { status: 400 });

  const db = supabaseService();
  const { data: fx } = await db.from('fixtures')
    .select('id,home_club_id,away_club_id,competition_id,kickoff_utc')
    .eq('id', fixtureId).maybeSingle();
  const f = fx as { home_club_id: string; away_club_id: string; competition_id: string; kickoff_utc: string | null } | null;
  if (!f?.kickoff_utc || !ESPN_LEAGUE[f.competition_id]) return new Response('not eligible', { status: 404 });

  const board = await espnScoreboard(f.competition_id, espnDateOf(f.kickoff_utc));
  const match = findMatch(board, f.home_club_id, f.away_club_id, f.kickoff_utc);
  if (!match?.espnId) return new Response('no espn fixture', { status: 404 });

  const lineups = await espnLineups(f.competition_id, match.espnId);
  if (lineups.length < 2) return new Response('lineups not published', { status: 404 });

  const [{ data: clubs }, { data: bal }, { data: doss }, { data: derbies }, { data: comps }, { data: played }, { data: wld }] =
    await Promise.all([
      db.from('clubs').select('id,name,owner_id'),
      db.from('player_balances').select('id,name'),
      db.from('club_dossiers').select('club_id,marquee'),
      db.from('derbies').select('id,name,club_a_id,club_b_id'),
      db.from('competitions').select('id,name').eq('id', f.competition_id),
      db.from('fixtures').select('id,home_club_id,away_club_id,status').eq('status', 'RECORDED'),
      db.from('wld_records').select('player_id,fixture_id,outcome'),
    ]);

  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const pname = (id: string) => ((bal ?? []) as { id: string; name: string }[]).find((p) => p.id === id)?.name ?? id;
  const marquee = (id: string) => ((doss ?? []) as { club_id: string; marquee: string }[]).find((d) => d.club_id === id)?.marquee ?? null;

  const home = cmap.get(f.home_club_id);
  const away = cmap.get(f.away_club_id);
  if (!home || !away) return new Response('unowned club', { status: 404 });

  const side = (clubId: string) => {
    const club = cmap.get(clubId)!;
    const l = lineups.find((x) => x.clubId === clubId);
    const star = marquee(clubId);
    return {
      club: club.name,
      owner: pname(club.owner_id),
      formation: l?.formation ?? null,
      xi: l?.xi ?? [],
      missing: star && l && !inXI(l.xi, star) ? star : null,
    };
  };
  if (!lineups.some((l) => l.clubId === f.home_club_id) || !lineups.some((l) => l.clubId === f.away_club_id)) {
    return new Response('one side missing', { status: 404 });
  }

  const derby = ((derbies ?? []) as { name: string; club_a_id: string; club_b_id: string }[])
    .find((d) => [d.club_a_id, d.club_b_id].every((c) => c === f.home_club_id || c === f.away_club_id));

  const sameOwner = home.owner_id === away.owner_id;
  const tally = h2hTally(
    home.owner_id, away.owner_id,
    (played ?? []) as { id: string; home_club_id: string; away_club_id: string; status: string }[],
    (id) => cmap.get(id)?.owner_id,
    (wld ?? []) as { player_id: string; fixture_id: string | null; outcome: string }[],
  );

  const card: LineupCard = {
    competition: compName(f.competition_id, ((comps ?? []) as { name: string }[])[0]?.name ?? null),
    kickoffIST: istClock.format(new Date(f.kickoff_utc)),
    derby: derby?.name ?? null,
    home: side(f.home_club_id),
    away: side(f.away_club_id),
    stake: sameOwner ? `${pname(home.owner_id)} owns both. Nothing moves.` : STAKE_LINE,
    h2h: sameOwner ? null : h2hText(pname(home.owner_id), pname(away.owner_id), tally),
  };

  const raw = await new ImageResponse(lineupTree(card), lineupSize()).arrayBuffer();
  // A Satori failure is a 0-byte PNG and no exception — the thing that broke
  // the standings photo for weeks. Check before anyone tries to send it.
  if (raw.byteLength < 1000) return new Response('render failed', { status: 500 });
  const png = await optimisePng(Buffer.from(raw));

  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
