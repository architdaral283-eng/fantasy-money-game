// Roast context assembly — pure. DB rows in, computed truth out.
import type { RoastContext } from '@/lib/roast/select';

export interface CtxInput {
  homeClub: { id: string; name: string; pick: number; owner: string; ownerName: string; league: string };
  awayClub: { id: string; name: string; pick: number; owner: string; ownerName: string; league: string };
  homeGoals: number; awayGoals: number;
  competition: string;
  amount: number;
  derbyId: string | null;
  dossier: { marquee: string; manager: string };
  nets: Record<string, number>; // current (post-write) net balances by player id
  fixtureDelta: Record<string, number>; // this fixture's net effect by player id
  h2h: { aWins: number; bWins: number; leader: string | null }; // leader name or null if level
  owed: number;
  streakLosses: number; // loser's active losing streak (including this result)
  rankOfLoser: number;
  isShootout: boolean;
  isLeadChange: boolean;
}

export function buildContext(inp: CtxInput): RoastContext {
  const homeWon = inp.homeGoals > inp.awayGoals;
  const winner = homeWon ? inp.homeClub : inp.awayClub;
  const loser = homeWon ? inp.awayClub : inp.homeClub;
  const margin = Math.abs(inp.homeGoals - inp.awayGoals);
  const score = `${homeWon ? inp.homeGoals : inp.awayGoals}–${homeWon ? inp.awayGoals : inp.homeGoals}`;
  const before: Record<string, number> = {};
  for (const [p, net] of Object.entries(inp.nets)) before[p] = net - (inp.fixtureDelta[p] ?? 0);
  const upset =
    (inp.homeClub.league === inp.awayClub.league && loser.pick < winner.pick) ||
    (before[loser.owner] ?? 0) > (before[winner.owner] ?? 0);
  return {
    loser: loser.ownerName, winner: winner.ownerName,
    loserClub: loser.name, winnerClub: winner.name,
    loserClubId: loser.id, winnerClubId: winner.id,
    score, margin, amount: inp.amount, competition: inp.competition,
    loserPick: loser.pick, winnerPick: winner.pick,
    h2h: inp.h2h.leader ? `${inp.h2h.aWins}–${inp.h2h.bWins} to ${inp.h2h.leader}` : `${inp.h2h.aWins}–${inp.h2h.bWins} level`,
    loserNet: inp.nets[loser.owner] ?? 0, winnerNet: inp.nets[winner.owner] ?? 0,
    owed: inp.owed,
    streakLosses: inp.streakLosses,
    marquee: inp.dossier.marquee, manager: inp.dossier.manager,
    rank: inp.rankOfLoser,
    isUpset: upset,
    isThrashing: margin >= 4,
    derbyId: inp.derbyId,
    isShootout: inp.isShootout,
    isStreak: inp.streakLosses >= 3,
    isLeadChange: inp.isLeadChange,
  };
}
