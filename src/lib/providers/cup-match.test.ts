import { describe, it, expect } from 'vitest';

/**
 * The duplicate-fixture bug, as a decision table.
 *
 * On 25 Oct the cup pass inserted a second row for the Community Shield and
 * the DFL-Supercup — both already played in August and entered by hand — then
 * proposed money on them. The rows it should have matched had a NULL kickoff
 * (Date.parse(null) is NaN, so every date comparison was false) and a round
 * label that did not equal ESPN's, and it inserted using ESPN's venue order,
 * so UNIQUE(competition, round, home, away) did not catch it either.
 *
 * This mirrors the matching in the poller's cup pass. Keep them in step.
 */
type FxRow = { id: string; round: string; status: string; kickoff_utc: string | null; home_club_id: string; away_club_id: string };

function decide(pairRows: FxRow[], espnRound: string, espnKickoff: string): { action: 'use' | 'adopt' | 'insert' | 'skip'; id?: string } {
  const nearDate = (f: FxRow) => {
    const k = Date.parse(f.kickoff_utc ?? '');
    return Number.isFinite(k) && Math.abs(k - Date.parse(espnKickoff)) < 36 * 3600 * 1000;
  };
  const fx = pairRows.find(nearDate)
    ?? pairRows.find((f) => f.round === espnRound)
    ?? pairRows.find((f) => f.status !== 'RECORDED' && !f.kickoff_utc);
  if (!fx) return pairRows.length ? { action: 'skip' } : { action: 'insert' };
  if ((!fx.kickoff_utc || fx.round !== espnRound) && fx.status !== 'RECORDED') return { action: 'adopt', id: fx.id };
  return { action: 'use', id: fx.id };
}

const row = (o: Partial<FxRow>): FxRow => ({ id: 'f1', round: 'Final', status: 'SCHEDULED', kickoff_utc: null, home_club_id: 'arsenal', away_club_id: 'man-city', ...o });

describe('cup fixture matching', () => {
  it('never re-creates a tie that is already recorded', () => {
    const recorded = row({ id: 'orig', status: 'RECORDED', kickoff_utc: null, round: 'Final' });
    expect(decide([recorded], 'Cup tie', '2026-08-16T14:00:00Z')).toEqual({ action: 'skip' });
  });

  it('matches a hand-entered row with no date and a different round label', () => {
    const manual = row({ id: 'manual', status: 'SCHEDULED', kickoff_utc: null, round: 'Showpiece' });
    expect(decide([manual], 'Final', '2026-08-16T14:00:00Z')).toEqual({ action: 'adopt', id: 'manual' });
  });

  it('matches on the date even when the round label differs', () => {
    const dated = row({ id: 'dated', round: 'Round 3', kickoff_utc: '2027-01-10T15:00:00Z' });
    expect(decide([dated], 'Third Round', '2027-01-10T19:45:00Z')).toEqual({ action: 'adopt', id: 'dated' });
  });

  it('keeps the two legs of a Copa del Rey semi apart by date', () => {
    const leg1 = row({ id: 'leg1', round: 'Semi-final', kickoff_utc: '2027-02-10T20:00:00Z', home_club_id: 'barcelona', away_club_id: 'real-madrid' });
    const leg2 = row({ id: 'leg2', round: 'Semi-final', kickoff_utc: '2027-03-03T20:00:00Z', home_club_id: 'real-madrid', away_club_id: 'barcelona' });
    expect(decide([leg1, leg2], 'Semi-final', '2027-03-03T20:00:00Z')).toEqual({ action: 'use', id: 'leg2' });
    expect(decide([leg1, leg2], 'Semi-final', '2027-02-10T20:00:00Z')).toEqual({ action: 'use', id: 'leg1' });
  });

  it('still inserts a genuinely new tie', () => {
    expect(decide([], 'Quarter-final', '2027-03-01T20:00:00Z')).toEqual({ action: 'insert' });
  });

  it('skips rather than guessing when the pair has history that does not fit', () => {
    const played = row({ id: 'r3', status: 'RECORDED', round: 'Round 3', kickoff_utc: '2027-01-10T15:00:00Z' });
    expect(decide([played], 'Quarter-final', '2027-03-01T20:00:00Z')).toEqual({ action: 'skip' });
  });
});
