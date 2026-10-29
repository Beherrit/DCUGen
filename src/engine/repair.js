// Repairs hand-built (Lab) powers so attack effects count as attacks and roll with the right combat skill.

import { attackKind } from './derive.js';

const QUIET = ['utility', 'movement', 'defense'];
const COMBAT_SKILL = { close: 'Close Combat', ranged: 'Ranged Combat' };
// Specialties the sheet hands out by default, not the name of any one attack.
const GENERIC_SPECS = ['Unarmed', 'General'];

/** True when the named effect is an attack effect. */
export function isAttackEffect(effectName, R) {
  const eff = R.effect(effectName);
  return eff.attack === true || eff.type === 'Attack';
}

/** The role a Lab-built power should carry. */
export function roleForPower(p, R) {
  const attack = isAttackEffect(p.effect, R);
  if (attack && (!p.role || QUIET.includes(p.role))) return 'attack';
  if (!attack && p.role === 'attack') return 'utility';
  return p.role || 'utility';
}

function eachPower(ch, fn) {
  const visit = (p) => { if (!p) return; fn(p); (p.alternates || []).forEach(visit); (p.linked || []).forEach(visit); };
  (ch.powers || []).forEach(visit);
  for (const d of ch.devices || []) (d?.powers || []).forEach(visit);
}

function fixRole(p, R) {
  if (p.id || p.role !== 'utility') return;
  let attack = false;
  try { attack = isAttackEffect(p.effect, R); } catch { /* unknown effect: leave it */ }
  if (attack) p.role = 'attack';
}

/**
 * A hand-built attack with no specialty of its own name takes the character's one unclaimed Close or
 * Ranged Combat specialty (DCA 57, 63: each is bought per weapon or power, "Throwing" covers thrown things).
 * Two or more candidates, or one already named after another attack, are left for the Lab's picker.
 */
function linkLoneSpecialty(ch, p, R, claimed) {
  if (p.id || p.attackSkill || p.role !== 'attack') return;
  let skill = null;
  try { skill = COMBAT_SKILL[attackKind(p, R)]; } catch { return; }
  if (!skill) return;
  const specs = (ch.skills || []).filter((s) => s.name === skill && s.spec && !GENERIC_SPECS.includes(s.spec));
  if (specs.some((s) => s.spec === p.name)) return;
  const free = specs.filter((s) => !claimed.has(s.spec));
  if (free.length === 1) p.attackSkill = free[0].spec;
}

function repairOne(ch, R) {
  if (!ch) return;
  const claimed = new Set((ch.equipment || []).map((e) => e.name));
  eachPower(ch, (p) => { claimed.add(p.name); if (p.attackSkill) claimed.add(p.attackSkill); });
  eachPower(ch, (p) => { fixRole(p, R); linkLoneSpecialty(ch, p, R, claimed); });
}

/** Turn hand-built attack powers stuck on the utility role into attacks (mutates and returns ch). */
export function repairPowerRoles(ch, R) {
  if (!ch) return ch;
  repairOne(ch, R);
  repairOne(ch.advancement?.snapshot, R);
  return ch;
}
