// Assembling the club form side-table. Four ESPN calls, one per league.

import type { SupabaseClient } from '@supabase/supabase-js';
import { espnStandings, FORM_COMPS, type ClubStanding } from '@/lib/providers/espn-standings';
import { ownerForm, bestAndWorstClub } from '@/lib/stats/club-form';
import { buildClubForm, clubFormLine, type ClubFormRow } from '@/lib/notify/format';
import { PLAYERS } from '@/lib/stats/weekly';

async function gather(db: SupabaseClient): Promise<{
  rows: ClubFormRow[];
  best: { club: string; owner: string; diff: number } | null;
  worst: { club: string; owner: string; diff: number } | null;
}> {
  const [{ data: clubs }, { data: bal }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
  ]);
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const pname = (id: string) => ((bal ?? []) as { id: string; name: string }[]).find((p) => p.id === id)?.name ?? id;

  // All four in parallel; one league being down costs that league, not the table.
  const boards = await Promise.all(FORM_COMPS.map((c) => espnStandings(c).catch((): ClubStanding[] => [])));
  const standings = boards.flat();

  const rows: ClubFormRow[] = ownerForm(standings, (id) => cmap.get(id)?.owner_id, PLAYERS)
    .map((r) => ({ name: pname(r.player), points: r.points, gf: r.gf, ga: r.ga, diff: r.diff, clubs: r.clubs }));

  const { best, worst } = bestAndWorstClub(standings);
  const label = (s: ClubStanding | null) => s
    ? { club: cmap.get(s.clubId)?.name ?? s.clubId, owner: pname(cmap.get(s.clubId)?.owner_id ?? ''), diff: s.diff }
    : null;

  return { rows, best: label(best), worst: label(worst) };
}

/** The /clubform table. */
export async function clubFormTable(db: SupabaseClient): Promise<string> {
  const { rows, best, worst } = await gather(db);
  return buildClubForm(rows, best, worst);
}

/** One line of it for the Sunday roundup. */
export async function clubFormSummary(db: SupabaseClient): Promise<string | null> {
  const { rows } = await gather(db);
  return clubFormLine(rows);
}
