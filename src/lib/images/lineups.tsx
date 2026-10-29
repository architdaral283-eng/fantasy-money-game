import type { ReactElement } from 'react';
import { INK, PAPER, MUTED } from '@/lib/images/recap';

/**
 * Both teams on a pitch, in their actual shape, posted to the group with the
 * pre-match warning.
 *
 * SATORI RULES (see recap.tsx): one child per div or an explicit display:flex,
 * interpolated text as a single template string, every number through
 * String(). A bare number child returns a 0-byte PNG with no error thrown.
 * Satori also does not grow the canvas, so anything past `lineupSize()` is
 * cropped off the bottom edge without complaint.
 */

const TURF = '#1C4532';
const CHALK = 'rgba(255,255,255,0.38)';
const SHIRT_HOME = '#F1F4EF';
const SHIRT_AWAY = '#F7D154';

export interface LineupSide {
  club: string;
  owner: string;
  formation: string | null;
  /** Starting eleven in ESPN's order: keeper first. */
  xi: string[];
  /** Set when this club's best player is missing from the eleven. */
  missing: string | null;
}

export interface LineupCard {
  competition: string;
  kickoffIST: string;
  /** 'Der Klassiker' when the tie has a name, else null. */
  derby: string | null;
  home: LineupSide;
  away: LineupSide;
  stake: string;
  h2h: string | null;
}

export function lineupSize(): { width: number; height: number } {
  return { width: 820, height: 1060 };
}

/**
 * "4-2-3-1" -> [4,2,3,1], the outfield rows from defence forward.
 *
 * Falls back to a shape that fits whatever the feed actually sent: a lineup
 * with a sending-off already in it, or a formation string ESPN did not
 * publish, must still draw something rather than crash or drop players.
 */
export function outfieldRows(formation: string | null, outfield: number): number[] {
  const parsed = (formation ?? '').split('-').map((n) => Number(n.trim())).filter((n) => Number.isInteger(n) && n > 0);
  if (parsed.length >= 2 && parsed.reduce((a, b) => a + b, 0) === outfield) return parsed;
  // Spread evenly over three bands, back-heavy, so eleven still looks like a team.
  const back = Math.ceil(outfield / 3);
  const fwd = Math.max(1, Math.floor(outfield / 4));
  return [back, outfield - back - fwd, fwd].filter((n) => n > 0);
}

function playerDot(name: string, shirt: string, key: string): ReactElement {
  // Caps and heavy weight: these are read on a phone, at a glance, against
  // turf. Sentence case at this size disappears into the background.
  return (
    <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 168 }}>
      <div style={{ display: 'flex', width: 22, height: 22, borderRadius: 11, background: shirt, border: '2px solid rgba(0,0,0,0.3)' }} />
      <div style={{ display: 'flex', fontSize: 17, color: '#FFFFFF', marginTop: 5, fontWeight: 700, letterSpacing: 0.6 }}>
        {name.toUpperCase()}
      </div>
    </div>
  );
}

/** One team's rows, already ordered from their own goal outward. */
function teamRows(s: LineupSide, shirt: string, idPrefix: string): ReactElement[] {
  const xi = s.xi.slice(0, 11);
  const keeper = xi[0] ?? '';
  const outfield = xi.slice(1);
  const rows = outfieldRows(s.formation, outfield.length);

  const out: ReactElement[] = [
    <div key={`${idPrefix}-gk`} style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '7px 0' }}>
      {playerDot(keeper, shirt, `${idPrefix}-gk-p`)}
    </div>,
  ];
  let i = 0;
  rows.forEach((n, r) => {
    const band = outfield.slice(i, i + n);
    i += n;
    out.push(
      <div key={`${idPrefix}-r${String(r)}`} style={{ display: 'flex', justifyContent: 'space-around', width: '100%', padding: '7px 0' }}>
        {band.map((p, c) => playerDot(p, shirt, `${idPrefix}-r${String(r)}-c${String(c)}`))}
      </div>,
    );
  });
  return out;
}

function header(s: LineupSide, flip: boolean): ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', padding: flip ? '9px 2px 0' : '0 2px 9px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.3 }}>{s.club}</div>
        <div style={{ display: 'flex', fontSize: 16, color: MUTED, marginTop: 1 }}>{s.owner}</div>
      </div>
      <div style={{ display: 'flex', fontSize: 18, color: MUTED, letterSpacing: 1.5 }}>{s.formation ?? ''}</div>
    </div>
  );
}

export function lineupTree(c: LineupCard): ReactElement {
  // Away attack downward from the top, home attack upward from the bottom —
  // the way every lineup graphic has drawn it, so nobody has to work it out.
  const awayDown = teamRows(c.away, SHIRT_AWAY, 'a');
  const homeUp = teamRows(c.home, SHIRT_HOME, 'h').reverse();
  const missing = [c.away.missing, c.home.missing].filter(Boolean) as string[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 820, height: 1060, padding: '22px 26px', background: PAPER, fontFamily: 'Archivo, sans-serif', color: INK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, letterSpacing: 2.5, color: MUTED, marginBottom: 12 }}>
        <div style={{ display: 'flex' }}>{(c.derby ?? c.competition).toUpperCase()}</div>
        <div style={{ display: 'flex' }}>{`KICKOFF ${c.kickoffIST} IST`}</div>
      </div>

      {header(c.away, false)}

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: 766, background: TURF, border: `3px solid ${CHALK}`, position: 'relative' }}>
        {/* Markings first so the players paint over them. Absolutely
            positioned, so they take no part in the row layout below. */}
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 222, width: 320, height: 84, border: `2px solid ${CHALK}`, borderTop: '0px solid transparent' }} />
        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 312, width: 140, height: 34, border: `2px solid ${CHALK}`, borderTop: '0px solid transparent' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 222, width: 320, height: 84, border: `2px solid ${CHALK}`, borderBottom: '0px solid transparent' }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 312, width: 140, height: 34, border: `2px solid ${CHALK}`, borderBottom: '0px solid transparent' }} />
        <div style={{ display: 'flex', position: 'absolute', top: 341, left: 341, width: 82, height: 82, borderRadius: 41, border: `2px solid ${CHALK}` }} />

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: '100%', height: 380 }}>
          {awayDown}
        </div>
        <div style={{ display: 'flex', width: '100%', height: 2, background: CHALK }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: '100%', height: 380 }}>
          {homeUp}
        </div>
      </div>

      {header(c.home, true)}

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', paddingTop: 12 }}>
        {missing.length ? (
          <div style={{ display: 'flex', fontSize: 16, color: '#C8102E', fontWeight: 700, marginBottom: 7, letterSpacing: 0.3 }}>
            {`${missing.join(' and ')} not in the XI`}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17 }}>
          <div style={{ display: 'flex', background: INK, color: PAPER, padding: '7px 13px', fontWeight: 600 }}>{c.stake}</div>
          <div style={{ display: 'flex', color: MUTED, paddingTop: 7 }}>{c.h2h ?? ''}</div>
        </div>
      </div>
    </div>
  );
}
