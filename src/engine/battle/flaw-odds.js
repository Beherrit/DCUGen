// What a flaw is worth to the AI: the ranks it takes off an attack, and the share of an attack's value that is left once
// the flaw has had its say (an Unreliable attack works half the time, a Tiring one costs fatigue, an Activation one costs
// an action first...). The multipliers are the AI's own judgement, not rules; the rules themselves are in flaw-gate.js,
// flaw-effects.js and flaw-turn.js. This file imports nothing from odds.js, which calls it.

import { activeConditions } from './conditions.js';
import { limitBlock, dulledNow } from './flaw-limits.js';
import { flawKey } from './flaws.js';
import { fortuneOn } from './points.js';
import { slipsHold } from './immunity.js';
import { d20 } from './util.js';

/** The ranks a flaw takes off this use of the attack: Fades (what has faded) and Dulled while its condition holds. */
export function flawRankLoss(b, c, atk, t) {
  const f = atk.flaws;
  if (!f) return 0;
  let loss = f.fades ? c.flaw?.faded[flawKey(atk)] || 0 : 0;
  if (f.dulled && dulledNow(f.dulled, { b, c, t })) loss += f.dulled.ranks;
  return loss;
}

/** The check bonus a Check Required effect rolls: the skill named in the flaw's detail, else the attack's own bonus. */
export function checkBonusOf(c, atk) {
  const text = String(atk.flaws?.check?.skill || '').toLowerCase();
  if (text) {
    const skills = (c.d.skills || []).filter((s) => text.includes(String(s.name).toLowerCase()));
    if (skills.length) return Math.max(...skills.map((s) => s.bonus));
    const ability = Object.keys(c.d.abilities).find((a) => text.includes(a.toLowerCase()));
    if (ability) return c.d.abilities[ability] ?? 0;
  }
  return atk.bonus ?? Math.max(c.d.abilities.Dexterity ?? 0, c.d.abilities.Fighting ?? 0);
}

/** The share of the effect's ranks a Check Required roll gives, over all twenty rolls (a natural 1 fails; one rank per point over the DC). */
function checkShare(c, atk, rank) {
  const dc = 10 + atk.flaws.check.ranks;
  const bonus = checkBonusOf(c, atk);
  let sum = 0;
  for (let r = 1; r <= 20; r++) sum += r === 1 ? 0 : Math.min(rank, Math.max(0, r + bonus - dc)) / Math.max(1, rank);
  return sum / 20;
}

/** Can the target not use this sense at all (blind for sight, deaf for hearing)? Such a target is immune to a Sense-Dependent effect (DCA 137). */
export function cannotPerceive(t, sense) {
  const cond = activeConditions(t);
  return (sense === 'sight' && (cond.has('Blinded') || cond.has('Blind'))) || (sense === 'hearing' && cond.has('Deaf'));
}

/** The share of Sense-Dependent attacks that get through: a target that cannot perceive is immune, and the rest may dodge. */
function senseShare(atk, t) {
  if (cannotPerceive(t, atk.flaws.sense.word)) return 0;
  const dodge = (t.d.defenses?.Dodge ?? 0) - (t.weakened?.Dodge || 0);
  const dc = (atk.effect === 'Damage' ? 15 : 10) + atk.rank;
  const averts = Math.min(0.95, Math.max(0.05, (21 - (dc - dodge)) / 20));
  return 1 - averts;
}

/** The odds of each degree of failure when the target makes two checks and the better stands (Resistible): the chance of at least i degrees is the product. */
export function betterOf(d1, d2) {
  const tail = (d) => d.map((_, i) => d.slice(i).reduce((s, x) => s + x, 0));
  const t1 = tail(d1); const t2 = tail(d2);
  return d1.map((_, i) => t1[i] * t2[i] - (i + 1 < d1.length ? t1[i + 1] * t2[i + 1] : 0));
}

const heroOn = (b) => !!b && fortuneOn(b);

/** Can c use this attack on t at all right now, given its flaws? false for a limit that is not met, a chain not ready, spent ranks or uses. */
export function flawUsable(b, c, atk, t) {
  const f = atk.flaws;
  if (!f) return true;
  if (f.uncontrolled) return false;
  if (limitBlock(f.limited, { b, c, t })) return false;
  if (f.chained && b && !chainReady(c, atk, b.round)) return false;
  if (f.fades && (c.flaw?.faded[flawKey(atk)] || 0) >= atk.rank) return false;
  if (f.unreliable?.uses != null && (c.flaw?.uses[flawKey(atk)] || 0) >= f.unreliable.uses) return false;
  if (f.gallant && heroOn(b) && !(c.heroPoints > 0)) return false;
  if (f.tiring && c.fatigue >= 2) return false;
  if (f.grab && slipsHold(t)) return false;
  return true;
}

/** Is the power a Chained attack hangs on done: used with success in the fighter's previous turn? An unnamed or unknown prerequisite counts as done. */
export function chainReady(c, atk, round) {
  const need = String(atk.flaws?.chained || '').trim().toLowerCase();
  if (!need) return true;
  const pre = (c.attacks || []).find((a) => a !== atk && flawKey(a).toLowerCase() === need);
  if (!pre) return true;
  return c.flaw?.done[flawKey(pre)] === round - 1;
}

/** The multiplier on an attack's expected value for its flaws (0 when it cannot be used). */
export function flawFactor(b, c, atk, t) {
  const f = atk.flaws;
  if (!f) return 1;
  if (!flawUsable(b, c, atk, t)) return 0;
  const st = c.flaw || { on: {} };
  let m = 1;
  if (f.activation && !st.on[flawKey(atk)]) m *= f.activation === 2 ? 0.5 : 0.85;
  if (f.unreliable) m *= f.unreliable.uses != null ? 0.85 : 0.5;
  if (f.check) m *= checkShare(c, atk, atk.rank);
  if (f.tiring) m *= c.fatigue ? 0.7 : 0.85;
  if (f.gallant && heroOn(b)) m *= 0.9;
  if (f.sideEffect) m *= f.sideEffect === 'always' ? 0.6 : 0.8;
  if (f.distracting) m *= 0.9;
  if (f.increased) m *= 0.9;
  if (f.immobile) m *= f.immobile === 2 ? 0.85 : 0.95;
  if (f.momentum && !c.squaresMoved) m *= 0.85; // the fighter runs first (flaw-turn.js), which costs it the choice of where to stand
  if (f.inexact && atk.area) m *= 0.75;
  if (f.grab) m *= c.holding === t.id ? 0.95 : 0.7; // the grab can fail, but a hold also leaves the target restrained
  if (f.sense) m *= senseShare(atk, t);
  return m;
}

/**
 * Bad Bounce (MA 94): the attack check DC for each bounce of a Ricochet effect, 10 against an immobile surface (otherwise 10
 * plus the defense), and 2 more for each earlier bounce. The Ricochet extra is not simulated yet, so nothing calls this.
 */
export const bounceDc = (defense, previous, immobile = false) => (immobile ? 10 : 10 + defense) + 2 * previous;

/** A Check Required roll for the log and the gate: { roll, total, dc, ranks } where ranks is how many ranks the effect gets (0 fails). */
export function rollCheckRequired(rng, c, atk) {
  const dc = 10 + atk.flaws.check.ranks;
  const bonus = checkBonusOf(c, atk);
  const roll = d20(rng);
  const total = roll + bonus;
  const ranks = roll === 1 ? 0 : Math.min(atk.rank, Math.max(0, total - dc));
  return { roll, bonus, total, dc, ranks };
}
