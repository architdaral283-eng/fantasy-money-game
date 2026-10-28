// Who has stopped talking. markInbound() already stamps config with every
// player's last inbound message, so this needs no new tracking — only the
// arithmetic and the nerve to name them.

export interface Silent { player: string; days: number | null }

/** Days since each player last spoke. `days: null` means never, at all. */
export function silentPlayers(
  lastInbound: Record<string, string | null | undefined>,
  players: readonly string[],
  nowMs: number,
  minDays = 3,
): Silent[] {
  const out: Silent[] = [];
  for (const p of players) {
    const at = lastInbound[p];
    if (!at) { out.push({ player: p, days: null }); continue; }
    const t = Date.parse(at);
    if (!Number.isFinite(t)) { out.push({ player: p, days: null }); continue; }
    const days = Math.floor((nowMs - t) / 864e5);
    if (days >= minDays) out.push({ player: p, days });
  }
  // Longest silence first. Never-spoken sorts above everyone.
  return out.sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER));
}
