// Who has stopped talking. markInbound() already stamps config with every
// player's last inbound message, so this needs no new tracking — only the
// arithmetic and the nerve to name them.

export interface Silent { player: string; days: number | null }

/**
 * Days since each player last spoke. `days: null` means never, at all.
 *
 * With `observedSinceMs`, nothing before that instant is trusted: the bot was
 * not recording chatter then, so the most it can honestly say is "nothing
 * since I started watching". Days are measured from whichever is later, and
 * "never said a word" can no longer be claimed.
 */
export function silentPlayers(
  lastInbound: Record<string, string | null | undefined>,
  players: readonly string[],
  nowMs: number,
  minDays = 3,
  observedSinceMs?: number,
): Silent[] {
  const out: Silent[] = [];
  for (const p of players) {
    const at = lastInbound[p];
    let t = at ? Date.parse(at) : NaN;
    if (observedSinceMs !== undefined && Number.isFinite(observedSinceMs)) {
      t = Number.isFinite(t) ? Math.max(t, observedSinceMs) : observedSinceMs;
    }
    if (!Number.isFinite(t)) { out.push({ player: p, days: null }); continue; }
    const days = Math.floor((nowMs - t) / 864e5);
    if (days >= minDays) out.push({ player: p, days });
  }
  // Longest silence first. Never-spoken sorts above everyone.
  return out.sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER));
}

/**
 * When the silence line is allowed to speak: only once the bot has been
 * watching ordinary group messages for at least `minDays`. Returns the instant
 * watching began, or null while it has not been long enough — or has never
 * started, which is what privacy mode looks like.
 */
export function silenceObservable(firstSeenIso: string | null | undefined, nowMs: number, minDays = 3): number | null {
  const t = Date.parse(firstSeenIso ?? '');
  if (!Number.isFinite(t)) return null;
  return nowMs - t >= minDays * 864e5 ? t : null;
}
