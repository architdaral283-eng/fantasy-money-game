// Auto-write policy (Amendment III) — pure decision table.
// Poller-verified results write on their own. Human reports always need Archit.
export type ProposalSource = 'poller' | 'report' | 'manual' | 'backfill';

export function requiresApproval(source: ProposalSource, amendmentRatified: boolean): boolean {
  if (source === 'poller') return !amendmentRatified;
  return true; // report, manual, backfill: human origin or bulk — always gated
}
