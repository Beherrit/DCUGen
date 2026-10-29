// Small shared helpers for the battle engine: the per-turn random stream, the log, dice, and who is still standing.

import { makeRng } from '../rng.js';

export const hasExtra = (p, name) => (p?.extras || []).some((m) => m.name === name);
export const extraOpt = (p, name) => (p?.extras || []).find((m) => m.name === name)?.option;
export const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function rngFor(b) { return makeRng(`${b.seed}::${b.tick++}`); }
export const d20 = (rng) => rng.int(1, 20);

export function log(b, entry) {
  b.log.push({ round: b.round, i: b.log.length, ...entry });
}
export function byId(b, id) { return b.combatants.find((c) => c.id === id); }
export const alive = (b) => b.combatants.filter((c) => !c.out && !c.fled);
export const enemiesOf = (b, c) => alive(b).filter((x) => x.team !== c.team);
export const alliesOf = (b, c) => alive(b).filter((x) => x.team === c.team && x !== c);
