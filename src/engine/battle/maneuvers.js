// Combat maneuvers: feint, grab, escape, and letting go.

import { sign, d20, log, byId } from './util.js';
import { activeConditions, checkPenalty, defenseOf } from './conditions.js';
import { expectedValue } from './odds.js';

export function feint(b, c, t, rng) {
  const useAcro = c.adv['Agile Feint'] && c.skills.Acrobatics > c.skills.Deception;
  const mine = useAcro ? c.skills.Acrobatics : c.skills.Deception;
  const theirs = Math.max(t.skills.Insight, t.skills.Deception);
  const r1 = d20(rng); const r2 = d20(rng);
  const ok = r1 + mine > r2 + theirs || r1 === 20;
  if (ok) t.feinted = true;
  log(b, { kind: ok ? 'condition' : 'miss', actor: c.id, target: t.id, text: `${c.name} feints ${useAcro ? 'with acrobatics' : ''}: ${useAcro ? 'Acrobatics' : 'Deception'} d20 ${r1} ${sign(mine)} = ${r1 + mine} vs ${t.name}'s Insight d20 ${r2} ${sign(theirs)} = ${r2 + theirs} — ${ok ? `${t.name} falls for it and is vulnerable to the next attack` : 'not fooled'}.`, dice: [{ label: 'Feint', roll: r1, mod: mine, total: r1 + mine, dc: r2 + theirs }] });
}

export function grab(b, R, c, t, rng, { free = false } = {}) {
  const str = c.d.abilities.Strength ?? 0;
  if (!free) {
    const dc = 10 + defenseOf(t, 'Parry');
    const bonus = (c.attacks.find((a) => a.unarmed)?.bonus ?? c.d.abilities.Fighting ?? 0) - checkPenalty(c);
    const roll = d20(rng); const total = roll + bonus;
    if (!(roll === 20 || (roll !== 1 && total >= dc))) { log(b, { kind: 'miss', actor: c.id, target: t.id, text: `${c.name} tries to grab ${t.name}: d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc} — ${t.name} slips away.`, dice: [{ label: 'Grab', roll, mod: bonus, total, dc }] }); return; }
    log(b, { kind: 'hit', actor: c.id, target: t.id, text: `${c.name} grabs at ${t.name}: d20 ${roll} ${sign(bonus)} = ${total} vs Parry DC ${dc} — got a hold.`, dice: [{ label: 'Grab', roll, mod: bonus, total, dc }] });
  }
  const resist = Math.max(defenseOf(t, 'Dodge'), t.d.abilities.Strength ?? 0) - checkPenalty(t);
  const dc = 10 + str + (c.adv['Improved Hold'] ? 5 : 0);
  const roll = d20(rng); const total = roll + resist;
  let fails = total >= dc ? 0 : 1 + Math.floor((dc - total - 1) / 5);
  if (roll === 20) fails = Math.max(0, fails - 1);
  if (!fails) { log(b, { kind: 'resist', actor: c.id, target: t.id, text: `${t.name} resists the hold: d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc} — breaks free.`, dice: [{ label: 'Resist grab', roll, mod: resist, total, dc }] }); return; }
  t.grabbedBy = c.id; c.holding = t.id;
  t.conditions = t.conditions.filter((x) => x.source !== 'grab');
  if (fails >= 2) t.conditions.push({ name: 'Bound', degree: 2, from: c.id, source: 'grab', label: 'held', tiers: [['Restrained'], ['Bound']] });
  log(b, { kind: 'condition', actor: c.id, target: t.id, text: `${t.name} fails to resist (d20 ${roll} ${sign(resist)} = ${total} vs DC ${dc}, ${fails} degree${fails > 1 ? 's' : ''}): ${fails >= 2 ? 'BOUND — defenseless and immobile' : 'RESTRAINED — hindered and vulnerable'} in ${c.name}'s grip.`, dice: [{ label: 'Resist grab', roll, mod: resist, total, dc }], important: true });
}

export function tryEscape(b, c, holder, rng) {
  const bound = activeConditions(c).has('Bound');
  // Restrained but able to hit the one holding them: fight on instead (still immobile and vulnerable)
  if (!bound && holder.pos === c.pos && c.attacks.some((a) => expectedValue(c, a, holder) > 0.15)) return false;
  // Escape (DCA 176): Athletics or Sleight of Hand against the hold
  const mine = Math.max(c.skills.Athletics, c.skills['Sleight of Hand'] ?? -99) - checkPenalty(c);
  const dc = 10 + (holder.d.abilities.Strength ?? 0) + (holder.adv['Improved Hold'] ? 5 : 0);
  const roll = d20(rng); const total = roll + mine;
  const ok = roll === 20 || total >= dc;
  if (ok) { c.grabbedBy = null; holder.holding = null; c.conditions = c.conditions.filter((x) => x.source !== 'grab'); }
  log(b, { kind: ok ? 'recover' : 'miss', actor: c.id, target: holder.id, text: `${c.name} struggles to escape ${holder.name}'s hold: d20 ${roll} ${sign(mine)} = ${total} vs DC ${dc} — ${ok ? 'breaks free!' : 'still held'}.`, dice: [{ label: 'Escape', roll, mod: mine, total, dc }] });
  return true;
}

export function releaseHolds(b, t) {
  if (t.holding) { const v = byId(b, t.holding); if (v) { v.grabbedBy = null; v.conditions = v.conditions.filter((x) => x.source !== 'grab'); } t.holding = null; }
  if (t.grabbedBy) { const h = byId(b, t.grabbedBy); if (h) h.holding = null; t.grabbedBy = null; }
}
