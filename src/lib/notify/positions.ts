// The monthly positions message. Five ESPN calls, one per board.
//
// This rides with the monthly awards but is sent SEPARATELY, on purpose:
// the awards go out as a photo caption and Telegram caps a caption at 1024
// characters. Sixteen league rows plus the Champions League league phase do
// not fit beside them, and an oversized caption fails the whole send.

import type { SupabaseClient } from '@supabase/supabase-js';
import { espnStandings, type ClubStanding } from '@/lib/providers/espn-standings';
import { POSITION_COMPS, sectionFor } from '@/lib/stats/positions';
import { buildPositions, type PositionBlock } from '@/lib/notify/format';

export async function positionsMessage(db: SupabaseClient, label: string): Promise<string | null> {
  const [{ data: clubs }, { data: bal }] = await Promise.all([
    db.from('clubs').select('id,name,owner_id'),
    db.from('player_balances').select('id,name'),
  ]);
  const cmap = new Map(((clubs ?? []) as { id: string; name: string; owner_id: string }[]).map((c) => [c.id, c]));
  const names = (bal ?? []) as { id: string; name: string }[];
  const pname = (id: string) => names.find((p) => p.id === id)?.name ?? id;

  // All five in parallel; one board being down costs that board, not the message.
  const boards = await Promise.all(
    POSITION_COMPS.map(([id]) => espnStandings(id).catch((): ClubStanding[] => [])),
  );

  const blocks: PositionBlock[] = [];
  POSITION_COMPS.forEach(([id, lbl], i) => {
    const sec = sectionFor(id, lbl, boards.at(i) ?? []);
    if (!sec) return;
    blocks.push({
      label: lbl,
      lines: sec.rows.map((r) => ({
        rank: r.rank,
        club: cmap.get(r.clubId)?.name ?? r.clubId,
        owner: pname(cmap.get(r.clubId)?.owner_id ?? ''),
        points: r.points,
      })),
    });
  });

  return buildPositions(blocks, label);
}
