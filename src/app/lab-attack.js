// Power Lab: pick which combat specialty an attack power uses, and keep its role honest.

import { h } from './dom.js';
import { attackKind, attacks } from '../engine/derive.js';
import { isAttackEffect, roleForPower } from '../engine/repair.js';

/** Set the power's role from its effect (attacks become attacks) and return it. */
export function stampRole(p, R) {
  p.role = roleForPower(p, R);
  return p;
}

function bonusHint(p, ch, R, skillName) {
  try {
    const probe = { ...ch, powers: [{ ...p, role: 'attack', alternates: [] }] };
    const row = attacks(probe, R).find((a) => a.power);
    if (row?.bonus == null) return null;
    return h('small', { class: 'hint' }, `Attack bonus with ${skillName}: ${row.bonus >= 0 ? '+' : ''}${row.bonus}`);
  } catch {
    return null;
  }
}

/** A select for the Close or Ranged Combat specialty this attack uses, or null when it does not apply. */
export function attackSkillField(p, ch, R, update) {
  if (!ch || !isAttackEffect(p.effect, R)) return null;
  const kind = attackKind(p, R);
  if (kind !== 'close' && kind !== 'ranged') return null;
  const skillName = kind === 'close' ? 'Close Combat' : 'Ranged Combat';
  const specs = (ch.skills || []).filter((s) => s.name === skillName && s.spec);
  const choose = (e) => update((q) => { if (e.target.value) q.attackSkill = e.target.value; else delete q.attackSkill; });
  return h('label', { class: 'field' }, h('span', null, 'Attack skill'),
    h('select', { id: 'lab-attack-skill', onChange: choose },
      h('option', { value: '', selected: !p.attackSkill }, `Its own name (${skillName}: ${p.name})`),
      specs.map((s) => h('option', { value: s.spec, selected: p.attackSkill === s.spec }, `${skillName}: ${s.spec} (+${s.ranks})`))),
    bonusHint(p, ch, R, skillName));
}
