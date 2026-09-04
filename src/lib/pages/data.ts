// Page data — seed-driven until Supabase is wired; every page renders from here.
// All displayed times must be IST (Asia/Kolkata) with no exceptions (§9).
import { PLAYERS, CLUBS, COMPETITIONS, TROPHY_POOL_TOTAL } from '@/lib/domain/constants';
import { generateLeagueFixtures, uclFixtures, bootCheck } from '@/lib/seed/fixtures';

export const IST = 'Asia/Kolkata';

export function formatIST(iso: string | null): string {
  if (!iso) return 'TBC';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function inr(n: number): string {
  const sign = n < 0 ? '−' : n > 0 ? '+' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

export const pageData = {
  players: PLAYERS,
  clubs: CLUBS,
  competitions: COMPETITIONS.filter((c) => c.inScope),
  trophyPool: TROPHY_POOL_TOTAL,
  leagueFixtures: generateLeagueFixtures(),
  uclFixtures: uclFixtures(),
  boot: bootCheck(),
};

export const RIVALRIES: [string, string][] = [
  ['archit', 'vedant'], ['archit', 'harshal'], ['archit', 'anmol'],
  ['vedant', 'harshal'], ['vedant', 'anmol'], ['harshal', 'anmol'],
];

export function playerName(id: string): string {
  return PLAYERS.find((p) => p.id === id)?.name ?? id;
}

export function clubName(id: string): string {
  return CLUBS.find((c) => c.id === id)?.name ?? id;
}
