'use client';
// The what-if machine. Reassign the sixteen clubs and the season re-runs.
//
// Nothing is re-scored: who won each match and what it paid are facts the
// draft would not have changed. Only the names attached to the clubs change.
// Penalty shootouts, aggregates and extra time therefore all come out right
// without a line of code about any of them.

import { useMemo, useState } from 'react';
import { CLUBS, PLAYERS } from '@/lib/domain/constants';
import { inr, playerName } from '@/lib/pages/data';
import { useLiveData } from '@/lib/pages/live';
import {
  playedFixtures, recompute, shuffleAssignment, actualAssignment, mulberry32, sumsToZero,
} from '@/lib/stats/what-if';

// Widened to string on purpose: the assignment map is keyed by club id and
// holds plain strings, which PlayerId[] would reject on every lookup.
const PLAYER_IDS: string[] = PLAYERS.map((p) => p.id);
const LEAGUES = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A'] as const;
const ACTUAL = actualAssignment(CLUBS.map((c) => ({ id: c.id, owner: c.owner })));

const SWATCH: Record<string, string> = {
  archit: '#c8553d', vedant: '#2d5f7c', harshal: '#5a7d4e', anmol: '#7a5c8e',
};

export default function WhatIf() {
  const { ledger, wld, fixtures, loading } = useLiveData();
  const [assign, setAssign] = useState<Record<string, string>>(ACTUAL);

  const played = useMemo(
    () => playedFixtures(fixtures, wld, ledger, (id) => ACTUAL[id]),
    [fixtures, wld, ledger],
  );
  const actualTable = useMemo(() => recompute(played, (id) => ACTUAL[id], PLAYER_IDS), [played]);
  const altTable = useMemo(() => recompute(played, (id) => assign[id], PLAYER_IDS), [played, assign]);

  const actualNet = Object.fromEntries(actualTable.map((r) => [r.player, r.net]));
  const untouched = PLAYER_IDS.every((p) => CLUBS.filter((c) => assign[c.id] === p).length === 4)
    && CLUBS.every((c) => assign[c.id] === ACTUAL[c.id]);

  const cycle = (clubId: string) => {
    const at = PLAYER_IDS.indexOf(assign[clubId]);
    setAssign({ ...assign, [clubId]: PLAYER_IDS[(at + 1) % PLAYER_IDS.length] });
  };

  const counts = Object.fromEntries(
    PLAYER_IDS.map((p) => [p, CLUBS.filter((c) => assign[c.id] === p).length]),
  );
  const lopsided = PLAYER_IDS.some((p) => counts[p] !== 4);

  return (
    <>
      <h2>What If</h2>
      <p>
        Every result this season, re-run over a different draft. Click a club to hand it
        to someone else. Nothing is re-scored — who won and what it paid are facts; only
        the names change.{loading ? ' Loading…' : ''}
      </p>

      <p style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAssign(ACTUAL)} disabled={untouched}>
          The draft that happened
        </button>
        <button type="button" onClick={() => setAssign(shuffleAssignment(CLUBS, PLAYER_IDS, mulberry32(Date.now() >>> 0)))}>
          Shuffle the draft
        </button>
      </p>

      {LEAGUES.map((lg) => (
        <div key={lg} style={{ marginBottom: '0.75rem' }}>
          <strong style={{ fontSize: '0.8rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{lg}</strong>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
            {CLUBS.filter((c) => c.league === lg).map((c) => {
              const who = assign[c.id];
              const moved = who !== ACTUAL[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => cycle(c.id)}
                  title={`${c.name} — ${playerName(who)}. Click to pass it on.`}
                  style={{
                    borderLeft: `4px solid ${SWATCH[who] ?? '#888'}`,
                    fontWeight: moved ? 700 : 400,
                    padding: '0.3rem 0.6rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {c.name}<br />
                  <span style={{ fontSize: '0.8em', opacity: 0.8 }}>{playerName(who)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {lopsided && (
        <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
          Somebody owns more than four. The game would not allow it, but the arithmetic
          still works — {PLAYER_IDS.map((p) => `${playerName(p)} ${counts[p]}`).join(', ')}.
        </p>
      )}

      <table className="record">
        <thead>
          <tr><th>#</th><th>Player</th><th>Net</th><th>W</th><th>L</th><th>D</th><th>vs actual</th></tr>
        </thead>
        <tbody>
          {altTable.map((r, i) => {
            const delta = r.net - (actualNet[r.player] ?? 0);
            return (
              <tr key={r.player}>
                <td className="num">{i + 1}</td>
                <td>{playerName(r.player)}</td>
                <td className="num">{inr(r.net)}</td>
                <td className="num">{r.w}</td>
                <td className="num">{r.l}</td>
                <td className="num">{r.d}</td>
                <td className="num">{delta === 0 ? '—' : inr(delta)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
        {played.length} settled {played.length === 1 ? 'fixture' : 'fixtures'} re-run.
        {' '}Balances sum to {sumsToZero(altTable) ? '₹0, as they must' : 'something other than ₹0 — that is a bug'}.
        {' '}Fixtures one player owned both sides of are left out: they were logged at ₹0
        with no record of who won, so there is nothing to re-run.
      </p>
    </>
  );
}
