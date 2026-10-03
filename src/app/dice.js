// Player dice: a "Roll" menu on every sheet (attacks, resistance checks, skills, abilities,
// initiative), and the results go to the Table feed so the whole group can see them.

import { h, toast } from './dom.js';
import { deriveAll } from '../engine/derive.js';
import { ABILITIES } from '../engine/rules.js';
import { postRoll } from './table.js';

const d20 = () => 1 + Math.floor(Math.random() * 20);
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** Roll d20 + mod, optionally against a DC. Returns the feed entry. */
export function rollCheck({ who, label, mod = 0, dc = null, note = '' }) {
  const roll = d20();
  const total = roll + mod;
  let deg = null;
  if (dc != null) {
    deg = total >= dc ? 1 + Math.floor((total - dc) / 5) : -(1 + Math.floor((dc - total - 1) / 5));
    if (roll === 20) deg = deg > 0 ? deg + 1 : 1;
  }
  const text = `${who} rolls ${label}: d20 ${roll} ${sign(mod)} = ${total}${dc != null ? ` vs DC ${dc} — ${deg > 0 ? `${deg} degree${deg > 1 ? 's' : ''} of success` : `${-deg} degree${deg < -1 ? 's' : ''} of failure`}` : ''}${roll === 20 ? ' (natural 20!)' : roll === 1 ? ' (natural 1)' : ''}${note ? ` · ${note}` : ''}`;
  return postRoll({ who, text, dice: { label, roll, mod, total, dc, deg } });
}

/** The "🎲 Roll" dropdown for a character. */
export function rollMenu(ch, R) {
  const who = ch.identity?.codename || ch.identity?.realName || 'Someone';
  let d;
  try { d = deriveAll(ch, R); } catch { return null; }
  const list = h('div', { class: 'menu-list roll-menu', hidden: true, role: 'menu' });
  const btn = h('button', { class: 'btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Roll for this character; results go to the Table', onClick: (e) => {
    e.stopPropagation();
    const open = list.hidden;
    document.querySelectorAll('.menu-list').forEach((m) => { m.hidden = true; });
    list.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  } }, '🎲 Roll ▾');
  const item = (label, hint, run) => h('button', { type: 'button', role: 'menuitem', onClick: () => { list.hidden = true; const e = run(); if (e) toast(e.text); } }, label, hint ? h('small', null, hint) : null);
  const group = (title) => h('div', { class: 'roll-group' }, title);
  list.append(group('Combat'));
  list.append(item('Initiative', sign(d.initiative), () => rollCheck({ who, label: 'initiative', mod: d.initiative })));
  for (const a of d.attacks) {
    if (!a.roll) { list.append(item(`${a.name}`, `${a.kind}: no attack roll · ${a.effect} ${a.rank}, DC ${(a.effect === 'Damage' ? 15 : 10) + a.rank}`, () => postRoll({ who, text: `${who} uses ${a.name}: ${a.kind} effect, no attack roll. ${a.effect} ${a.rank}: targets resist with ${a.resistance} against DC ${(a.effect === 'Damage' ? 15 : 10) + a.rank}.` }))); continue; }
    list.append(item(`${a.name} attack`, `${sign(a.bonus)} · ${a.effect} ${a.rank}, resist DC ${(a.effect === 'Damage' ? 15 : 10) + a.rank}`, () => {
      const e = rollCheck({ who, label: `${a.name} attack`, mod: a.bonus, note: `hits ${a.kind === 'close' ? 'Parry' : 'Dodge'} up to ${d20Max(a.bonus)}` });
      return e;
    }));
  }
  list.append(group('Resist'));
  const def = d.defenses;
  for (const [name, v] of [['Toughness', def.Toughness], ['Fortitude', def.immune?.Fortitude ? null : def.Fortitude], ['Will', def.immune?.Will ? null : def.Will], ['Dodge', def.Dodge]]) {
    if (v == null) continue;
    list.append(item(`${name} check`, sign(v), () => rollCheck({ who, label: `${name} check`, mod: v })));
  }
  list.append(group('Skills'));
  for (const s of [...d.skills].sort((a, b) => a.name.localeCompare(b.name))) list.append(item(`${s.name}${s.spec ? ` (${s.spec})` : ''}`, sign(s.bonus), () => rollCheck({ who, label: `${s.name}${s.spec ? ` (${s.spec})` : ''}`, mod: s.bonus })));
  list.append(group('Abilities'));
  for (const a of ABILITIES) { const v = d.abilities[a]; if (v == null) continue; list.append(item(`${a} check`, sign(v), () => rollCheck({ who, label: `${a} check`, mod: v }))); }
  list.append(item('Plain d20', '', () => rollCheck({ who, label: 'd20', mod: 0 })));
  return h('div', { class: 'menu' }, btn, list);
}

function d20Max(bonus) { return 20 + bonus - 10; }
