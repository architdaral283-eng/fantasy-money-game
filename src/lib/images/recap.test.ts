import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import { ImageResponse } from 'next/og';
import { recapTree, recapSize, standingsTree, standingsSize, rupees, type RecapData } from '@/lib/images/recap';

// The standings photo returned 0 bytes on every request for weeks. Satori
// rejects a bare number child the same way it rejects two children, throws
// nothing, and hands back an empty PNG. Nobody noticed because nothing ever
// looked at the size. These tests look at the size.
const render = async (el: ReactElement, size: { width: number; height: number }): Promise<number> =>
  (await new ImageResponse(el, size).arrayBuffer()).byteLength;

const data: RecapData = {
  title: 'The Month',
  label: 'October 2026',
  rows: [
    { id: 'archit', name: 'Archit', swing: 2500, season: 3000, form: 'WWDWW' },
    { id: 'harshal', name: 'Harshal', swing: 0, season: 500, form: 'WLDLW' },
    { id: 'vedant', name: 'Vedant', swing: -1000, season: -3500, form: 'LLLLW' },
    { id: 'anmol', name: 'Anmol', swing: -1500, season: 0, form: '—' },
  ],
  cards: [
    ['OWNER OF THE MONTH', 'Archit', '+₹2,500'],
    ['FLOP OF THE MONTH', 'Anmol', '−₹1,500'],
    ['CLUB OF THE MONTH', 'Real Madrid · Vedant', '+₹1,500'],
    ['WORST CLUB', 'Barcelona · Anmol', '−₹2,000'],
  ],
  moved: 7500,
  results: 11,
  biggest: 'Biggest single result: Barcelona 1–2 Real Madrid — ₹1,000, Anmol to Vedant',
};

describe('the recap image', () => {
  it('renders real PNG bytes, not an empty response', async () => {
    expect(await render(recapTree(data), recapSize(data.rows.length))).toBeGreaterThan(5000);
  }, 90000);

  it('renders a month where nothing happened', async () => {
    const empty: RecapData = {
      ...data,
      rows: data.rows.map((r) => ({ ...r, swing: 0, form: '—' })),
      cards: data.cards.map(([l]) => [l, '—', ''] as [string, string, string]),
      moved: 0, results: 0, biggest: null,
    };
    expect(await render(recapTree(empty), recapSize(empty.rows.length))).toBeGreaterThan(5000);
  }, 90000);

  it('renders with no rows at all rather than throwing', async () => {
    const none: RecapData = { ...data, rows: [], cards: [], moved: 0, results: 0, biggest: null };
    expect(await render(recapTree(none), recapSize(0))).toBeGreaterThan(1000);
  }, 90000);
});

describe('the standings image', () => {
  const rows = [
    { id: 'archit', name: 'Archit', net: 3000, w: 8, l: 2, d: 1 },
    { id: 'vedant', name: 'Vedant', net: -3500, w: 2, l: 8, d: 1 },
  ];

  it('renders real PNG bytes', async () => {
    expect(await render(standingsTree(rows, -500), standingsSize(rows.length))).toBeGreaterThan(5000);
  }, 90000);

  it('renders the zero-sum pass case', async () => {
    expect(await render(standingsTree(rows, 0), standingsSize(rows.length))).toBeGreaterThan(5000);
  }, 90000);

  it('renders an empty table', async () => {
    expect(await render(standingsTree([], 0), standingsSize(0))).toBeGreaterThan(1000);
  }, 90000);
});

describe('rupee formatting', () => {
  it('uses a real minus sign and Indian grouping', () => {
    expect(rupees(-125000)).toBe('−₹1,25,000');
    expect(rupees(0)).toBe('+₹0');
    expect(rupees(500)).toBe('+₹500');
  });
});
