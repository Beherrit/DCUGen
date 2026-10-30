// What extra effort costs and gives (Hero's Handbook p19-20, Extraordinary Effort p74), in a file that imports nothing but
// the log, so attacks.js can use it: the choice of when to push (effort.js) needs attacks.js and so sits above it.

import { log } from './util.js';

/** Pay for the effort: fatigue (two levels for Extraordinary Effort), and a hero point may take one away. Returns the note for the log. */
export function payEffort(b, c, rng, kind) {
  const levels = kind === 'double' ? 2 : 1;
  c.fatigue += levels;
  c.usedEffort++;
  c.effortRound = b.round; // extra effort is limited to once a turn
  let note = `now ${c.fatigue >= 2 ? 'exhausted' : 'fatigued'}`;
  if (b.options.heroPoints && c.heroPoints > 0 && rng.chance(0.5)) { c.heroPoints--; c.fatigue--; note += '; spends a hero point to shrug off the fatigue'; }
  return note;
}

/** The effect of an effort on the attack: { rank, hit, text }. */
export function effortEffect(b, c, rng, kind) {
  const cost = payEffort(b, c, rng, kind);
  if (kind === 'bonus') return { rank: 0, hit: 2, text: `extra effort: +2 on the attack check, ${cost}` };
  if (kind === 'strength') return { rank: 1, hit: 0, text: `extra effort: +1 Strength rank, ${cost}` };
  if (kind === 'double') return { rank: 2, hit: 0, text: `Extraordinary Effort: +2 ranks (two benefits), ${cost}` };
  return { rank: 1, hit: 0, text: `extra effort: +1 rank, ${cost}` };
}

/** The end of a turn that used extra effort for speed: the fatigue it cost arrives now. */
export function payOwed(b, c, rng) {
  if (!c.owesFatigue) return;
  c.owesFatigue = false;
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} pays for the speed: ${payEffort(b, c, rng, 'speed')}.` });
}
