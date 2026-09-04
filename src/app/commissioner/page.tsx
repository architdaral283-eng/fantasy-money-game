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
  const [ratified1, setRatified1] = useState(false);
  const [ratified2, setRatified2] = useState(false);
  const [busy, setBusy] = useState(false);

  const ratify = async (key: string, done: (v: boolean) => void) => {
    const res = await fetch('/api/amendments/ratify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, decidedBy: 'archit' }),
    });
    if (res.ok) done(true);
    else setMsg(`❌ ${(await res.json()).error}`);
  };

  const submit = async () => {
    setBusy(true); setMsg(''); setApprovalId(null);
    try {
      const res = await fetch('/api/manual-entry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line }),
      });
      const text = await res.text();
      let j: { error?: string; approvalId?: string; summary?: string; swapped?: boolean };
      try { j = JSON.parse(text); }
      catch { setMsg(`❌ Server returned HTTP ${res.status} (not JSON). Message: ${text.slice(0, 200)}`); setBusy(false); return; }
      if (!res.ok) { setMsg(`❌ ${j.error}`); if (j.approvalId) setApprovalId(j.approvalId); setBusy(false); return; }
      setMsg(`✅ Proposal ready: ${j.summary}${j.swapped ? ' (recorded as the reverse leg)' : ''}`);
      setApprovalId(j.approvalId ?? null);
    } catch { setMsg('❌ Could not reach the server at all — check your internet connection and try again.'); }
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
      {!ratified1 && (
        <div className="card">
          <h4>Amendment I — Assisted Operating Mode (pending ratification)</h4>
          <p>The Commissioner may proactively retrieve results from designated data providers. Retrieved results are <strong>proposals only</strong> and carry no force. No proposal enters the ledger without explicit approval from Archit.</p>
          <button className="sans" onClick={() => ratify('amendment_1_assisted_mode', setRatified1)}>Ratify Amendment I (Archit only)</button>
          <p className="sans">The poller cannot run until this is accepted.</p>
        </div>
      )}
      {!ratified2 && (
        <div className="card">
          <h4>Amendment II — One-off cups in scope (pending: needs all four members)</h4>
          <p>Community Shield and DFL-Supercup enter scope for <strong>match money only</strong> (₹500/₹1000, single leg, extra time and penalties as per Article V). No trophy, not part of the ₹24,000 pool. Ratify only once Vedant, Harshal and Anmol have all agreed.</p>
          <button className="sans" onClick={() => ratify('amendment_2_oneoffs', setRatified2)}>Ratify Amendment II (Archit only, after all agree)</button>
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
        <p className="sans">Arsenal 2-0 Manchester City - Premier League<br />Barcelona 4-0 Real Madrid - Copa del Rey<br />Inter 1-1 Juventus - Serie A<br />Bayern Munich 2-1 Dortmund - DFL-Supercup (needs Amendment II ratified)</p>
      </div>
      <h3>Correct a recorded result</h3>
      <p>Type the <strong>correct</strong> scoreline in the same format. First you see a preview (original vs corrected), then you confirm. The wrong row stays visible forever; a reversal plus the corrected row is appended.</p>
      <CorrectionForm />
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

function CorrectionForm() {
  const [line, setLine] = useState('Bayern Munich 2-1 Dortmund - DFL-Supercup');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const call = async (preview: boolean) => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/corrections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line, preview }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(`❌ ${j.error}`); setReady(false); return; }
      if (j.preview) {
        setMsg(`Original: ${j.original.score} (${(j.original.rows as string[]).join('; ') || 'no money rows'}) → Corrected: ${j.corrected.score} — ${j.corrected.summary}`);
        setReady(true);
      } else {
        setMsg(`✅ ${j.summary}`);
        setReady(false);
      }
    } catch { setMsg('❌ Could not reach the server — check connection and try again.'); }
    setBusy(false);
  };

  return (
    <>
      <input className="sans" value={line} onChange={(e) => { setLine(e.target.value); setReady(false); }} style={{ width: '100%', padding: 8 }} />
      <p>
        <button className="sans" onClick={() => call(true)} disabled={busy}>1. Preview correction</button>
        {' '}
        {ready && <button className="sans" onClick={() => call(false)} disabled={busy}>2. Confirm correction</button>}
      </p>
      {msg && <p className="sans">{msg}</p>}
    </>
  );
}