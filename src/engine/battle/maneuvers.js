// Combat maneuvers: feint, grab, escape, and letting go.

import { sign, d20, log, byId, enemiesOf } from './util.js';
import { activeConditions, checkPenalty, defenseOf } from './conditions.js';
import { expectedValue } from './odds.js';
import { inReach } from './geometry.js';
import { rollCheck, opposedCheck, opposedNote, critNote } from './checks.js';
import { tacticOf } from './tactics-list.js';
import { plainFx, hurt } from './fortune.js';
import { feintPick, setUpAllies } from './tricks.js';
import { interactionImmune, slipsHold } from './immunity.js';
import { formWords } from './insubstantial.js';

export function feint(b, c, t, rng) {
  if (interactionImmune(t)) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} tries to feint ${t.name}, but ${t.name} is immune to interaction skills: it fails.` }); return; }
  const { name, mine, theirs } = feintPick(c, t);
  const flank = tacticOf(b, c) === 'flank';
  const duel = opposedCheck(rng, { bonus: mine, fx: plainFx(b, c, 'feint check', () => flank) }, { bonus: theirs, fx: plainFx(b, t, 'feint resistance', () => hurt(t)) });
  const [r1, r2] = duel.rolls;
  const ok = duel.winner === 'a';
  // Vulnerable against the feinter's next attack, until the end of the feinter's next round (DCA 64). With Set-up
  // (p78) the feinter hands it to allies instead, and the target is vulnerable to theirs.
  const gift = ok ? setUpAllies(b, c, t) : [];
  if (ok) t.feinted = gift.length ? { by: c.id, round: b.round, for: gift.map((a) => a.id) } : { by: c.id, round: b.round };
  const how = name === 'Deception' ? '' : name === 'Acrobatics' ? 'with acrobatics' : 'with intimidation (Startle)';
  const against = name === 'Intimidation' ? 'Insight, Intimidation or Will' : 'Insight';
  const result = gift.length ? `${t.name} falls for it and is vulnerable to ${gift.map((a) => `${a.name}'s`).join(' and ')} next attack (Set-up)` : `${t.name} falls for it and is vulnerable to the next attack`;
  log(b, { kind: ok ? 'condition' : 'miss', actor: c.id, target: t.id, text: `${c.name} feints ${how}: ${name} d20 ${r1} ${sign(mine)} = ${duel.totals.a} vs ${t.name}'s ${against} d20 ${r2} ${sign(theirs)} = ${duel.totals.b} — ${ok ? result : 'not fooled'}${opposedNote(duel)}.`, dice: [{ label: 'Feint', roll: r1, mod: mine, total: duel.totals.a, dc: duel.totals.b }] });
}

/** The ability a hold is made with: Strength, or Dexterity with Grabbing Finesse (p75). */
export const gripOf = (c) => c.d.abilities[c.adv['Grabbing Finesse'] ? 'Dexterity' : 'Strength'] ?? 0;

/**
 * How keen the AI is to grab, as a share of its usual chance. A grabber is hindered and vulnerable while it holds
 * (p176) unless it has Improved Grab or Grabbing Finesse, which is a poor bargain with other foes about.
 */
export function grabAppetite(b, c, t) {
  if (c.adv['Improved Grab'] || c.adv['Grabbing Finesse']) return 1;
  const others = enemiesOf(b, c).filter((e) => e !== t).length;
  return others === 0 ? 0.8 : others === 1 ? 0.5 : 0.3;
}

export function grab(b, R, c, t, rng, { free = false } = {}) {
  if (slipsHold(t)) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} tries to grab ${t.name}, but ${t.name} ${t.insub ? `is in ${formWords(t.insub)} and flows out of any hold` : 'is immune to entrapment'}: no hold.` }); return; }
  const str = gripOf(c);
  if (!free) {
    const dc = 10 + defenseOf(t, 'Parry');
    const bonus = (c.attacks.find((a) => a.unarmed)?.bonus ?? c.d.abilities.Fighting ?? 0) - checkPenalty(c) + (c.limbBonus || 0); // all the limbs on the grab: +1 a rank of Extra Limbs, to +5 (p98)
    const roll = d20(rng); const total = roll + bonus;
    if (!(roll === 20 || (roll !== 1 && total >= dc))) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} tries to grab ${t.name}: d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc} — ${t.name} slips away.`, dice: [{ label: 'Grab', roll, mod: bonus, total, dc }] }); return; }
    log(b, { kind: 'hit', actor: c.id, target: t.id, text: `${c.name} grabs at ${t.name}: d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc} — got a hold.`, dice: [{ label: 'Grab', roll, mod: bonus, total, dc }] });
  }
  const resist = Math.max(defenseOf(t, 'Dodge'), t.d.abilities.Strength ?? 0) - checkPenalty(t);
  const dc = 10 + str + (c.adv['Improved Hold'] ? 5 : 0);
  const r = rollCheck(rng, resist, dc, plainFx(b, t, 'grab resistance'));
  const { roll, total, fails } = r;
  const dice = [{ label: 'Resist grab', roll, mod: resist, total, dc }];
  if (!fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} resists the hold: d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc}${critNote(r)} — breaks free.`, dice }); return; }
  t.grabbedBy = c.id; c.holding = t.id;
  if (c.limbDistract) c.distracted = true; // Distracting Extra Limbs: vulnerable while the limbs are busy
  t.conditions = t.conditions.filter((x) => x.source !== 'grab');
  if (fails >= 2) t.conditions.push({ name: 'Bound', degree: 2, from: c.id, source: 'grab', label: 'held', tiers: [['Restrained'], ['Bound']] });
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${t.name} fails to resist (d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc}, ${fails} degree${fails > 1 ? 's' : ''}${critNote(r)}): ${fails >= 2 ? 'BOUND — defenseless and immobile' : 'RESTRAINED — hindered and vulnerable'} in ${c.name}'s grip.`, dice, important: true });
}

export function tryEscape(b, c, holder, rng) {
  const bound = activeConditions(c).has('Bound');
  // Restrained but able to hit the one holding them: fight on instead (still immobile and vulnerable)
  if (!bound && inReach(b, c, holder) && c.attacks.some((a) => expectedValue(c, a, holder) > 0.15)) return false;
  // Escape (DCA 176): Athletics or Sleight of Hand against the hold
  const mine = Math.max(c.skills.Athletics, c.skills['Sleight of Hand'] ?? -99) - checkPenalty(c);
  const dc = 10 + gripOf(holder) + (holder.adv['Improved Hold'] ? 5 : 0);
  const r = rollCheck(rng, mine, dc, plainFx(b, c, 'escape check'));
  const { roll, total } = r;
  const ok = r.success;
  if (ok) { c.grabbedBy = null; holder.holding = null; c.conditions = c.conditions.filter((x) => x.source !== 'grab'); }
  log(b, { kind: ok ? 'recover' : 'miss', actor: c.id, target: holder.id, text: `${c.name} struggles to escape ${holder.name}'s hold: d20 ${roll} ${sign(mine)} = ${total} vs DC ${dc}${critNote(r)} — ${ok ? 'breaks free!' : 'still held'}.`, dice: [{ label: 'Escape', roll, mod: mine, total, dc }] });
  return true;
}

export function releaseHolds(b, t) {
  if (t.holding) { const v = byId(b, t.holding); if (v) { v.grabbedBy = null; v.conditions = v.conditions.filter((x) => x.source !== 'grab'); } t.holding = null; }
  if (t.grabbedBy) { const h = byId(b, t.grabbedBy); if (h) h.holding = null; t.grabbedBy = null; }
}
