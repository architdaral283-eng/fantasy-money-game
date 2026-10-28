import { describe, it, expect } from 'vitest';
import {
  esc, money, signed, compName, compShort, block, head, cols,
  buildFixtureNotice, buildFixtureList, buildLedgerList, buildTrophies, buildSettle, buildHelp, buildRules,
} from '@/lib/notify/format';
import { h2hTally, h2hText } from '@/lib/stats/h2h';

describe('primitives', () => {
  it('groups rupees the Indian way and uses a real minus', () => {
    expect(money(1000)).toBe('₹1,000');
    expect(money(24000)).toBe('₹24,000');
    expect(signed(-500)).toBe('−₹500');
    expect(signed(1500)).toBe('+₹1,500');
    expect(signed(0)).toBe('₹0');
    expect(signed(-500).includes('-')).toBe(false);
  });
  it('escapes HTML so a club name can never break parse_mode', () => {
    expect(esc('A & <b>B</b>')).toBe('A &amp; &lt;b&gt;B&lt;/b&gt;');
  });
  it('never leaks a competition slug', () => {
    expect(compName('laliga')).toBe('La Liga');
    expect(compShort('epl')).toBe('PL');
    expect(compName('ucl')).toBe('UEFA Champions League');
  });
  it('block drops empty sections, head shouts', () => {
    expect(block('a', '', null, 'b')).toBe('a\n\nb');
    expect(head('Today', '01:30 IST')).toBe('TODAY · 01:30 IST');
  });
  it('cols aligns on the widest left cell', () => {
    expect(cols([['a', '1'], ['bbb', '2']], 1)).toBe('a   1\nbbb 2');
  });
});

describe('fixture notice', () => {
  const base = {
    home: 'Barcelona', away: 'Real Madrid', compId: 'laliga',
    ownerA: 'Anmol', ownerB: 'Vedant', timeIST: '01:30', dateIST: 'Sun 26 Oct',
    h2h: 'Anmol leads 3–1', netA: 1500, netB: -500,
  };
  it('reads as a block, not a sentence', () => {
    const t = buildFixtureNotice({ ...base, kind: 'tomorrow' });
    expect(t.startsWith('TOMORROW · 01:30 IST')).toBe(true);
    expect(t).toContain('Barcelona v Real Madrid');
    expect(t).toContain('La Liga · Sun 26 Oct');
    expect(t).toContain('Anmol v Vedant');
    expect(t).toContain('₹500 on it. ₹1,000 if it is won by four.');
    expect(t).toContain('Head to head: Anmol leads 3–1');
    expect(t).toContain('Table: Anmol +₹1,500 · Vedant −₹500');
    // the old one-liner's tells, all gone
    expect(t).not.toContain('(laliga)');
    expect(t).not.toContain('₹1000');
  });
  it('says nothing moves when one player owns both clubs', () => {
    const t = buildFixtureNotice({ ...base, kind: 'tomorrow', ownerB: 'Anmol', sameOwner: true });
    expect(t).toContain('Anmol owns both. Nothing moves.');
    expect(t).not.toContain('₹500 on it');
  });
  it('counts down on the 30-minute warning and drops the date', () => {
    const t = buildFixtureNotice({ ...base, kind: 'prematch', mins: 28 });
    expect(t.startsWith('KICKOFF · 28 minutes')).toBe(true);
    expect(t).not.toContain('Sun 26 Oct');
  });
  it('says so when a drawn tie has no date yet', () => {
    const t = buildFixtureNotice({ ...base, kind: 'drawn', timeIST: null, dateIST: null, round: 'Quarter-final' });
    expect(t.startsWith('CUP TIE DRAWN')).toBe(true);
    expect(t).toContain('La Liga · Quarter-final');
    expect(t).toContain('/next');
  });
});

describe('lists', () => {
  it('groups fixtures by day and totals the stakes', () => {
    const t = buildFixtureList([
      { home: 'Barcelona', away: 'Real Madrid', compId: 'laliga', ownerA: 'Anmol', ownerB: 'Vedant', timeIST: '01:30', dateIST: 'Sun 26 Oct' },
      { home: 'Arsenal', away: 'Inter', compId: 'ucl', ownerA: 'Archit', ownerB: 'Harshal', timeIST: '23:15', dateIST: 'Sun 26 Oct' },
      { home: 'Chelsea', away: 'Bayern', compId: 'facup', ownerA: 'Harshal', ownerB: 'Vedant', timeIST: null, dateIST: null },
    ]);
    expect(t).toContain('NEXT UP · 3 counted');
    expect(t).toContain('Sun 26 Oct');
    expect(t).toContain('Date TBC');
    expect(t).toContain('Anmol v Vedant · La Liga');
    expect(t).toContain('₹1,500 in play. ₹3,000 if they all go big.');
    expect((t.match(/Sun 26 Oct/g) ?? []).length).toBe(1);
  });
  it('an empty calendar still says something', () => {
    expect(buildFixtureList([])).toContain('NEXT UP');
  });
  it('ledger prints names, never ids, and totals', () => {
    const t = buildLedgerList([
      { from: 'Vedant', to: 'Anmol', amount: 500, description: 'Barcelona 2–1 Real Madrid' },
      { from: 'Harshal', to: 'Archit', amount: 1000, description: 'Arsenal 3–0 Inter' },
    ], 'Ledger', 'last 2');
    expect(t).toContain('LEDGER · last 2');
    expect(t).toContain('Vedant → Anmol');
    expect(t).toContain('₹1,500 changed hands.');
  });
  it('trophies and settle', () => {
    expect(buildTrophies([{ name: 'UEFA Champions League', status: 'Live', eachOtherPays: 2000 }]))
      .toContain('TROPHIES · ₹24,000 pool');
    expect(buildSettle([{ from: 'Anmol', to: 'Harshal', amount: 2000 }])).toContain('SETTLE UP · 1 payment');
    expect(buildSettle([])).toContain('square');
  });
  it('help hides commissioner commands from everyone else', () => {
    expect(buildHelp(false)).not.toContain('/pending');
    expect(buildHelp(true)).toContain('/pending');
    expect(buildRules()).toContain('₹1,000 from the loser');
  });
});

describe('head to head', () => {
  const owners: Record<string, string> = { barcelona: 'anmol', 'real-madrid': 'vedant', arsenal: 'archit' };
  const fx = [
    { id: 'f1', home_club_id: 'barcelona', away_club_id: 'real-madrid', status: 'RECORDED' },
    { id: 'f2', home_club_id: 'real-madrid', away_club_id: 'barcelona', status: 'RECORDED' },
    { id: 'f3', home_club_id: 'barcelona', away_club_id: 'arsenal', status: 'RECORDED' },
    { id: 'f4', home_club_id: 'barcelona', away_club_id: 'real-madrid', status: 'SCHEDULED' },
  ];
  const wld = [
    { player_id: 'anmol', fixture_id: 'f1', outcome: 'W' }, { player_id: 'vedant', fixture_id: 'f1', outcome: 'L' },
    { player_id: 'anmol', fixture_id: 'f2', outcome: 'D' }, { player_id: 'vedant', fixture_id: 'f2', outcome: 'D' },
    { player_id: 'anmol', fixture_id: 'f3', outcome: 'L' }, { player_id: 'archit', fixture_id: 'f3', outcome: 'W' },
  ];
  it('counts only the pair, only recorded', () => {
    const t = h2hTally('anmol', 'vedant', fx, (id) => owners[id], wld);
    expect(t).toEqual({ games: 2, aWins: 1, bWins: 0, draws: 1 });
  });
  it('always names the leader first', () => {
    expect(h2hText('Anmol', 'Vedant', { games: 4, aWins: 1, bWins: 3, draws: 0 })).toBe('Vedant leads 3–1');
    expect(h2hText('Anmol', 'Vedant', { games: 2, aWins: 1, bWins: 1, draws: 0 })).toBe('level at 1–1');
    expect(h2hText('Anmol', 'Vedant', { games: 0, aWins: 0, bWins: 0, draws: 0 })).toBe('nothing between them yet');
  });
});
