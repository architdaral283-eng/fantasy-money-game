import { describe, it, expect } from 'vitest';
import { buildPinText, buildBriefText } from '@/lib/notify/panel';

describe('pinned panel text', () => {
  it('renders table, zero-sum ring line, next fixture', () => {
    const t = buildPinText(
      [
        { name: 'Harshal', net: 2500, w: 7, l: 3, d: 1 },
        { name: 'Archit', net: 500, w: 5, l: 4, d: 2 },
        { name: 'Vedant', net: -1000, w: 4, l: 6, d: 1 },
        { name: 'Anmol', net: -2000, w: 2, l: 8, d: 1 },
      ],
      14, 63,
      { home: 'Atletico', away: 'Bayern', ownerA: 'Archit', ownerB: 'Harshal', whenIST: 'tonight 00:30' },
      '21:14',
    );
    expect(t).toContain('after 14 of 63');
    expect(t).toContain('Harshal');
    expect(t).toContain('+₹2,500');
    expect(t).toContain('−₹2,000');
    expect(t).toContain('◎ balances sum to ₹0');
    expect(t).toContain('Atletico v Bayern');
    expect(t).toContain('<pre>');
  });

  it('shows the lock line when sums break', () => {
    const t = buildPinText([{ name: 'Archit', net: 100, w: 1, l: 0, d: 0 }], 1, 63, null, '21:14');
    expect(t).toContain('Ledger locked');
  });
});

describe('matchday brief', () => {
  it('lists fixtures with stakes and totals', () => {
    const t = buildBriefText([
      { home: 'Atletico', away: 'Bayern', comp: 'UCL', ownerA: 'Archit', ownerB: 'Harshal', whenIST: '00:30' },
      { home: 'Inter', away: 'Napoli', comp: 'Serie A', ownerA: 'Anmol', ownerB: 'Vedant', whenIST: '22:00' },
    ]);
    expect(t).toContain('2 counted fixtures');
    expect(t).toContain('₹500. ₹1000 if 4+');
    expect(t).toContain('₹1,000 in play. ₹2,000 if all go big.');
  });

  it('empty day renders nothing', () => {
    expect(buildBriefText([])).toBe('');
  });
});
