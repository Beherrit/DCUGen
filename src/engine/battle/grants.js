// Traits one fighter lends another for the fight: Enhanced Trait, Protection or Regeneration with Affects Others
// (Hero's Handbook p125, a touch). A gift is lent to one subject at a time, lasts while the giver can keep it up (it is
// sustained), and moves the subject's derived numbers: defenses, attack checks, Regeneration. The subject's `grants`
// list keeps the record so a rebuilt fighter gets them back (applyGrants).

import { allPowers } from '../derive.js';
import { hasExtra, byId } from './util.js';
import { canAct } from './conditions.js';

/** Enhanced Trait options and what they move: a defense, or the close or ranged attack check. */
const KINDS = {
  Dodge: ['Dodge'], Agility: ['Dodge'], Parry: ['Parry'], Toughness: ['Toughness'], Stamina: ['Toughness'], Fortitude: ['Fortitude'], Will: ['Will'],
  Fighting: ['Parry', 'close'], Dexterity: ['ranged'],
};

/** The gifts a character can lend: [{ key, name, trait, kinds, amount }]. A trait the simulator does not model is left out. */
export function giftsOf(ch) {
  const out = [];
  for (const { power: p } of allPowers(ch, { includeAlternates: false })) {
    if (!hasExtra(p, 'Affects Others') || !(p.rank > 0)) continue;
    const trait = p.effect === 'Enhanced Trait' ? p.option : p.effect === 'Protection' ? 'Toughness' : null;
    const kinds = p.effect === 'Regeneration' ? ['regen'] : KINDS[trait];
    if (!kinds) continue;
    out.push({ key: `${p.name}|${p.effect}|${p.option || ''}`, name: p.name, trait: p.effect === 'Regeneration' ? 'Regeneration' : trait, kinds, amount: p.rank });
  }
  return out;
}

/** Move the fighter's numbers by a grant (sign 1 to give it, -1 to take it back). */
function shift(c, g, sign) {
  for (const k of g.kinds) {
    if (k === 'regen') c.regenRank = (c.regenRank || 0) + sign * g.amount;
    else if (k === 'close' || k === 'ranged') for (const a of c.attacks) { if (a.roll && a.bonus !== null && (k === 'close') === (a.range === 'close')) a.bonus += sign * g.amount; }
    else if (typeof c.d.defenses[k] === 'number') c.d.defenses[k] += sign * g.amount;
  }
}

/** Put a rebuilt fighter's grants back on its fresh numbers. */
export function applyGrants(c) {
  c.grants ||= []; // a fighter saved before grants existed
  for (const g of c.grants) shift(c, g, 1);
}

/** Who holds this gift of the giver's right now, or null. */
export function holderOf(b, giver, key) {
  return b.combatants.find((x) => (x.grants || []).some((g) => g.by === giver.id && g.key === key)) || null;
}

function drop(c, g) { shift(c, g, -1); c.grants = c.grants.filter((x) => x !== g); }

/** Lend the gift to the subject, taking it back from whoever held it. */
export function lend(b, giver, subject, gift) {
  const old = holderOf(b, giver, gift.key);
  if (old) drop(old, old.grants.find((g) => g.by === giver.id && g.key === gift.key));
  const g = { by: giver.id, ...gift };
  subject.grants.push(g);
  shift(subject, g, 1);
}

/** Gifts lapse when the giver is out, fled or can no longer keep them up. Called at the start of every turn. */
export function refreshGrants(b) {
  for (const c of b.combatants) {
    for (const g of [...(c.grants || [])]) {
      const giver = byId(b, g.by);
      if (!giver || giver.fled || canAct(giver) === 'none') drop(c, g);
    }
  }
}

/** Try a gift on a subject without keeping it: run `fn` with the gift in force, then take it back. */
export function withGift(subject, gift, fn) {
  const g = { by: '?', ...gift };
  shift(subject, g, 1);
  try { return fn(); } finally { shift(subject, g, -1); }
}
