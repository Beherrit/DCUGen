// Dying and death (Hero's Handbook p19 Dying, p93 Damage, p73 Diehard, p185 Death and Going for the Kill), only when the
// battle's "Lethal damage" option is on (b.options.lethal). With it off a fighter who would be dying is simply incapacitated.
//
// - Damage that incapacitates a fighter also makes it dying (the "go for the kill" option, p185: a lethal fight is one where
//   attackers are going for the kill). Further Damage on an incapacitated fighter that fails its check makes it dying, and
//   on a dying fighter that fails its check kills it (p93).
// - Gaining the dying condition means a Fortitude check at once (DC 15): a success changes nothing, two degrees of success
//   stabilize it, a failure counts its degrees. Three degrees of failure in all kill it, whether in one check or in three
//   (p19). A dying fighter checks again each round, at its own turn.
// - Diehard stabilizes it on the following round with no check (p73); more damage can still kill it.
// - A stabilized fighter is still incapacitated. A Treatment check (DC 15) or a Healing check stabilizes a dying ally.
// - Minions are simply killed by a taken-out result (p185: "none of this applies to minions").
// - Debilitated Stamina means dying with a -5 on the Fortitude checks (p49): see debilitated.js.

import { log, sign, rngFor } from './util.js';
import { rollCheck, critNote } from './checks.js';
import { resistOf } from './conditions.js';
import { plainFx } from './fortune.js';
import { stabilizePenalty, debilitated } from './debilitated.js';
import { noteDeath } from './immortality.js';

export const lethalOn = (b) => !!b.options?.lethal;
export const DYING_DC = 15;
const DEATH_DEGREES = 3;

/** Who is dying and not yet stable, in a lethal fight. */
export const dyingNow = (b) => lethalOn(b) && b.combatants.some((c) => c.dying && !c.dead);

/** The fight cannot end while a dying fighter is still rolling (the round limit still ends it). */
export const deathsPending = (b) => dyingNow(b) && b.round <= (b.options.maxRounds || Infinity);

const bonusOf = (c) => {
  const f = resistOf(c, 'Fortitude');
  return f === null ? null : f - stabilizePenalty(c);
};

/** The fighter dies. */
export function kill(b, c, why = 'dies') {
  c.dead = true; c.dying = false; c.stable = false; c.out = true; c.outReason = 'dead';
  log(b, { kind: 'ko', actor: c.id, text: `${c.name} ${why}.`, important: true });
  noteDeath(b, c); // Immortality: it may come back (immortality.js)
}

/** The fighter stops dying and lies there incapacitated. */
export function stabilize(b, c, how) {
  c.dying = false; c.stable = true; c.diehard = false;
  log(b, { kind: 'recover', actor: c.id, text: `${c.name} stabilizes${how ? ` ${how}` : ''}: still incapacitated, no longer dying.`, important: true });
}

/** One Fortitude check against dying (DC 15), and what it does. */
function dyingCheck(b, c, rng) {
  const bonus = bonusOf(c);
  if (bonus === null) { stabilize(b, c, '(it has no Fortitude to fail)'); return; }
  const r = rollCheck(rng, bonus, DYING_DC, plainFx(b, c, 'dying check', () => true));
  const base = `${c.name} is dying: Fortitude d20 ${r.roll} ${sign(bonus)} = ${r.total} vs DC ${DYING_DC}${critNote(r, { degrees: true })}`;
  const dice = [{ label: 'Dying check', roll: r.roll, mod: bonus, total: r.total, dc: DYING_DC }];
  if (r.success && r.degrees >= 2) { log(b, { kind: 'resist', actor: c.id, text: `${base} — ${r.degrees} degrees of success.`, dice }); stabilize(b, c, 'on the check'); return; }
  if (r.success) { log(b, { kind: 'resist', actor: c.id, text: `${base} — holds on, still dying.`, dice }); return; }
  c.dyingFails = (c.dyingFails || 0) + r.fails;
  log(b, { kind: 'condition', actor: c.id, text: `${base} — ${r.fails} degree${r.fails > 1 ? 's' : ''} of failure (${c.dyingFails} of ${DEATH_DEGREES} in all).`, dice, important: true });
  if (c.dyingFails >= DEATH_DEGREES) kill(b, c, 'dies of the wounds');
}

/** The fighter becomes dying: it checks at once, unless Diehard (it stabilizes on the following round). */
export function startDying(b, c, rng = null) {
  if (!lethalOn(b) || c.dead || c.dying) return;
  c.dying = true; c.stable = false; c.dyingFails = 0; c.dyingRound = b.round;
  log(b, { kind: 'ko', actor: c.id, text: `${c.name} is DYING (incapacitated and near death).`, important: true });
  if (c.adv?.Diehard) { c.diehard = true; log(b, { kind: 'note', actor: c.id, text: `${c.name} has Diehard: it will stabilize on the following round with no check.` }); return; }
  dyingCheck(b, c, rng || rngFor(b));
}

/** A dying fighter's turn: Diehard stabilizes it, otherwise it rolls its check for the round. */
export function dyingTurn(b, c, rng) {
  if (!c.dying || c.dead || c.dyingRound === b.round) return;
  if (c.diehard) { stabilize(b, c, '(Diehard)'); return; }
  dyingCheck(b, c, rng);
}

/**
 * Damage that failed its resistance check lands on a fighter who is already out (an area, a collision, a finishing blow):
 * an incapacitated fighter starts dying, a dying one dies (p93). Returns true when this rule dealt with the hit.
 */
export function downedHit(b, t, rng = null) {
  if (!lethalOn(b) || !t.out || t.dead || t.outReason === 'asleep') return false;
  if (t.dying) kill(b, t, 'is killed by the further damage');
  else startDying(b, t, rng);
  return true;
}

/** A minion taken out in a lethal fight is killed. */
export function minionKilled(b, t) {
  if (lethalOn(b) && t.minion && t.out && !t.dead) kill(b, t, 'is killed (a minion taken out)');
}

/** Incapacitated by Damage in a lethal fight: the attacker went for the kill. */
export function incapacitatedByDamage(b, t, rng = null) {
  if (!lethalOn(b) || t.dead || t.minion || t.outReason === 'asleep') return;
  startDying(b, t, rng);
}

/** The best way c has to steady a dying ally: Treatment (DC 15, p67) or a Healing power (a DC 10 check, p103). { name, bonus, dc } or null. */
export function medicOf(c) {
  const ways = [];
  if (typeof c.skills?.Treatment === 'number') ways.push({ name: 'Treatment', bonus: c.skills.Treatment, dc: 15 });
  if (c.healing) ways.push({ name: c.healing.name, bonus: c.healing.rank, dc: 10 });
  ways.sort((x, y) => (y.bonus - y.dc) - (x.bonus - x.dc));
  return ways[0] || null;
}

/** The chance (0 to 1) that a medic steadies a dying fighter with one check. */
export const steadyChance = (way) => Math.max(0, Math.min(1, (21 - (way.dc - way.bonus)) / 20));

/** A standard action to steady a dying fighter: one success stabilizes it (a reading of "the highest degree of success stabilizes", p103). */
export function steady(b, c, patient, rng) {
  const way = medicOf(c);
  if (!way || !patient.dying || patient.dead) return false;
  const bonus = way.bonus - (c.fatigue >= 2 ? 2 : 0);
  const r = rollCheck(rng, bonus, way.dc, plainFx(b, c, `${way.name} check`, () => true));
  const text = `${c.name} tries to save ${patient.name} with ${way.name}: d20 ${r.roll} ${sign(bonus)} = ${r.total} vs DC ${way.dc}${critNote(r)}`;
  log(b, { kind: r.success ? 'heal' : 'miss', actor: c.id, target: patient.id, text: `${text} — ${r.success ? 'stabilized' : 'no luck'}.`, dice: [{ label: way.name, roll: r.roll, mod: bonus, total: r.total, dc: way.dc }], important: r.success });
  if (r.success) stabilize(b, patient, `(${way.name} by ${c.name})`);
  return true;
}

/** Weaken took Stamina below -5 (p49): the fighter is dying in a lethal fight, and simply incapacitated in any other. */
export function staminaGone(b, t, rng = null) {
  if (t.out || t.fled || !debilitated(t).Stamina) return;
  t.out = true; t.outReason = 'debilitated';
  log(b, { kind: 'ko', actor: t.id, text: `${t.name}'s Stamina is debilitated (below -5): ${lethalOn(b) ? 'dying' : 'incapacitated'}.`, important: true });
  startDying(b, t, rng);
}

/** The names of the fighters who died, for the closing line of the log. */
export const deadNames = (b) => b.combatants.filter((c) => c.dead).map((c) => c.name);
