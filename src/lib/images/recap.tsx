import type { ReactElement } from 'react';

/**
 * The picture half of the period recap, separated from the route so it can be
 * rendered in a test.
 *
 * SATORI RULES, learned expensively on the standings image:
 *   - every <div> has exactly ONE child, or an explicit `display: flex`
 *   - interpolated text is a SINGLE template string
 *   - a bare number child (`{i + 1}`) fails the same way as two children, and
 *     fails SILENTLY: the response is a 0-byte PNG with no exception thrown.
 *     The standings photo was broken that way for weeks. Everything numeric
 *     here goes through String().
 */

export const INK = '#10281B';
export const PAPER = '#F1F4EF';
export const MUTED = '#6B7A6E';
export const RED = '#C8102E';
export const RULE = '#DCE2D8';

export function rupees(n: number): string {
  return `${n >= 0 ? '+' : '−'}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

export interface RecapRow { id: string; name: string; swing: number; season: number; form: string }
export interface RecapData {
  title: string;
  label: string;
  rows: RecapRow[];
  /** label, who, amount — amount may be empty. */
  cards: [string, string, string][];
  moved: number;
  results: number;
  biggest: string | null;
}

export function recapSize(rowCount: number): { width: number; height: number } {
  return { width: 900, height: 300 + rowCount * 56 + 300 };
}

export function recapTree(d: RecapData): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 900, padding: 48, background: PAPER, fontFamily: 'Archivo, sans-serif', color: INK }}>
      <div style={{ fontSize: 18, letterSpacing: 3, color: MUTED }}>FANTASY FOOTBALL MONEY GAME 2026/27</div>
      <div style={{ fontSize: 52, fontWeight: 800, margin: '6px 0 4px', letterSpacing: -1 }}>{d.title}</div>
      <div style={{ fontSize: 26, color: MUTED, marginBottom: 26 }}>{d.label}</div>

      {d.rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', fontSize: 28, padding: '12px 0', borderBottom: `2px solid ${RULE}` }}>
          <div style={{ width: 48, color: MUTED }}>{String(i + 1)}</div>
          <div style={{ width: 230, fontWeight: 600 }}>{r.name}</div>
          <div style={{ width: 190, color: r.swing >= 0 ? INK : RED, fontWeight: 700 }}>{rupees(r.swing)}</div>
          <div style={{ width: 180, color: MUTED, letterSpacing: 2 }}>{r.form}</div>
          <div style={{ color: MUTED, fontSize: 22 }}>{`season ${rupees(r.season)}`}</div>
        </div>
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28 }}>
        {d.cards.map(([label, who, amount]) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', width: 390, padding: '16px 20px', margin: '0 12px 12px 0', background: '#FFFFFF', border: `2px solid ${RULE}` }}>
            <div style={{ fontSize: 15, letterSpacing: 2, color: MUTED }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{who}</div>
            <div style={{ fontSize: 22, color: amount.startsWith('−') ? RED : MUTED, marginTop: 2 }}>{amount || ' '}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', marginTop: 12, fontSize: 24, background: INK, color: PAPER, padding: '12px 20px', alignSelf: 'flex-start' }}>
        {`₹${Math.round(d.moved).toLocaleString('en-IN')} moved across ${String(d.results)} ${d.results === 1 ? 'result' : 'results'}`}
      </div>

      {d.biggest ? (
        <div style={{ display: 'flex', marginTop: 14, fontSize: 21, color: MUTED }}>{d.biggest}</div>
      ) : null}
    </div>
  );
}

export interface StandingsRow { id: string; name: string; net: number; w: number; l: number; d: number }

export function standingsSize(rowCount: number): { width: number; height: number } {
  return { width: 900, height: 220 + rowCount * 70 + 180 };
}

export function standingsTree(rows: StandingsRow[], total: number): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 900, padding: 48, background: PAPER, fontFamily: 'Archivo, sans-serif', color: INK }}>
      <div style={{ fontSize: 20, letterSpacing: 3, color: MUTED }}>FANTASY FOOTBALL MONEY GAME 2026/27</div>
      <div style={{ fontSize: 54, fontWeight: 800, margin: '8px 0 24px', letterSpacing: -1 }}>Standings</div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', fontSize: 32, padding: '14px 0', borderBottom: `2px solid ${RULE}`, background: i % 2 ? PAPER : '#FFFFFF' }}>
          <div style={{ width: 60 }}>{String(i + 1)}</div>
          <div style={{ width: 300 }}>{r.name}</div>
          <div style={{ width: 220, color: r.net >= 0 ? INK : RED, fontWeight: 600 }}>{rupees(r.net)}</div>
          <div style={{ color: MUTED }}>{`${r.w}W ${r.l}L ${r.d}D`}</div>
        </div>
      ))}
      <div style={{ display: 'flex', marginTop: 28, fontSize: 24, background: INK, color: PAPER, padding: '12px 20px', alignSelf: 'flex-start' }}>
        {`Zero-sum check: ₹${String(total)} ${total === 0 ? 'passed' : 'FAILED. Ledger locked.'}`}
      </div>
    </div>
  );
}
