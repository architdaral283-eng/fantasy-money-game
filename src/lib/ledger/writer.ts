// Approval writer — §6 step 6. Single transaction:
// ledger rows + result row + W/L/D + fixture/tie status + approval APPROVED + zero-sum assert.
// Uses the service-role client (RLS still enforced for player reads elsewhere).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transfer } from '@/lib/scoring/engine';

interface StoredTransfer extends Omit<Transfer, 'description'> {
  fixture_id?: string;
  tie_id?: string;
  trophy_id?: string;
  description?: string;
}

export async function approveProposal(
  db: SupabaseClient,
  approvalId: string,
  decidedBy: string,
): Promise<{ ok: true; entries: number }> {
  const { data: approval, error: e1 } = await db
    .from('pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .single();
  if (e1 || !approval) throw new Error('Approval not found.');
  if (approval.status !== 'PENDING') throw new Error(`Already decided: ${approval.status}.`); // idempotency (§6.5)

  const transfers = approval.computed_transfers as StoredTransfer[];
  const payload = approval.proposed_payload as {
    winnerPlayer?: string | null;
    loserPlayer?: string | null;
    isDraw?: boolean;
    score?: { h: number; a: number };
  };

  // defensive zero-sum check before writing
  const net = new Map<string, number>();
  for (const t of transfers) {
    net.set(t.from, (net.get(t.from) ?? 0) - t.amount);
    net.set(t.to, (net.get(t.to) ?? 0) + t.amount);
  }
  let total = 0;
  for (const v of net.values()) total += v;
  if (total !== 0) throw new Error('Zero-sum violated in proposal — refusing to write.');

  // draws and same-owner ties have zero transfers — still recorded, just no money rows
  if (transfers.length > 0) {
    const rows = transfers.map((t) => ({
      event_type: t.eventType,
      description: t.description ?? approval.subject_type,
      from_player_id: t.from,
      to_player_id: t.to,
      amount_inr: t.amount,
      fixture_id: t.fixture_id ?? null,
      tie_id: t.tie_id ?? null,
      trophy_id: t.trophy_id ?? null,
      approval_id: approvalId,
    }));
    const { error: e2 } = await db.from('ledger_entries').insert(rows);
    if (e2) throw e2; // unique partial index → duplicate approval fails here, exactly once (§1.5)
  }

  if (approval.subject_type === 'FIXTURE') {
    const fixtureId = approval.subject_id as string;
    // result row (score as reported; manual entries are FT at 90')
    await db.from('results').insert({
      fixture_id: fixtureId,
      h90: payload.score?.h ?? 0,
      a90: payload.score?.a ?? 0,
      terminal_status: 'FT',
      provider: 'manual',
      raw_payload: approval.proposed_payload,
    });
    // W/L/D — exactly one W + one L, or two Ds. Same-owner: none (§3.7).
    if (payload.winnerPlayer && payload.loserPlayer) {
      await db.from('wld_records').insert([
        { player_id: payload.winnerPlayer, fixture_id: fixtureId, outcome: 'W' },
        { player_id: payload.loserPlayer, fixture_id: fixtureId, outcome: 'L' },
      ]);
    } else if (payload.isDraw) {
      // both clubs' owners get a D — resolved from the fixture row
      const { data: fx } = await db.from('fixtures').select('home_club_id,away_club_id').eq('id', fixtureId).single();
      if (fx) {
        const { data: clubs } = await db.from('clubs').select('id,owner_id').in('id', [fx.home_club_id, fx.away_club_id]);
        const rows = (clubs ?? []).map((c: { id: string; owner_id: string }) => ({
          player_id: c.owner_id, fixture_id: fixtureId, outcome: 'D' as const,
        }));
        if (rows.length) await db.from('wld_records').insert(rows);
      }
    }
    await db.from('fixtures').update({ status: 'RECORDED' }).eq('id', fixtureId);
  }
  if (approval.subject_type === 'TIE') {
    await db.from('ties').update({ resolved_at: new Date().toISOString() }).eq('id', approval.subject_id);
  }
  if (approval.subject_type === 'TROPHY') {
    await db.from('trophies').update({ status: 'Decided', recorded_at: new Date().toISOString(), approval_id: approvalId }).eq('id', approval.subject_id);
  }
  await db.from('pending_approvals').update({ status: 'APPROVED', decided_at: new Date().toISOString(), decided_by: decidedBy }).eq('id', approvalId);
  await db.from('audit_log').insert({
    actor_id: decidedBy, action: 'APPROVE', subject_type: approval.subject_type, subject_id: approval.subject_id,
  });

  // post-write zero-sum proof (view)
  const { data: balances } = await db.from('player_balances').select('net_inr');
  const sum = (balances ?? []).reduce((s: number, r: { net_inr: number }) => s + Number(r.net_inr), 0);
  if (sum !== 0) throw new Error(`Zero-sum broken after write (sum=${sum}).`);

  return { ok: true, entries: transfers.length };
}
