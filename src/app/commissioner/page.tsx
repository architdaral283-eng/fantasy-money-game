'use client';

import { useState } from 'react';
import { parseOneLine } from '@/lib/parse/one-line';
import { scoreSingleFixture } from '@/lib/scoring/engine';

/**
 * Commissioner console — pending queue, bulk approve, manual one-line entry,
 * correction form, round config, quota dashboard, backfill trigger (§/commissioner).
 * Commissioner-only; enforced by RLS + role check in the API.
 */
export default function Commissioner() {
  const [line, setLine] = useState('Arsenal 2-0 Manchester City - Premier League');
  const [preview, setPreview] = useState<string>('');
  const [ratified, setRatified] = useState(false);

  const compute = () => {
    const parsed = parseOneLine(line);
    if ('error' in parsed) { setPreview(parsed.error); return; }
    const p = scoreSingleFixture({
      competitionCode: parsed.competitionCode, round: 'League',
      homeClubId: parsed.homeClubId, awayClubId: parsed.awayClubId,
      scoreAt90: { home: parsed.homeGoals, away: parsed.awayGoals },
      scoreAt120: null, shootout: null, terminalStatus: 'FT',
      kickoffUtc: new Date().toISOString(),
    });
    setPreview(JSON.stringify({ kind: p.kind, amount: p.amount, winner: p.winnerPlayer, transfers: p.transfers }, null, 2));
  };

  return (
    <>
      <h2>Commissioner Console</h2>
      {!ratified && (
        <div className="card">
          <h4>Amendment I — Assisted Operating Mode (pending ratification)</h4>
          <p>The Commissioner may proactively retrieve results from designated data providers. Retrieved results are <strong>proposals only</strong> and carry no force. No proposal enters the ledger without explicit approval from Archit.</p>
          <button className="sans" onClick={() => setRatified(true)}>Ratify Amendment I (Archit only)</button>
          <p className="sans">The poller cannot run until this is accepted.</p>
        </div>
      )}
      <h3>Pending approvals</h3>
      <p className="sans">Queue empty. Batch mode appears when more than five proposals are pending.</p>
      <h3>Manual result entry</h3>
      <input className="sans" value={line} onChange={(e) => setLine(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <p><button className="sans" onClick={compute}>Compute proposal</button></p>
      {preview && <pre className="sans">{preview}</pre>}
      <h3>Open decisions for Archit (§17)</h3>
      <ul className="sans">
        <li>Largest Upset definition — provisional until confirmed</li>
        <li>Public standings page — on or off (default off)</li>
        <li>Reverse-fixture display warning — confirm</li>
        <li>Round formats — confirm Copa del Rey SF two legs, Coppa Italia SF one leg</li>
        <li>Backfill scope — confirm start date (default 21 Aug 2026)</li>
      </ul>
    </>
  );
}
