// Temporary changes to a fighter's traits for the fight, kept on the fighter and put back on its fresh numbers whenever it is
// rebuilt: a Shapeshift form, a Mimic copy, an Energy Absorption boost (Hero's Handbook p116, p107, p95). Like the traits lent by
// an ally (grants.js) they move the derived numbers directly, and each can be taken off again exactly.
//
// A change is { kind, ... }:
//   defense  { trait, amount }          Toughness, Dodge, Parry, Fortitude or Will
//   strength { amount }                 Strength: the unarmed attack and Strength-based attacks gain the rank
//   bonus    { range, amount }          the attack check of close or ranged attacks
//   rank     { range, amount }          the rank of Damage attacks of that range
//   attack   { attack }                 a whole new attack (built like combatant.js builds one)
//   speed    { amount }                 ranks of speed
// A set of changes is an entry { source, key, mods, fades }; `fades` takes that many off every amount at the end of each turn.

import { rankFt } from '../range.js';

const DEFENSES = ['Toughness', 'Dodge', 'Parry', 'Fortitude', 'Will'];
const isDamage = (a) => a.effect === 'Damage' && !a.area;

/** Move the fighter's numbers by one change (sign 1 to apply it, -1 to take it off). */
function shift(c, m, sign) {
  const n = sign * (m.amount || 0);
  if (m.kind === 'defense' && DEFENSES.includes(m.trait) && typeof c.d.defenses[m.trait] === 'number') c.d.defenses[m.trait] += n;
  else if (m.kind === 'strength') {
    c.d.abilities.Strength = (c.d.abilities.Strength ?? 0) + n;
    for (const a of c.attacks) if (a.unarmed || a.power?.strengthBased) a.rank += n;
  } else if (m.kind === 'bonus') {
    for (const a of c.attacks) if (a.roll && a.bonus !== null && (m.range === 'close') === (a.range === 'close')) a.bonus += n;
  } else if (m.kind === 'rank') {
    for (const a of c.attacks) if (isDamage(a) && (m.range === 'close') === (a.range === 'close') && !a.unarmed) a.rank += n;
  } else if (m.kind === 'attack') {
    if (sign > 0) c.attacks.push(m.attack);
    else c.attacks = c.attacks.filter((a) => a.id !== m.attack.id);
  } else if (m.kind === 'speed') {
    c.moveRank = (c.moveRank ?? 0) + n;
    c.moveFt = rankFt(c.moveRank);
  }
}

const apply = (c, entry, sign) => { for (const m of entry.mods) shift(c, m, sign); };

/** Put a fighter's recorded changes back on its freshly built numbers (rebuildCombatant). */
export function applyMods(c) {
  c.mods ||= [];
  for (const e of c.mods) apply(c, e, 1);
}

/** Add a set of changes under a source and key, replacing the one with the same source and key. */
export function addMods(c, source, key, mods, fades = 0) {
  c.mods ||= [];
  dropMods(c, source, key);
  const entry = { source, key, mods, fades };
  c.mods.push(entry);
  apply(c, entry, 1);
  return entry;
}

/** Take off the changes of a source (and key, when given). Returns how many were taken off. */
export function dropMods(c, source, key = null) {
  const gone = (c.mods || []).filter((e) => e.source === source && (key === null || e.key === key));
  for (const e of gone) apply(c, e, -1);
  c.mods = (c.mods || []).filter((e) => !gone.includes(e));
  return gone.length;
}

/** Try a set of changes without keeping them: run fn with them in force, then take them off. */
export function withMods(c, mods, fn) {
  const entry = { mods };
  apply(c, entry, 1);
  try { return fn(); } finally { apply(c, entry, -1); }
}

/** End of turn: every changing amount that fades loses its rate, and an entry with nothing left is dropped. Returns the entries that ran out. */
export function fadeMods(c) {
  const ended = [];
  for (const e of [...(c.mods || [])].filter((x) => x.fades)) {
    apply(c, e, -1);
    e.mods = e.mods.map((m) => (m.amount ? { ...m, amount: Math.max(0, m.amount - e.fades) } : m)).filter((m) => m.kind === 'attack' || m.amount > 0);
    if (!e.mods.length) { c.mods = c.mods.filter((x) => x !== e); ended.push(e); } else apply(c, e, 1);
  }
  return ended;
}

/** The size of a source's change on one trait, for the fade lines in the log. */
export const totalOf = (c, source) => (c.mods || []).filter((e) => e.source === source).flatMap((e) => e.mods).reduce((s, m) => s + (m.amount || 0), 0);
