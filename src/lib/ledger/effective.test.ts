import { describe, it, expect } from 'vitest';
import { effectiveTransfers, amountByFixture, describeFixture } from '@/lib/ledger/effective';

// The real Bayern v Dortmund history from production, ids and all.
const row = (id: number, from: string, to: string, description: string, day = 5) => ({
  id, fixture_id: 'fx_d8e05cb0b232', from_player_id: from, to_player_id: to, amount_inr: 500,
  created_at: `2026-09-${String(day).padStart(2, '0')}T20:00:00Z`, description, event_type: 'MATCH',
});
const bayernDortmund = [
  row(2, 'harshal', 'anmol', 'bayern 1-2 dortmund', 5),
  row(4, 'anmol', 'harshal', 'REVERSAL of entry #2', 7),
  row(5, 'anmol', 'harshal', 'CORRECTION: bayern 2-1 dortmund', 7),
  row(8, 'anmol', 'harshal', 'REVERSAL of entry #2', 8),
  row(9, 'anmol', 'harshal', 'CORRECTION: bayern 2-1 dortmund', 8),
  row(10, 'harshal', 'anmol', 'REVERSAL of duplicate entry #9', 9),
  row(11, 'harshal', 'anmol', 'REVERSAL of duplicate entry #8', 9),
];

describe('netting a corrected fixture', () => {
  it('reduces seven rows to the one transfer that stands', () => {
    const t = effectiveTransfers(bayernDortmund);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ from_player_id: 'anmol', to_player_id: 'harshal', amount_inr: 500 });
  });

  it('keeps the corrected wording, without the CORRECTION prefix', () => {
    expect(effectiveTransfers(bayernDortmund)[0].description).toBe('bayern 2-1 dortmund');
  });

  it('dates it from when the result was first recorded, not the last correction', () => {
    expect(effectiveTransfers(bayernDortmund)[0].created_at).toBe('2026-09-05T20:00:00Z');
  });

  it('does not depend on the rows arriving in order', () => {
    const shuffled = [bayernDortmund[6], bayernDortmund[2], bayernDortmund[0], bayernDortmund[4], bayernDortmund[1], bayernDortmund[5], bayernDortmund[3]];
    expect(effectiveTransfers(shuffled)[0]).toMatchObject({ to_player_id: 'harshal', amount_inr: 500, description: 'bayern 2-1 dortmund' });
  });

  it('drops a result that was fully struck off', () => {
    expect(effectiveTransfers([bayernDortmund[0], bayernDortmund[1]])).toEqual([]);
  });

  it('leaves an uncorrected result alone', () => {
    const t = effectiveTransfers([row(1, 'vedant', 'archit', 'arsenal 2-0 man-utd')]);
    expect(t).toEqual([expect.objectContaining({ from_player_id: 'vedant', to_player_id: 'archit', amount_inr: 500 })]);
  });

  it('passes trophy rows straight through', () => {
    const trophy = { fixture_id: null, from_player_id: 'vedant', to_player_id: 'archit', amount_inr: 1000, created_at: '2027-05-30T12:00:00Z', description: 'Premier League', event_type: 'TROPHY' };
    expect(effectiveTransfers([trophy, trophy])).toHaveLength(2);
  });

  it('maps fixtures to what actually changed hands', () => {
    const m = amountByFixture([...bayernDortmund, { ...row(20, 'archit', 'vedant', 'x'), fixture_id: 'fx_other', amount_inr: 1000 }]);
    expect(m.get('fx_d8e05cb0b232')).toBe(500);
    expect(m.get('fx_other')).toBe(1000);
  });
});

describe('describing a fixture for people', () => {
  const fixtures = [{ id: 'f1', home_club_id: 'bayern', away_club_id: 'dortmund' }];
  const name = (id: string) => ({ bayern: 'Bayern Munich', dortmund: 'Borussia Dortmund' }[id] ?? id);

  it('uses club names and the score', () => {
    expect(describeFixture('f1', fixtures, [{ fixture_id: 'f1', h90: 2, a90: 1 }], name)).toBe('Bayern Munich 2–1 Borussia Dortmund');
  });

  it('uses the score after extra time when there was some', () => {
    expect(describeFixture('f1', fixtures, [{ fixture_id: 'f1', h90: 1, a90: 1, h120: 2, a120: 1 }], name)).toBe('Bayern Munich 2–1 Borussia Dortmund');
  });

  it('falls back to the pairing when there is no result, and to null when there is no fixture', () => {
    expect(describeFixture('f1', fixtures, [], name)).toBe('Bayern Munich v Borussia Dortmund');
    expect(describeFixture('nope', fixtures, [], name)).toBeNull();
  });
});
