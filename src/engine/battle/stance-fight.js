// A fighter's stance in the fight (Martial Arts 3e, pp 128-131 and the Assume Stance skill use, p49). Everyone starts in Neutral.
// Assuming another stance is a Close Combat (or Ranged Combat): Fighting Style check against the stance's DC: a free action from
// Neutral, a move action otherwise; failing it leaves the fighter in Neutral. The stance is held until it is changed or disrupted:
// the asleep, defenseless, immobile, incapacitated, paralyzed, prone, stunned and vulnerable conditions break it. The stance's own
// conditions (Crane is immobile, Grounded vulnerable) do not break it. What a held stance changes is in stance-build.js and is kept
// as one entry of mods.js (source 'stance'), so a rebuilt fighter keeps it.

import { log, sign } from './util.js';
import { rollCheck } from './checks.js';
import { activeConditions, checkPenalty } from './conditions.js';
import { addMods, dropMods } from './mods.js';
import { stanceMods, stanceEdge } from './stance-build.js';
import { styleOfStance } from './martial-read.js';
import { DISRUPTING } from '../martial/stance.js';
import { attackMod } from '../martial/stance-mods.js';

export const SOURCE = 'stance';

/** The stance the fighter holds right now ('Neutral' when none). */
export const stanceName = (c) => c.stance?.name || 'Neutral';

/** The fighter's stance choices other than the one it is in, each with its DC and check (martial-read.js). */
export const choiceFor = (c, name) => c.ma?.choices.find((x) => x.name === name) || null;

/** The stance's DC for this fighter: Flowing Form takes 5 off (MA 76), Deceptive Stance adds 2 a rank (MA 74). */
export function assumeDc(c, choice) {
  if (choice.name === 'Neutral') return 0;
  return Math.max(1, choice.dc - (c.ma.flowing ? 5 : 0) + 2 * (c.ma.deceptive || 0));
}

/** The bonus on the check: the style's skill, less what the fighter is suffering, and the Disruptive stance's -4 to other style checks (MA 129). */
export function checkBonus(c, choice) {
  return choice.bonus - checkPenalty(c) + styleCheckMod(c);
}

/** The Disruptive stance's -4 on every Fighting Style check but a disrupt (MA 129); the +8 on a disrupt is added in stance-contest.js. */
export const styleCheckMod = (c) => (stanceName(c) === 'Disruptive' ? -4 : 0);

/** Flowing Form makes every change of stance a free action (MA 76); otherwise it is free only from Neutral. */
export const assumeAction = (c) => (c.ma?.flowing || stanceName(c) === 'Neutral' ? 'free' : 'move');

/**
 * What the held stance adds to a grab ("Grab") or a disarm ("Disarm") check beyond what it did to the fighter's attack check:
 * the stance's bonus for that kind of attack, less the general change already in the unarmed attack the check is built on.
 */
export function stanceBonus(c, kind) {
  const def = c.stance ? choiceFor(c, c.stance.name)?.def : null;
  if (!def) return 0;
  const general = c.attacks.find((a) => a.unarmed)?.bn?.[`${def.name} stance`] || 0;
  return attackMod(def, { name: kind, kind: 'close' }, 'attack') - general;
}

/** The most a fighter may take on All-out Attack or Defensive Attack: 2, or 5 with the advantage; the Offensive and Guarded stances give 5 and 10 (MA 130). */
export function tradeCap(c, name) {
  const s = stanceName(c);
  const own = (s === 'Offensive' && name === 'All-out Attack') || (s === 'Guarded' && name === 'Defensive Attack');
  return own ? (c.adv[name] ? 10 : 5) : (c.adv[name] ? 5 : 2);
}

/** Put the fighter in a stance (no check; the caller made it). */
export function enterStance(c, choice) {
  dropMods(c, SOURCE);
  c.stance = null; c.stanceFlags = [];
  if (choice.name === 'Neutral') return;
  const style = styleOfStance(c.ma, choice.name);
  const preferred = !!style && style.rank >= 1 && c.ma.preferred.includes(choice.name.toLowerCase());
  addMods(c, SOURCE, 'stance', stanceMods(c, choice, style, preferred));
  c.stance = { name: choice.name, style: choice.style, edge: stanceEdge(choice.def) };
}

/** Back to Neutral, for a reason in plain words. */
export function leaveStance(b, c, why) {
  const was = stanceName(c);
  enterStance(c, { name: 'Neutral' });
  dropMods(c, 'bobweave'); // Bob and Weave is lost when the stance changes (MA 74)
  if (was !== 'Neutral') log(b, { kind: 'note', actor: c.id, text: `${c.name}'s ${was} stance is broken (${why}): back to Neutral.` });
}

/** A condition the fighter does not owe to its own stance that breaks a stance, or null. */
export function disruption(c) {
  if (c.out) return 'incapacitated';
  const s = activeConditions(c, true);
  const hit = DISRUPTING.find((n) => s.has(n));
  return hit ? hit.toLowerCase() : null;
}

/** Drop the stance of anyone a condition has broken it for. Call after anything that can change conditions. */
export function stanceUpkeep(b) {
  for (const c of b.combatants) {
    if (!c.stance) continue;
    const why = disruption(c);
    if (why) leaveStance(b, c, why);
  }
}

/** The check's text for the log, "Close Combat: Kung Fu d20 14 +12 = 26 vs DC 18". */
export function checkText(c, choice, roll, bonus, total, dc) {
  const st = styleOfStance(c.ma, choice.name);
  return `${st?.skill?.name || 'Close Combat'}: ${choice.style} d20 ${roll} ${sign(bonus)} = ${total} vs DC ${dc}`;
}

/**
 * Make the Assume Stance check and settle it. A Master may re-roll once per style it has mastered (MA 78, taken as once a fight here).
 * Returns { ok }. Neutral needs no check. The caller has already counted the action.
 */
export function assumeStance(b, c, choice, rng) {
  dropMods(c, 'bobweave'); // Bob and Weave is lost when the stance changes (MA 74)
  if (choice.name === 'Neutral') { enterStance(c, choice); log(b, { kind: 'note', actor: c.id, text: `${c.name} drops back to Neutral stance.` }); return { ok: true }; }
  const dc = assumeDc(c, choice);
  const bonus = checkBonus(c, choice);
  let r = rollCheck(rng, bonus, dc);
  let text = checkText(c, choice, r.roll, bonus, r.total, dc);
  if (!r.success && (c.rerollsUsed || 0) < (c.ma.rerolls || 0)) {
    c.rerollsUsed = (c.rerollsUsed || 0) + 1;
    const again = rollCheck(rng, bonus, dc);
    text += `; Master re-roll d20 ${again.roll} = ${again.total}`;
    if (again.total > r.total) r = again;
  }
  if (r.success) {
    enterStance(c, choice);
    log(b, { kind: 'note', actor: c.id, text: `${c.name} shifts into ${choice.name} stance (${text}).` });
    return { ok: true };
  }
  enterStance(c, { name: 'Neutral' });
  log(b, { kind: 'note', actor: c.id, text: `${c.name} fails to settle into ${choice.name} stance (${text}) and is in Neutral.` });
  return { ok: false };
}
