import { describe, it, expect } from 'vitest';
import { requiresApproval } from '@/lib/entry/policy';

describe('Amendment III auto-write policy', () => {
  it('poller-verified results skip approval once ratified', () => {
    expect(requiresApproval('poller', true)).toBe(false);
    expect(requiresApproval('poller', false)).toBe(true);
  });

  it('human reports always need Archit, amendment or not', () => {
    for (const s of ['report', 'manual', 'backfill'] as const) {
      expect(requiresApproval(s, true)).toBe(true);
      expect(requiresApproval(s, false)).toBe(true);
    }
  });
});
