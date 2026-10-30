// What a fighter does with a weapon fight beyond swinging (Hero's Handbook p79, p75):
// - Weapon Bind and Weapon Break: a fighter who took the Defend action and defended against a close weapon attack makes a
//   disarm attempt, or an attack on the attacker's weapon, as a reaction. The AI takes the Defend action for it when a foe
//   with a weapon is on it and its own attack is not worth much (weaponDefends).
// - Quick Draw (p77): drawing a weapon takes a free action instead of a move action. A fighter who was disarmed picks its
//   weapon up again (a move action; Quick Draw makes it free). house rule: the book's Quick Draw is about a holster, and a
//   dropped weapon is picked up; they are treated as one thing here, so that a disarm costs a fighter a turn's move, or nothing.

import { log } from './util.js';
import { disarm } from './disarm.js';
import { smash } from './smash.js';
import { rebuildCombatant } from './combatant.js';
import { inReach } from './geometry.js';

const bestClose = (c) => c.attacks.filter((a) => a.kind === 'close' && a.roll && !a.area).sort((x, y) => y.rank - x.rank)[0] || null;

/** The attacker missed a defender who took the Defend action: Weapon Bind or Weapon Break answers a close weapon attack. */
export function weaponReaction(b, attacker, atk, t, rng) {
  if (!t.defending || atk.kind !== 'close' || !atk.item || atk.unarmed || t.out) return;
  const mine = bestClose(t);
  if (!mine) return;
  if (t.adv['Weapon Bind']) {
    log(b, { kind: 'note', actor: t.id, target: attacker.id, text: `${t.name} defended against the ${atk.item.name} and uses Weapon Bind: a disarm attempt as a reaction.` });
    disarm(b, t, mine, attacker, atk.item, rng, 0);
  } else if (t.adv['Weapon Break']) {
    log(b, { kind: 'note', actor: t.id, target: attacker.id, text: `${t.name} defended against the ${atk.item.name} and uses Weapon Break: an attack on the weapon as a reaction.` });
    smash(b, t, mine, attacker, atk.item, rng, 0);
  }
}

/** A fighter with Weapon Bind or Break digs in on the Defend action against a foe's weapon when its own attack is weak. True when it did. */
export function weaponDefends(b, c, choice, enemies) {
  if (!(c.adv['Weapon Bind'] || c.adv['Weapon Break']) || !bestClose(c) || c.defending) return false;
  const armed = enemies.filter((e) => e.attacks.some((a) => a.kind === 'close' && a.item && !a.unarmed) && inReach(b, e, c));
  if (!armed.length || (choice && choice.plan === 'attack' && (choice.ev ?? 0) >= 0.8)) return false;
  c.defending = true;
  log(b, { kind: 'note', actor: c.id, text: `${c.name} takes the Defend action against ${armed[0].name}'s weapon, ready to ${c.adv['Weapon Bind'] ? 'bind' : 'break'} it.` });
  return true;
}

/** The start of a turn: a fighter who lost a weapon to a disarm gets it back, free with Quick Draw, else with the move action. */
export function fetchWeapon(b, R, c, mode) {
  if (!c.disarmed?.length || c.out) return;
  const quick = !!c.adv['Quick Draw'];
  if (!quick && mode !== 'full') return;
  const key = c.disarmed.shift();
  c.dropped = (c.dropped || []).filter((k) => k !== key);
  rebuildCombatant(c, R);
  if (!quick) c.noMove = true; // the move action went on picking it up
  log(b, { kind: 'note', actor: c.id, text: `${c.name} gets its weapon back${quick ? ' as a free action (Quick Draw)' : ' with its move action'}.` });
}
