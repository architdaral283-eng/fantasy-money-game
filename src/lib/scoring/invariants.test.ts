import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transfersSumToZero } from '@/lib/scoring/engine';

/**
 * Spec cases 19–21 are database invariants. They cannot be proved by the
 * pure engine alone, so this file does two things:
 *  (a) asserts the migration actually contains the enforcement mechanism, and
 *  (b) asserts the correction protocol (reversal + new row) preserves zero-sum.
 */

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/0001_schema.sql'),
  'utf8',
);

describe('19. Idempotency — one fixture/tie/trophy pays exactly once', () => {
  it('migration defines unique partial indexes (not app logic)', () => {
    expect(migration).toContain('ledger_fixture_once');
    expect(migration).toContain('ledger_tie_once');
    expect(migration).toContain('ledger_trophy_once');
    expect(migration).toContain('WHERE fixture_id IS NOT NULL AND is_correction = false');
    expect(migration).toContain('WHERE tie_id IS NOT NULL AND is_correction = false');
    expect(migration).toContain('WHERE trophy_id IS NOT NULL AND is_correction = false');
  });
});

describe('20. Append-only — UPDATE/DELETE raises', () => {
  it('migration defines BEFORE UPDATE OR DELETE trigger', () => {
    expect(migration).toContain('forbid_mutation');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON ledger_entries');
    expect(migration).toContain('ledger_append_only');
    expect(migration).toContain('append-only');
  });
});

describe('21. Correction protocol — reversal + new entry, original visible, zero-sum holds', () => {
  it('reversal + corrected row nets to the corrected value', () => {
    // Original (wrong): Harshal → Archit ₹500 for Arsenal 2-0 City.
    // Truth: it was 4-0, should have been ₹1000.
    // Protocol: reversal (Archit → Harshal ₹500, is_correction, corrects original)
    //         + corrected (Harshal → Archit ₹1000, is_correction, corrects original)
    const original = [
      { from: 'harshal' as const, to: 'archit' as const, amount: 500, eventType: 'MATCH' as const, description: 'Arsenal 2-0 Man City (recorded)' },
    ];
    const correction = [
      { from: 'archit' as const, to: 'harshal' as const, amount: 500, eventType: 'MATCH' as const, description: 'REVERSAL of entry #N' },
      { from: 'harshal' as const, to: 'archit' as const, amount: 1000, eventType: 'MATCH' as const, description: 'Arsenal 4-0 Man City (corrected)' },
    ];
    // every batch is zero-sum on its own
    expect(transfersSumToZero(original)).toBe(true);
    expect(transfersSumToZero(correction)).toBe(true);
    expect(transfersSumToZero([...original, ...correction])).toBe(true);
    // net effect: Archit +1000, Harshal -1000 — the corrected value
    const net = new Map<string, number>();
    for (const t of [...original, ...correction]) {
      net.set(t.from, (net.get(t.from) ?? 0) - t.amount);
      net.set(t.to, (net.get(t.to) ?? 0) + t.amount);
    }
    expect(net.get('archit')).toBe(1000);
    expect(net.get('harshal')).toBe(-1000);
  });

  it('migration supports corrections without mutating (is_correction + corrects_entry_id)', () => {
    expect(migration).toContain('is_correction');
    expect(migration).toContain('corrects_entry_id');
  });
});
