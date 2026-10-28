import { describe, it, expect } from 'vitest';
import { scenario, impact } from '@/lib/stats/scout';
import { buildScoutBrief } from '@/lib/notify/format';

const nets = { archit: 2000, vedant: 1500, harshal: -1000, anmol: -2500 };

describe('where a result leaves you', () => {
  it('reads the table as it stands', () => {
    const s = scenario(nets, 'vedant', 'archit', 0);
    expect(s).toMatchObject({ rank: 2, of: 4, net: 1500, behind: 'archit', gapBehind: 500, aheadOf: 'harshal', gapAhead: 2500 });
  });

  it('moves the money both ways, not just yours', () => {
    const s = scenario(nets, 'vedant', 'archit', 500);
    expect(s.net).toBe(2000);
    expect(s.rank).toBe(1);        // 2000 vs archit's 1500
    expect(s.gapAhead).toBe(500);
  });

  it('puts the leader on top with a lead, not a deficit', () => {
    const s = scenario(nets, 'archit', 'vedant', 0);
    expect(s.rank).toBe(1);
    expect(s.behind).toBeNull();
    expect(s.aheadOf).toBe('vedant');
    expect(s.gapAhead).toBe(500);
  });

  it('puts the bottom player last with nobody below', () => {
    const s = scenario(nets, 'anmol', 'archit', 0);
    expect(s.rank).toBe(4);
    expect(s.aheadOf).toBeNull();
    expect(s.gapBehind).toBe(1500);
  });

  it('breaks a tie the same way every time', () => {
    const level = { archit: 500, vedant: 500, harshal: 0, anmol: 0 };
    expect(scenario(level, 'vedant', 'harshal', 0).rank).toBe(2);
    expect(scenario(level, 'archit', 'harshal', 0).rank).toBe(1);
  });

  it('treats an unseen player as level at zero rather than crashing', () => {
    const s = scenario({ archit: 500 }, 'newcomer', 'archit', -500);
    expect(s.net).toBe(-500);
    expect(s.rank).toBe(2);
  });

  it('gives all three scenarios off one call, doubled when asked', () => {
    const i = impact(nets, 'anmol', 'archit', 1000);
    expect(i.now.net).toBe(-2500);
    expect(i.win.net).toBe(-1500);
    expect(i.lose.net).toBe(-3500);
    expect(i.win.rank).toBe(4);
  });
});

describe('the scouting DM', () => {
  const brief = {
    whenLabel: 'Tomorrow, 01:30 IST',
    home: 'Barcelona', away: 'Real Madrid',
    compId: 'laliga', compName: 'La Liga',
    yourClub: 'Real Madrid', theirClub: 'Barcelona',
    opponent: 'Anmol',
    oppForm: 'WWLDW', oppPoints: 10,
    h2h: 'Anmol leads 3–1',
    lastMeeting: 'Rematch: Barcelona 1–2 Real Madrid, Sat 24 Oct. Anmol took ₹500 off you.',
    now: { rank: 2, net: 1500, aheadOf: 'Harshal', gapAhead: 2500, behind: 'Archit', gapBehind: 500 },
    win: { rank: 1, net: 2000, aheadOf: 'Archit', gapAhead: 500, behind: null, gapBehind: null },
    lose: { rank: 3, net: 1000, aheadOf: 'Harshal', gapAhead: 2000, behind: 'Archit', gapBehind: 1000 },
  };

  it('leads with the fixture and speaks to one person', () => {
    const t = buildScoutBrief(brief);
    expect(t.startsWith('SCOUTING · Tomorrow, 01:30 IST')).toBe(true);
    expect(t).toContain('Barcelona v Real Madrid');
    expect(t).toContain("Your Real Madrid against Anmol's Barcelona.");
  });

  it('carries form, record and the grudge', () => {
    const t = buildScoutBrief(brief);
    expect(t).toContain("Anmol's last five: WWLDW, 10 points");
    expect(t).toContain('Head to head: Anmol leads 3–1');
    expect(t).toContain('Rematch: Barcelona 1–2 Real Madrid');
  });

  it('spells out all three positions, with the lead when you go top', () => {
    const t = buildScoutBrief(brief);
    expect(t).toContain('You are 2nd, ₹500 behind Archit on +₹1,500.');
    expect(t).toContain('Win and you are 1st, ₹500 clear of Archit.');
    expect(t).toContain('Lose and you are 3rd, ₹1,000 behind Archit.');
  });

  it('says so when the opponent has not played', () => {
    const t = buildScoutBrief({ ...brief, oppForm: '—', oppPoints: 0, lastMeeting: null });
    expect(t).toContain('Anmol has not played yet.');
    expect(t).not.toContain('Rematch');
  });

  it('handles being level', () => {
    const t = buildScoutBrief({ ...brief, win: { rank: 1, net: 2000, aheadOf: 'Archit', gapAhead: 0, behind: null, gapBehind: null } });
    expect(t).toContain('Win and you are 1st, level with Archit.');
  });
});
