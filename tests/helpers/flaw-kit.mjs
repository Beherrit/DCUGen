// Shared fixtures for the flaw tests: a duel between a user with one flawed Zap and a plain target, and scripted dice.
// A natural 19 on the attack roll hits without being a critical (the user's bonus is +2 against Dodge 10), so the
// target's resistance roll is the next die, against DC 15 + rank.
import { powerArena, who, dice, text, R } from './power-arena.mjs';
import { resolveAttack } from '../../src/engine/battle/attacks.js';

export { who, dice, text, R };

export const HIT = 19;
export const zap = (flaws = [], over = {}) => ({ name: 'Zap', effect: 'Damage', rank: 8, range: 'Ranged', role: 'attack', extras: [], flaws, ...over });
export const flaw = (name, rest = {}) => ({ name, ...rest });

/** Two fighters two squares apart: U (team A) with a Zap carrying the flaws, T (team B) a plain body with no hero points to spend on its rolls. `user` and `target` are fighter options. */
export function duel(flaws, over = {}, target = {}, user = {}, options = {}) {
  const b = powerArena([['U', 'A', { powers: [zap(flaws, over)], ...user }, { x: 0, y: 0 }], ['T', 'B', { hp: 0, ...target }, { x: 2, y: 0 }]], { heroPoints: true, ...options });
  const u = who(b, 'U');
  return { b, u, t: who(b, 'T'), atk: u.attacks.find((a) => a.name === 'Zap') };
}

/** U uses the Zap on T with these scripted dice. */
export const fire = (f, ...rolls) => resolveAttack(f.b, R, f.u, f.atk, f.t, dice(...rolls), {});
export const logOf = (f) => text(f.b);
