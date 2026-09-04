'use client';

import { useState } from 'react';

/**
 * Commissioner console — manual one-line entry → Submit (creates a PENDING
 * approval) → Approve (writes the ledger). Approvals are Archit-only.
 */
export default function Commissioner() {
  const [line, setLine] = useState('Arsenal 2-0 Manchester City - Premier League');
  const [msg, setMsg] = useState<string>('');
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [ratified, setRatified] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setMsg(''); setApprovalId(null);
    try {
      const res = await fetch('/api/manual-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(`❌ ${j.error}`); if (j.approvalId) setApprovalId(j.approvalId); return; }
      setMsg(`✅ Proposal ready: ${j.summary}${j.swapped ? ' (recorded as the reverse leg)' : ''}`);
      setApprovalId(j.approvalId);
    } catch { setMsg('❌ Network error — try again.'); }
    setBusy(false);
  };

  const approve = async () => {
    if (!approvalId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE', decidedBy: 'archit' }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(`❌ ${j.error}`); return; }
      setMsg(`✅ Recorded — ${j.entries} ledger row(s). See Standings and Ledger.`);
      setApprovalId(null);
    } catch { setMsg('❌ Network error — try again.'); }
    setBusy(false);
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
      <h3>Record a result</h3>
      <p>Type the score exactly like this, then Submit, check the summary, then Approve:</p>
      <input className="sans" value={line} onChange={(e) => setLine(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <p>
        <button className="sans" onClick={submit} disabled={busy}>1. Submit proposal</button>
        {' '}
        {approvalId && <button className="sans" onClick={approve} disabled={busy}>2. Approve &amp; write to ledger</button>}
      </p>
      {msg && <p className="sans">{msg}</p>}
      <div className="card">
        <h4>Format examples</h4>
        <p className="sans">Arsenal 2-0 Manchester City - Premier League<br />Barcelona 4-0 Real Madrid - Copa del Rey<br />Inter 1-1 Juventus - Serie A</p>
      </div>
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
