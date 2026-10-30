// When a martial artist changes stance (Martial Arts 3e, pp 128-131). At the start of its turn the fighter weighs each stance it
// knows by what the fight would be worth in it, in the units of an attack's expected degrees (odds.js expectedValue): the best
// attack it could make on a foe it can get at, less a share of the harm the foes that can get at it would do. The stance's
// real numbers are put on the fighter for the weighing and taken off again (stance-build.js). A stance is worth taking when,
// after the chance that the Assume Stance check fails (which leaves the fighter in Neutral), it beats the stance held now by more
// than a small margin. Changing from a stance other than Neutral takes the move action, so it is weighed with no movement left
// (a Crane fighter cannot walk at all). Foes in a stance the fighter has not identified are weighed as if in Neutral.

import { checkResult } from './checks.js';
import { roleWeight } from './roles.js';
import { expectedValue } from './odds.js';
import { squares, reachSquares, squaresInMove, lineClear, feet } from './geometry.js';
import { attackCount } from './extra-attacks-read.js';
import { addMods, dropMods } from './mods.js';
import { stanceName, enterStance, assumeStance, assumeAction, assumeDc, checkBonus, disruption } from './stance-fight.js';
import { stanceUsable } from './stance-build.js';
import { sees, identifyStances, disruptOdds } from './stance-contest.js';

const MARGIN = 0.06;

/** The chance the Assume Stance check succeeds (a natural 20 can turn a one-degree failure into a success). */
function successOdds(bonus, dc) {
  let n = 0;
  for (let r = 1; r <= 20; r++) if (checkResult(r, bonus, dc, r === 20).success) n++;
  return n / 20;
}

/**
 * The best attack `a` could make on `t` once the two have closed (a stance is held through the fight, so it is weighed for the
 * fight and not only for this turn's distance): close attacks always count, except for a fighter who cannot walk and has to
 * be reached (Crane stance), and ranged ones at the distance they would be fired from, no farther than long range.
 */
function offenseVs(b, a, t, moves) {
  let best = 0;
  const far = squares(a, t) - Math.max(...a.attacks.map((x) => reachSquares(b, a, x)), 1) > 0;
  for (const atk of a.attacks) {
    if (!atk.roll && !atk.area) continue;
    const close = atk.range === 'close';
    if (close && !moves && far) continue;
    if (!close && !lineClear(b, a, t)) continue;
    const dist = close ? 0 : Math.min(feet(b, a, t), 25 * atk.rank);
    best = Math.max(best, expectedValue(a, atk, t, { dist, b }) * attackCount(a, atk));
  }
  return best;
}

/** What c's fight is worth in the stance it holds now: its best offense less a share of the harm foes could do it. */
function worth(b, c, enemies, moves) {
  let off = 0; let threat = 0;
  for (const t of enemies) {
    off = Math.max(off, offenseVs(b, c, t, moves));
    threat += offenseVs(b, t, c, squaresInMove(b, t));
  }
  const share = 0.6 * roleWeight(c, 'tank') * roleWeight(c, 'protector') / roleWeight(c, 'striker');
  return off - share * threat;
}

/** The stances that change what c can do beyond the numbers: Offensive and Guarded widen the trade-offs, Grappler helps a hold, Disarming a disarm. */
function special(c, enemies, name) {
  const hurtFoe = enemies.some((t) => t.staggered || t.bruises >= 2);
  const hurt = c.staggered || c.bruises >= 2 || enemies.length > 1;
  if (name === 'Offensive' && hurtFoe && !c.staggered) return 0.12;
  if (name === 'Guarded' && hurt) return 0.12;
  if (name === 'Grappler' && (c.adv['Improved Grab'] || c.adv['Fast Grab'] || c.adv.Chokehold || c.adv['Improved Hold'])) return 0.1;
  if (name === 'Disarming' && enemies.some((t) => t.attacks.some((a) => a.item && a.range === 'close')) && c.adv['Improved Disarm']) return 0.1;
  return 0;
}

/** Hide the stances of foes the fighter has not identified, for the weighing. Returns what to put back. */
function hide(c, enemies) {
  const hidden = [];
  for (const t of enemies) {
    const e = t.stance && !sees(c, t) ? (t.mods || []).find((x) => x.source === 'stance') : null;
    if (e) { hidden.push([t, e.mods]); dropMods(t, 'stance'); }
  }
  return hidden;
}
const unhide = (hidden) => { for (const [t, mods] of hidden) addMods(t, 'stance', 'stance', mods); };

/** Weigh the stance c would hold if it were in `choice`. The fighter is put back as it was. */
function weigh(b, c, choice, enemies, moves) {
  enterStance(c, choice);
  return worth(b, c, enemies, moves) + special(c, enemies, choice.name);
}

/**
 * Declare a close attack disruptive (Disrupt Stance, MA 50) when the foe's stance, which the fighter has identified, gives it a real
 * edge, the contest is not a long shot, and the attack still has 40 percent of its worth with -5 to hit and -2 Damage.
 */
export function wantsDisrupt(b, c, atk, t) {
  if (!c.ma || !t.stance || !atk.roll || atk.area || atk.range !== 'close' || !sees(c, t) || (t.stance.edge || 0) < 2) return false;
  const full = expectedValue(c, atk, t, { b });
  const cut = expectedValue(c, atk, t, { bonusShift: -5, rankShift: -2, b });
  return disruptOdds(c, t) >= 0.5 && cut >= 0.4 * full && cut > 0.1; // the edge it takes away lasts for rounds, the penalty for one attack
}

/**
 * The stance turn: identify the foes' stances (free), then change stance if it pays. Returns the mode left for the rest of the
 * turn (a change from a stance other than Neutral spends the move action).
 */
export function stanceTurn(b, R, c, enemies, mode, rng) {
  if (!c.ma || c.ma.choices.length < 2 || !enemies.length) return mode;
  identifyStances(b, c, enemies, rng);
  if (disruption(c)) return mode; // prone, stunned, vulnerable...: a stance would be broken at once
  const move = assumeAction(c) === 'move';
  if (move && mode !== 'full') return mode;
  const { margin, scores } = scoreStances(b, c, enemies, move);
  const best = scores.filter((s) => s.gain > margin).sort((x, y) => y.gain - x.gain)[0];
  if (!best) return mode;
  assumeStance(b, c, best.choice, rng);
  return move ? 'standard' : mode;
}

/**
 * What each stance the fighter could change to is worth over the one it holds: the weighed gain after the chance the check fails
 * (which leaves it in Neutral), and the margin a gain must beat. `move`: the change takes the move action, so no walking after it.
 */
export function scoreStances(b, c, enemies, move) {
  const hidden = hide(c, enemies);
  const holding = c.ma.choices.find((x) => x.name === stanceName(c)) || c.ma.choices[0];
  const moves = squaresInMove(b, c);
  const here = weigh(b, c, holding, enemies, moves);
  const neutral = weigh(b, c, c.ma.choices[0], enemies, move ? 0 : moves);
  const scores = [];
  for (const choice of c.ma.choices) {
    if (choice.name === holding.name || !stanceUsable(c, choice.def)) continue;
    const p = choice.name === 'Neutral' ? 1 : successOdds(checkBonus(c, choice), assumeDc(c, choice));
    scores.push({ choice, p, gain: p * (weigh(b, c, choice, enemies, move ? 0 : moves) - here) + (1 - p) * (neutral - here) });
  }
  enterStance(c, holding);
  unhide(hidden);
  return { margin: MARGIN + 0.08 * Math.abs(here), here, scores };
}
