// Standing up from prone (Hero's Handbook p178; Instant Up p76) and dropping prone on purpose (p177).
// A prone fighter stands at the start of its turn when it wants to move or fight up close; a shooter that has no need
// to move stays down, since ranged attackers have -5 against it. The decisions are small functions at the top.

import { sign, d20, log } from './util.js';
import { STYLES } from './styles.js';
import { checkPenalty, moveZones } from './conditions.js';
import { rangePenalty, expectedValue } from './odds.js';
import { wantsKite } from './tactics-position.js';
import { shelterOf, piecesOf } from './cover.js';
import { isProne, standableProne, makeProne } from './prone.js';

export const STAND_DC = 20;
const CLOSE_HARM = 0.25; // expected degrees from a foe's close attack that make dropping prone a bad idea
const SHOT_HARM = 0.15;  // a ranged foe must threaten at least this much to be worth the trouble

/** Plans that end in an attack made with `choice.attack`; every other plan (move, feint, grab, trip) needs the fighter on its feet. */
const ATTACK_PLANS = ['attack', 'cover', 'disarm', 'smash'];

/** Does this plan need the fighter standing: it moves, fights up close, or must get into range first? */
export function needsFeet(c, choice) {
  if (!ATTACK_PLANS.includes(choice.plan)) return true;
  const atk = choice.attack;
  return !atk || atk.kind === 'close' || rangePenalty(atk, Math.abs(c.pos - choice.target.pos)) > 5;
}

/** Run `make` (the planner) as if a fighter that can stand were already on its feet. */
export function planStanding(c, make) {
  const down = standableProne(c);
  if (!down.length) return make();
  c.conditions = c.conditions.filter((x) => !down.includes(x));
  try { return make(); } finally { c.conditions.push(...down); }
}

/** Free with Instant Up or a DC 20 Acrobatics check, else a move action. Null when it cannot stand this turn. */
function tryStand(b, c, rng, canMove) {
  if (c.adv['Instant Up']) return { how: 'a free action (Instant Up)', dice: [] };
  const mod = c.skills.Acrobatics - checkPenalty(c);
  if (mod < 0) return canMove ? { how: 'a move action', dice: [], usesMove: true } : null; // 20 is out of reach
  const roll = d20(rng);
  const total = roll + mod;
  const dice = [{ label: 'Stand', roll, mod, total, dc: STAND_DC }];
  const check = `Acrobatics d20 ${roll} ${sign(mod)} = ${total} vs DC ${STAND_DC}`;
  if (total >= STAND_DC) return { how: `a free action (${check})`, dice };
  if (canMove) return { how: `a move action (${check}, too low to do it free)`, dice, usesMove: true };
  log(b, { kind: 'miss', actor: c.id, text: `${c.name} tries to get up without using a move: ${check} — still prone.`, dice });
  return null;
}

/** Get up. Standing as a move action leaves no movement for the rest of the turn. */
function standUp(b, c, rng, mode) {
  const got = tryStand(b, c, rng, mode === 'full' && moveZones(c) > 0);
  if (!got) return;
  c.conditions = c.conditions.filter((x) => !standableProne(c).includes(x));
  if (got.usesMove) c.noMove = true;
  log(b, { kind: 'recover', actor: c.id, text: `${c.name} stands up as ${got.how}.`, dice: got.dice });
}

/** A foe that could do real harm up close (any close attack, a fist included): it would get +5 against a prone fighter. */
const closeThreat = (e, c) => e.attacks.some((a) => a.kind === 'close' && expectedValue(e, a, c, { dist: 0 }) >= CLOSE_HARM);

/**
 * Drop prone (a free action) is for a ranged-heavy fighter in the open, with no cover, that faces only ranged foes,
 * has a shot it can take without moving, and is being shot at: prone gives its foes -5 and costs it nothing.
 */
function wantsToDrop(b, c, choice, enemies) {
  const S = STYLES[c.style];
  const atk = choice.attack;
  if (choice.plan !== 'attack' || atk?.kind !== 'ranged' || isProne(c) || c.grabbedBy || c.holding || wantsKite(b, c)) return false;
  if (!(S.ranged > S.close) || shelterOf(b, c) || piecesOf(b).some((p) => p.zone === c.pos && p.state !== 'destroyed')) return false;
  if (rangePenalty(atk, Math.abs(c.pos - choice.target.pos)) > 5 || enemies.some((e) => closeThreat(e, c))) return false;
  return enemies.some((e) => e.attacks.some((a) => a.kind === 'ranged' && expectedValue(e, a, c, { dist: Math.abs(e.pos - c.pos) }) > SHOT_HARM));
}

/** The prone step of a turn: stand when the plan needs it, drop prone when that is the smart thing for a shooter. */
export function standOrDrop(b, c, choice, enemies, mode, rng) {
  if (standableProne(c).length) {
    if (needsFeet(c, choice)) standUp(b, c, rng, mode);
    return;
  }
  if (wantsToDrop(b, c, choice, enemies)) {
    makeProne(c, c, 'drop', 'dropped prone');
    log(b, { kind: 'note', actor: c.id, text: `${c.name} drops prone (a free action): ranged attackers have -5 against a prone target, and no one is coming to melee.` });
  }
}
