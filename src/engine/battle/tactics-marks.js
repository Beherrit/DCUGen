// Shared marks for the team tactics: the enemy a team focuses on or locks down, and the fighter it guards.

import { alive } from './util.js';
import { STYLES } from './styles.js';
import { activeConditions } from './conditions.js';
import { threatOn } from './odds.js';

export const isControlAttack = (a) => !!a.tiers || a.effect === 'Nullify';

/** Pinned, exposed or helpless: a Lockdown team is done with this enemy for now. */
export function isControlled(t) {
  const s = activeConditions(t);
  return ['Vulnerable', 'Defenseless', 'Stunned', 'Bound'].some((x) => s.has(x));
}

/** Can this fighter pin an enemy down: an Affliction, Snare-type, Nullify or a grab? */
export function hasControl(c) {
  return c.attacks.some(isControlAttack) || !!(STYLES[c.style].grabs || c.adv['Fast Grab'] || c.adv['Improved Grab'] || c.adv.Chokehold);
}

/** How much harm enemy e could do to the whole team, added up over its members. */
function teamThreat(b, team, e) {
  return alive(b).filter((m) => m.team === team).reduce((sum, m) => sum + threatOn(e, m, Math.abs(e.pos - m.pos)), 0);
}

/** The enemy a team has marked this round (kept while it stands and still qualifies), else the most threatening one. */
export function pickMark(b, team, key, qualifies) {
  const marks = ((b.tac ||= {})[key] ||= {});
  const foes = alive(b).filter((x) => x.team !== team);
  const held = marks[team]?.round === b.round ? foes.find((x) => x.id === marks[team].id) : null;
  if (held && qualifies(held)) return held;
  let best = null; let bestThreat = -1;
  for (const e of foes) {
    if (!qualifies(e)) continue;
    const v = teamThreat(b, team, e);
    if (v > bestThreat) { best = e; bestThreat = v; }
  }
  marks[team] = { round: b.round, id: best ? best.id : null };
  return best;
}

export const focusTarget = (b, team) => pickMark(b, team, 'focus', () => true);
export const lockTarget = (b, team) => pickMark(b, team, 'lock', (e) => !isControlled(e));

/** The fighter a Bodyguard team protects: the one named in the options, else the team member with the lowest Toughness. */
export function vipOf(b, team) {
  const mates = alive(b).filter((x) => x.team === team);
  const named = b.options.vip?.[team];
  if (named) return mates.find((x) => x.id === named) || null;
  return mates.reduce((low, x) => (!low || x.d.defenses.Toughness < low.d.defenses.Toughness ? x : low), null);
}
