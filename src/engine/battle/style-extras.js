// Fighting style extras and flaws that change a fight (Martial Arts pp 131-136), read once from the style's data
// (data/styles.json style_extras and style_flaws). `ex` and `fl` hold only the ones the Battle Room plays, as ranks or lists:
//   extras  Aggressive, Defensive, Attack Focus (the attack types), Mobile, Fixed, Esoteric
//   flaws   Clumsy Attacks (the attack types), Impractical, Listless, Slow, Predictable, Weak Defense, Weapon Dependent
// Not played: Demanding (downtime practice), No Nonsense (Martial Showman checks), Ill-Favored Conditions (free text), and the
// extras Divine, Geomantic, Metahuman, Mystic and Spiritual, which need rules the simulator does not have (see the coverage list).

import { attackTags } from '../martial/stance-mods.js';

const find = (list, name) => (list || []).find((x) => x.name === name);
const rankOf = (x) => (x ? x.rank || 1 : 0);

/** The attack types a focus or a clumsy flaw names ("Headbutt, Jab, Select One Combat Maneuver" gives headbutt and jab). */
function typesOf(list, name) {
  return (list || []).filter((x) => x.name === name).flatMap((x) => String(x.detail || '').split(/,|;/).map((t) => t.trim().toLowerCase())).filter((t) => t && !/^select/.test(t));
}

/** The extras and flaws of a style that matter in a fight. */
export function readExtras(def) {
  const e = def?.style_extras; const f = def?.style_flaws;
  const weak = find(f, 'Weak Defense');
  return {
    ex: { aggressive: !!find(e, 'Aggressive'), defensive: !!find(e, 'Defensive'), mobile: rankOf(find(e, 'Mobile')), fixed: rankOf(find(e, 'Fixed')), esoteric: rankOf(find(e, 'Esoteric')), focus: typesOf(e, 'Attack Focus') },
    fl: { clumsy: typesOf(f, 'Clumsy Attacks'), impractical: rankOf(find(f, 'Impractical')), listless: rankOf(find(f, 'Listless')), slow: rankOf(find(f, 'Slow')), predictable: rankOf(find(f, 'Predictable')), weapon: !!find(f, 'Weapon Dependent'), weak: weak ? { rank: rankOf(weak), parry: !/dodge/i.test(weak.detail || ''), dodge: /dodge/i.test(weak.detail || '') } : null }, // the book lets the penalty fall on Parry or Dodge; the data names which
  };
}

/** Does an attack type named by a style ("kicks", "hand strikes", "joint locks", "whip") fit this attack? */
export function typeFits(type, atk) {
  const t = attackTags(atk);
  if (/kick|foot|feet|knee/.test(type)) return t.foot;
  if (/hand|punch|fist|palm|strike/.test(type) && !/weapon/.test(type)) return t.hand || (/strike/.test(type) && /strike|punch|jab|hook|palm/i.test(atk.name));
  if (/throw|grab|lock|hold|choke/.test(type)) return t.grab;
  if (/ranged|thrown/.test(type)) return atk.range !== 'close';
  const word = type.replace(/s$/, '');
  return `${atk.name} ${atk.item?.name || ''}`.toLowerCase().includes(word);
}

/** Does any of the types fit the attack? */
export const anyFits = (types, atk) => types.some((t) => typeFits(t, atk));
