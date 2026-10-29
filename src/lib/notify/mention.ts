// Telegram mentions.
//
// A muted group is the normal state of a group chat, and someone always has
// this one muted. A plain name in the text reaches nobody; a real mention
// punches through a mute and lights up their phone.
//
// players.telegram_chat_id IS the user id for a private chat — playerByTg()
// already matches it against update.message.from.id — so no new lookup is
// needed to build one.
//
// Used sparingly ON PURPOSE: only the people with money on the thing being
// announced. Mention all four every time and everyone mutes the bot too,
// which costs more than it ever gained.

/** Telegram's HTML inline mention. parse_mode is already HTML everywhere. */
export function mention(name: string, userId: string | null | undefined): string {
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // A numeric id is the only thing tg://user accepts. Anything else — an
  // unlinked player, a legacy chat id with a minus sign — renders as the
  // plain name rather than a broken link.
  if (!userId || !/^\d+$/.test(String(userId))) return esc(name);
  return `<a href="tg://user?id=${String(userId)}">${esc(name)}</a>`;
}

export interface MentionablePlayer { id: string; name: string; telegram_chat_id: string | null }

/**
 * name -> mention markup, for the players given. Anyone not listed, or not
 * linked, falls through to their plain name.
 */
export function mentionMap(players: MentionablePlayer[]): (playerId: string, fallback?: string) => string {
  const byId = new Map(players.map((p) => [p.id, p]));
  return (playerId: string, fallback?: string) => {
    const p = byId.get(playerId);
    return p ? mention(p.name, p.telegram_chat_id) : (fallback ?? playerId);
  };
}
