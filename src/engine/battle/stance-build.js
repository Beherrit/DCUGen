// What holding a stance does to a fighter in the fight, as the list of changes mods.js applies (Martial Arts pp 128-131).
// The numbers for attack, damage, initiative and skills come from the same function the play view uses (martial/stance-mods.js
// inStance), so the sheet and the Battle Room agree; the rest (Dodge and Parry split into active and resistance, reach, knockback,
// resisting a trip or throw, the stance's own conditions) is added here. The fighting style's extras that work only while a
// stance of the style is held (Attack Focus, Clumsy Attacks, Defensive, Weak Defense) ride along with it.

import { inStance, defenseSplit, modsOf, attackTags } from '../martial/stance-mods.js';
import { anyFits } from './style-extras.js';

const CAP = (c) => 2 * (c.pl || 10);
const DEFENSES = ['Dodge', 'Parry'];

/** Room under the power level limit for more attack bonus on this attack (the bonus and the effect rank together stay within 2 x PL). */
const room = (c, a) => Math.max(0, CAP(c) - (a.bonus ?? 0) - a.rank);

/** The attack lines as the stance rules read them. */
const asLines = (c) => c.attacks.map((a) => ({ name: a.name, kind: a.range === 'close' ? 'close' : a.range === 'ranged' ? 'ranged' : a.kind, roll: a.roll, bonus: a.bonus ?? 0, rank: a.rank }));

/** Per-attack changes from the stance rules: [{ id, bonus, rank }] where something changes. Damage ranks only count on Damage attacks. */
function attackChanges(c, def) {
  const before = asLines(c);
  const d0 = { defenses: { Dodge: c.d.defenses.Dodge, Parry: c.d.defenses.Parry, Toughness: c.d.defenses.Toughness }, initiative: 0, attacks: before, skills: [] };
  const after = inStance(d0, def, c.pl).attacks;
  const out = [];
  c.attacks.forEach((a, i) => {
    const bonus = after[i].bonus - before[i].bonus;
    const rank = a.effect === 'Damage' ? after[i].rank - before[i].rank : 0;
    if (bonus || rank) out.push({ id: a.id, bonus: a.roll ? bonus : 0, rank });
  });
  return out;
}

/** Dodge and Parry: the change for both, for the active defense only and for resistance only, within the power level limit. */
function defenseChanges(c, def) {
  const split = defenseSplit(def);
  const tough = c.d.defenses.Toughness;
  const out = [];
  for (const t of DEFENSES) {
    const row = split[t]; const cur = c.d.defenses[t];
    const lim = Math.max(cur, CAP(c) - tough); // the benefits of a stance stay within the limit
    if (row.set !== undefined) { out.push({ kind: 'defense', trait: t, amount: row.set - cur }); continue; }
    const all = row.all > 0 ? Math.min(row.all, Math.max(0, lim - cur)) : row.all;
    if (all) out.push({ kind: 'defense', trait: t, amount: all });
    if (row.active) out.push({ kind: 'active', trait: t, amount: row.active > 0 ? Math.min(row.active, Math.max(0, lim - cur - Math.max(0, all))) : row.active });
    if (row.resist) out.push({ kind: 'resist', trait: t, amount: row.resist });
  }
  return out.filter((m) => m.amount);
}

/** Resisting a push, trip, throw or knockback, reach, throwing strength and the like: the effects inStance does not carry. */
function extraEffects(c, def) {
  const out = [];
  const keys = { 'resist.pushRushTripThrow': ['push', 'trip', 'throw'], 'resist.knockbackTripThrow': ['knockback', 'trip', 'throw'], 'resist.tripThrow': ['trip', 'throw'] };
  for (const m of def.mods) {
    if (m.when) continue;
    for (const key of keys[m.stat] || []) out.push({ kind: 'defend', key, amount: m.value });
    if (m.stat === 'knockbackRank') out.push({ kind: 'defend', key: 'knockback', amount: -m.value }); // -1 rank of knockback is 1 rank less to be thrown back
  }
  for (const m of modsOf(def, 'reach')) for (const a of c.attacks) if (a.range === 'close') out.push({ kind: 'tune', id: a.id, reach: 5 * m.value });
  for (const m of modsOf(def, 'strength')) for (const a of c.attacks) if (attackTags(a).grab && /throw/i.test(a.name)) out.push({ kind: 'tune', id: a.id, rank: m.value }); // Throwing stance: +2 Strength for what may be thrown
  for (const m of modsOf(def, 'power:')) for (const a of c.attacks) if (a.power?.effect === m.stat.slice(6) && a.effect === 'Damage') out.push({ kind: 'tune', id: a.id, rank: m.value }); // TK stance: Move Object +1 rank
  for (const m of modsOf(def, 'advantage:Defensive Roll')) out.push({ kind: 'defense', trait: 'Toughness', amount: m.value }); // Drunken: Defensive Roll 2 counts as Toughness on the sheet
  return out;
}

/** Skill bonuses that count in a fight: Deception for a feint (Misleading, Drunken, Showman, Fluid), Acrobatics, Intimidation. */
function skillChanges(c, def) {
  const out = [];
  for (const m of def.mods) {
    const name = /^skill(?:Ranks)?:(.+)$/.exec(m.stat)?.[1];
    if (name && !m.when && typeof c.skills[name] === 'number') out.push({ kind: 'skill', name, amount: m.value });
  }
  return out;
}

/** Finishing stance: -4 to everything else (MA 129), the doubled close damage only when the target went helpless in the stance (not played). */
function everything(c, def) {
  const m = def.mods.find((x) => x.stat === 'everything');
  if (!m) return [];
  const out = c.attacks.map((a) => ({ kind: 'tune', id: a.id, bonus: a.roll ? m.value : 0, rank: a.effect === 'Damage' ? m.value : 0 }));
  for (const t of ['Toughness', 'Dodge', 'Parry', 'Fortitude', 'Will']) if (typeof c.d.defenses[t] === 'number') out.push({ kind: 'defense', trait: t, amount: m.value });
  return out;
}

/** The weapon stance (MA 130): +1 to attack and +2 to damage with the chosen weapon, the same bonus taken off as a penalty for every other attack. */
function weaponChoice(c, def) {
  if (def.name !== 'Weapon') return [];
  const chosen = c.attacks.filter((a) => a.range === 'close' && a.item).sort((a, b) => b.rank - a.rank)[0];
  if (!chosen) return [];
  return c.attacks.map((a) => ({ kind: 'tune', id: a.id, bonus: a.roll ? (a === chosen ? 1 : -1) : 0, rank: a.effect === 'Damage' ? (a === chosen ? 2 : -2) : 0 }));
}

/** How much a stance gives its holder: the sum of its plain bonuses to attack, damage and active defenses (what a foe gains by breaking it). */
export const stanceEdge = (def) => (def?.mods || []).filter((m) => !m.when && m.value > 0 && /^(attack|damage|Parry|Dodge)/.test(m.stat)).reduce((t, m) => t + m.value, 0);

/** A weapon stance needs a weapon to apply to. */
export const stanceUsable = (c, def) => def.name !== 'Weapon' || c.attacks.some((a) => a.range === 'close' && a.item);

/** Fluid stance: with no Extra Attacks to give a Combo Element, +2 to the attack check (MA 129), the player's choice made each round. */
function fluid(c, def) {
  if (def.name !== 'Fluid' || c.extraAttacks) return [];
  return c.attacks.filter((a) => a.roll && a.range === 'close').map((a) => ({ kind: 'tune', id: a.id, bonus: Math.min(2, room(c, a)) }));
}

/** Preferred Stance (MA 77): the stance's worst attack penalty halved, or else its best bonus raised by half (at least 1). */
function preferred(c, base) {
  const tunes = base.filter((m) => m.kind === 'tune' && m.bonus);
  const worst = Math.min(0, ...tunes.map((m) => m.bonus));
  if (worst < 0) return tunes.filter((m) => m.bonus < 0).map((m) => ({ kind: 'tune', id: m.id, bonus: Math.floor(-m.bonus / 2) || 1 }));
  const best = Math.max(0, ...tunes.map((m) => m.bonus));
  const cap = (id) => room(c, c.attacks.find((a) => a.id === id));
  return best > 0 ? tunes.filter((m) => m.bonus > 0).map((m) => ({ kind: 'tune', id: m.id, bonus: Math.min(cap(m.id), Math.max(1, Math.floor(m.bonus / 2))) })) : [];
}

/** The style's extras and flaws that count only in one of its stances. */
function styleEdge(c, style) {
  if (!style) return [];
  const out = [];
  for (const a of c.attacks) {
    if (!a.roll || a.range !== 'close' && a.range !== 'ranged') continue;
    if (anyFits(style.ex.focus, a)) out.push({ kind: 'tune', id: a.id, bonus: Math.min(2, room(c, a)), src: 'Attack Focus' });
    if (anyFits(style.fl.clumsy, a)) out.push({ kind: 'tune', id: a.id, bonus: -2, src: 'Clumsy Attacks' });
  }
  if (style.ex.focus.length) out.push({ kind: 'init', amount: 2 });
  if (style.fl.clumsy.length) out.push({ kind: 'init', amount: -2 });
  if (style.ex.defensive) for (const t of DEFENSES) out.push({ kind: 'defense', trait: t, amount: 1 });
  const w = style.fl.weak;
  if (w) for (const t of DEFENSES) if (w[t.toLowerCase()]) out.push({ kind: 'defense', trait: t, amount: -w.rank });
  return out;
}

/** Everything a stance does, as mods.js changes. Neutral does nothing. */
export function stanceMods(c, choice, style, isPreferred = false) {
  const def = choice.def;
  if (!def || def.name === 'Neutral') return [];
  const src = `${def.name} stance`;
  const base = attackChanges(c, def).map((m) => ({ kind: 'tune', src, ...m }));
  const weapon = weaponChoice(c, def).map((m) => ({ ...m, src }));
  const mods = [...base, ...weapon, ...fluid(c, def).map((m) => ({ ...m, src })), ...everything(c, def).map((m) => ({ ...m, src })), ...defenseChanges(c, def), ...extraEffects(c, def), ...skillChanges(c, def), ...styleEdge(c, style)];
  const init = def.mods.filter((m) => m.stat === 'initiative' && !m.when).reduce((t, m) => t + m.value, 0);
  if (init) mods.push({ kind: 'init', amount: init });
  for (const f of def.flags || []) mods.push(f === 'dodgeForParry' ? { kind: 'swap' } : { kind: 'flag', flag: f });
  if (isPreferred) mods.push(...preferred(c, [...base, ...weapon]).map((m) => ({ ...m, src: `${src} (Preferred)` })));
  return mods.filter((m) => m.kind !== 'tune' || m.bonus || m.rank || m.reach);
}
