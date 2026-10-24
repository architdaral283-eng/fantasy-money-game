// Pre-match needle. One line, chosen deterministically from the fixture id so
// the same fixture never gets two different jabs across retries, and the pool
// cycles instead of repeating.
//
// Same register as the 0019 roast library: these four have been friends for
// years and the whole point of the game is the abuse. Nothing here depends on
// a result — it is all pre-match, about the table and the talk.

const LEVEL = [
  '{a} and {b} are level on the money. In two hours exactly one of you still will be.',
  'Both of you have spent the week talking. Ninety minutes to find out which one was lying.',
  'One of you leaves this richer. The other leaves the group chat on read.',
  'Nobody won the argument in here, so the match will have to settle it.',
  'Two self-declared experts, one scoreline. Somebody’s CV gets shorter tonight.',
  'Talk is free until kickoff. After that it costs ₹500 a word.',
  '{a} v {b}: the fixture neither of you has shut up about, finally played.',
  'Level on money, level on knowledge, level on bollocks. Let’s break the tie.',
];

const GAPPED = [
  '{up} is {gap} up on {down} and has not stopped mentioning it. Here’s the shutting-up opportunity.',
  '{down} is {gap} light and has been circling this one all week.',
  '{up} turns up with the money. {down} turns up with the excuses already written.',
  '{down} needs this far more than {up} does, and everyone in here knows it.',
  '{up} leads by {gap}. {down} leads by nothing, which is becoming a theme.',
  'If {down} loses this one too we are renaming him in the table.',
  'One of these two has actual footballing knowledge. The table has already told you which.',
  '{down} is {gap} down and still picking teams like it’s a raffle.',
  '{up} has been quiet all week. That is the sound of a man holding the money.',
  '{down} swears this is the turnaround. He swore that last time as well.',
  'Easy money for {up} unless {down} has learned something since the last one. He hasn’t.',
  '{up} doesn’t need this. {down} cannot afford to lose it. Perfect.',
  '{down} talks like a pundit and pays like a punter.',
  '{up} is about to widen the gap and {down} is about to blame the referee.',
  'Bragging rights plus ₹500, and {down} currently has neither.',
  '{down} has {gap} of ground to make up and the tactical insight of a brick.',
];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/**
 * One pre-match line. `netA`/`netB` are the two owners' current net positions;
 * when they are level the needle is symmetric, otherwise it names the leader.
 */
export function preMatchNeedle(seed: string, a: string, b: string, netA = 0, netB = 0): string {
  const gap = Math.abs(netA - netB);
  const pool = gap === 0 ? LEVEL : GAPPED;
  const body = pool[hash(seed) % pool.length];
  const up = netA > netB ? a : b;
  const down = netA > netB ? b : a;
  return body
    .replace(/\{a\}/g, a).replace(/\{b\}/g, b)
    .replace(/\{up\}/g, up).replace(/\{down\}/g, down)
    .replace(/\{gap\}/g, `₹${gap.toLocaleString('en-IN')}`);
}

export const NEEDLE_COUNT = LEVEL.length + GAPPED.length;
