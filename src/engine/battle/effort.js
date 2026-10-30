// Extra effort (Hero's Handbook p19-20): a free action, once a turn, that gives one benefit (or two with Extraordinary
// Effort, p74, which also costs double) in exchange for fatigue. The benefits the fight uses:
// - power: +1 rank on one of the fighter's power effects until the start of its next turn
// - strength: +1 Strength rank (unarmed and Strength-based damage)
// - bonus: a +2 circumstance bonus on one check (the attack check)
// - action: an extra standard action
// - speed: +1 speed rank, which doubles the distance of a move
// - resistance: an immediate extra resistance check against an ongoing effect (end-of-turn.js)
// A fatigued fighter who uses extra effort is exhausted, and an exhausted one is incapacitated, so the AI stops at one
// level; a hero point spent at the start of the next turn takes the fatigue away (the engine spends it at once, by chance).
// Power stunts (a temporary Alternate Effect) are not simulated: a fighter's own alternate effects are already free to switch.

import { log, enemiesOf } from './util.js';
import { hitOdds } from './odds.js';
import { defenseVs, checkPenalty } from './conditions.js';
import { forceEffort } from './tactics.js';
import { bestAttackVs } from './plan.js';
import { resolveAttack } from './attacks.js';
import { inRangeNow, inReach } from './geometry.js';
import { payEffort } from './effort-pay.js';

const QUIET = { next: () => 0.5 };
const STYLES = ['mage', 'omni', 'blaster', 'tank', 'brawler', 'mentalist'];

/** Which kind of extra effort this attack would take, or null. A power effect pushes its rank; unarmed uses Strength; anything else with an attack check takes the bonus. */
function kindFor(c, attack) {
  // Extraordinary Effort costs two levels of fatigue, so the AI takes it only fresh and with a hero point to take one away
  if (attack.power && !attack.equipment) return c.adv['Extraordinary Effort'] && c.fatigue === 0 && c.heroPoints > 0 ? 'double' : 'power';
  if (attack.unarmed && !attack.equipment) return 'strength';
  return attack.roll && !attack.area ? 'bonus' : null;
}

/** A +2 on the attack check is worth ten points of hit chance: only when the shot is a real toss-up (between one in five and three in four). */
function bonusWorth(b, c, attack, target) {
  const def = defenseVs(target, attack.kind === 'close' ? 'Parry' : 'Dodge', c);
  const now = hitOdds(attack.bonus - checkPenalty(c), def).hit;
  return now >= 0.2 && now <= 0.75;
}

/** Extra effort on this attack: 'power', 'double', 'strength', 'bonus' or null. */
export function pickEffort(b, c, attack, target, rng) {
  if (!b.options.extraEffort || c.fatigue >= 2 || attack.flaws?.strained || c.effortRound === b.round) return null;
  const kind = kindFor(c, attack);
  if (!kind || (kind === 'bonus' && !bonusWorth(b, c, attack, target))) return null;
  const hurt = c.staggered || c.bruises >= 2;
  const pushing = kind === 'power' || kind === 'double'; // a power is pushed when losing or a few rounds in; Strength and a bonus on the check only when losing, and with a hero point to take the fatigue away
  if (!pushing && !(b.options.heroPoints && c.heroPoints > 0)) return null;
  if (forceEffort(b, c) || ((hurt || (pushing && b.round >= 3 && target.bruises === 0)) && STYLES.includes(c.style) && rng.chance(0.45))) return kind;
  return null;
}

/**
 * An extra standard action (extra effort, once a turn): after the attack, one more at the best foe still standing, when it is
 * worth a level of fatigue (a strong attack, a fresh fighter, and a hero point to take the fatigue away). True when it was used.
 */
export function extraAction(b, R, c, rng, usedEffort) {
  if (usedEffort || c.effortRound === b.round || !b.options.extraEffort || c.fatigue > 0 || c.heroPoints < 1 || c.out || c.fled) return false;
  let best = null;
  for (const t of enemiesOf(b, c)) {
    const pick = bestAttackVs(b, c, t, QUIET, { full: false }); // judging only: it must not use up the turn's dice
    if (pick.attack && (inReach(b, c, t, pick.attack) || inRangeNow(b, c, pick.attack, t)) && (!best || pick.ev > best.ev)) best = { ...pick, t };
  }
  // Worth the fatigue when it can finish a foe who is already hurt, with a strong attack
  if (!best || best.ev < 1.2 || !(best.t.staggered || best.t.bruises >= 2)) return false;
  const cost = payEffort(b, c, rng, 'action');
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} uses extra effort for an extra standard action (${cost}).`, important: true });
  resolveAttack(b, R, c, best.attack, best.t, rng, {});
  return true;
}

/**
 * A resistance check against an ongoing effect that failed: extra effort gives an immediate extra check (p20). The AI takes it
 * for a severe condition when it is not already fatigued. True when the effort was paid; the caller rolls the check.
 */
export function extraResistance(b, c, rng, severe) {
  if (!severe || !b.options.extraEffort || c.fatigue >= 1 || c.out || c.effortRound === b.round) return false;
  const note = payEffort(b, c, rng, 'resistance');
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} uses extra effort for an extra resistance check (${note}).`, important: true });
  return true;
}

/** Extra effort for speed: +1 speed rank until the start of the next turn doubles the distance of a move. */
export function speedEffort(b, c) {
  if (!b.options.extraEffort || c.fatigue >= 1 || c.speedBoost || c.effortRound === b.round) return false;
  c.speedBoost = true;
  c.effortRound = b.round;
  c.owesFatigue = true; // the fatigue comes at the end of the turn, so the fighter is not hindered while it moves (endOfTurn)
  log(b, { kind: 'hero', actor: c.id, text: `${c.name} uses extra effort for +1 speed rank: moves twice as far this turn.`, important: true });
  return true;
}
