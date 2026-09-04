// One-line result parser + inbound read commands — §7.3.
// A player-submitted result becomes a pending_approval like a poller one.
// Never writes to the ledger directly; Archit approves everything.
import { clubByName } from '@/lib/domain/constants';

export interface ParsedResult {
  homeClubId: string;
  awayClubId: string;
  homeGoals: number;
  awayGoals: number;
  competitionCode: string;
}

const COMP_ALIASES: Record<string, string> = {
  'premier league': 'EPL', epl: 'EPL', 'ep l': 'EPL',
  'la liga': 'LA_LIGA', laliga: 'LA_LIGA',
  bundesliga: 'BUNDESLIGA',
  'serie a': 'SERIE_A', seriea: 'SERIE_A',
  'champions league': 'UCL', ucl: 'UCL',
  'fa cup': 'FA_CUP',
  'copa del rey': 'COPA_DEL_REY',
  'coppa italia': 'COPPA_ITALIA',
  'dfb-pokal': 'DFB_POKAL', 'dfb pokal': 'DFB_POKAL',
};

const CLUB_ALIASES: Record<string, string> = {
  'man city': 'man-city', 'manchester city': 'man-city',
  'man united': 'man-utd', 'manchester united': 'man-utd', 'man utd': 'man-utd',
  'aston villa': 'aston-villa', villa: 'aston-villa',
  'real madrid': 'real-madrid', madrid: 'real-madrid',
  barcelona: 'barcelona', barca: 'barcelona',
  'atletico madrid': 'atletico', atletico: 'atletico',
  'real betis': 'real-betis', betis: 'real-betis',
  'bayern munich': 'bayern', bayern: 'bayern',
  'bayer leverkusen': 'leverkusen', leverkusen: 'leverkusen',
  'borussia dortmund': 'dortmund', dortmund: 'dortmund',
  'rb leipzig': 'rb-leipzig', leipzig: 'rb-leipzig',
  inter: 'inter', internazionale: 'inter', 'inter milan': 'inter',
  napoli: 'napoli',
  'as roma': 'roma', roma: 'roma',
  juventus: 'juventus', juve: 'juventus',
  arsenal: 'arsenal',
};

export function parseOneLine(input: string): ParsedResult | { error: string } {
  // "Arsenal 2-0 Manchester City - Premier League"
  const m = input.trim().match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+?)\s*-\s*(.+)$/);
  if (!m) return { error: 'Could not parse. Format: "Arsenal 2-0 Manchester City - Premier League".' };
  const [, homeRaw, hg, ag, awayRaw, compRaw] = m;
  const homeId = CLUB_ALIASES[homeRaw.trim().toLowerCase()] ?? clubByName.get(homeRaw.trim().toLowerCase())?.id;
  const awayId = CLUB_ALIASES[awayRaw.trim().toLowerCase()] ?? clubByName.get(awayRaw.trim().toLowerCase())?.id;
  if (!homeId) return { error: `Unknown club "${homeRaw.trim()}".` };
  if (!awayId) return { error: `Unknown club "${awayRaw.trim()}".` };
  const comp = COMP_ALIASES[compRaw.trim().toLowerCase()];
  if (!comp) return { error: `Unknown competition "${compRaw.trim()}".` };
  return {
    homeClubId: homeId, awayClubId: awayId,
    homeGoals: Number(hg), awayGoals: Number(ag), competitionCode: comp,
  };
}

export const READ_COMMANDS = [
  'standings', 'fixtures', 'remaining', 'ownership', 'h2h',
  'trophies', 'ledger', 'awards', 'settle', 'dashboard', 'weekly',
] as const;
export type ReadCommand = (typeof READ_COMMANDS)[number];

export function parseCommand(input: string): ReadCommand | null {
  const t = input.trim().toLowerCase();
  return (READ_COMMANDS as readonly string[]).includes(t) ? (t as ReadCommand) : null;
}
