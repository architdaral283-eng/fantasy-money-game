'use client';
// Live league data — reads Postgres via the anon key; falls back to zeros
// when the DB is unreachable so pages never crash.
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/db/supabase';

export interface LiveLedgerRow {
  id: number; occurred_on: string; event_type: string; description: string;
  from_player_id: string; to_player_id: string; amount_inr: number;
  fixture_id: string | null; created_at: string;
}
export interface LiveWldRow { player_id: string; fixture_id: string | null; outcome: 'W' | 'L' | 'D' }
export interface LiveFixtureRow {
  id: string; competition_id: string; round: string;
  home_club_id: string; away_club_id: string; status: string; is_same_owner: boolean;
}
export interface LiveResultRow {
  fixture_id: string; h90: number; a90: number; terminal_status: string; ingested_at: string;
}

export interface LiveData {
  ledger: LiveLedgerRow[];
  wld: LiveWldRow[];
  fixtures: LiveFixtureRow[];
  results: LiveResultRow[];
}

export function balancesOf(ledger: LiveLedgerRow[]): Record<string, number> {
  const net: Record<string, number> = { archit: 0, vedant: 0, harshal: 0, anmol: 0 };
  for (const r of ledger) {
    net[r.to_player_id] = (net[r.to_player_id] ?? 0) + r.amount_inr;
    net[r.from_player_id] = (net[r.from_player_id] ?? 0) - r.amount_inr;
  }
  return net;
}

export function useLiveData(): LiveData & { loading: boolean } {
  const [data, setData] = useState<LiveData>({ ledger: [], wld: [], fixtures: [], results: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        const [l, w, f, r] = await Promise.all([
          sb.from('ledger_entries').select('*').order('id'),
          sb.from('wld_records').select('player_id,fixture_id,outcome'),
          sb.from('fixtures').select('id,competition_id,round,home_club_id,away_club_id,status,is_same_owner'),
          sb.from('results').select('fixture_id,h90,a90,terminal_status,ingested_at').order('ingested_at'),
        ]);
        if (l.error || w.error || f.error || r.error) throw new Error('db read failed');
        setData({ ledger: l.data ?? [], wld: w.data ?? [], fixtures: f.data ?? [], results: r.data ?? [] });
      } catch { /* seed fallback: all zeros */ }
      setLoading(false);
    })();
  }, []);
  return { ...data, loading };
}
