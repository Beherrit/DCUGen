// Combat maneuvers as attacks (Martial Arts 3e, pp 136-153). A maneuver the fighter bought (a power marked `maneuver`, martial/maneuvers.js)
// becomes an attack line like the sheet's own, which combatant.js builds as any other:
//   basic    Damage of the carrying attack plus the table's modifier (Strength for unarmed, the weapon's rank for a weapon style,
//            MA p126), the table's attack modifier and critical range, and the change to Parry and Dodge until the next turn.
//            Sweep is its Affliction. The Student bonus and the style's extras are added in style-bonus.js.
//   advanced the plain attack builds (maneuver-table.js ADVANCED) at the rank bought.
// Held to the power level limit: the attack bonus and the effect rank together stay within twice the power level. The maneuvers
// that need rules the simulator lacks (Push Over, Exposed, Grab-Based effects, combo points, hit location, kiai cones) are left
// out and listed in the coverage notes; their damage still counts through the table.

import { advantageRank, skillRanks } from '../derive.js';
import { styleDef, maneuverDef } from '../martial/lookup.js';
import { maneuverPowers } from '../martial/maneuvers.js';
import { itemFor } from './items.js';
import { strengthMod, critFrom, defenseChange, attackChange, maneuverExtras, BASIC_AFFLICTIONS, ADVANCED } from './maneuver-table.js';

/** A stand-in power for a maneuver, so the extras and conditions it carries are read like a power's own. */
const synthetic = (name, effect, rank, extra = {}) => ({ name, effect, rank, range: 'Close', role: 'maneuver', synthetic: true, extras: [], flaws: [], descriptors: [], alternates: [], ...extra });

/** What a maneuver is struck with: the unarmed attack, or for a weapon style the best matching weapon (MA p126). */
function carriersOf(ch, R, def, d, weaponDependent) {
  const unarmed = d.attacks.find((a) => a.name === 'Unarmed');
  const weaponStyle = /^Weapon/.test(def?.type || '') || weaponDependent;
  const out = [];
  if (unarmed && !weaponDependent && (!weaponStyle || (def?.weapon_elements || []).includes('Unarmed'))) out.push({ atk: unarmed, item: null, tag: '' });
  if (weaponStyle || (!unarmed && (def?.weapon_elements || []).length)) {
    const gear = d.attacks.filter((a) => a.equipment && a.kind === 'close').sort((x, y) => y.rank - x.rank);
    if (gear[0]) out.push({ atk: gear[0], item: itemFor(ch, gear[0], null, R), tag: ` (${gear[0].name})` });
  }
  return out;
}

const base = (ch, d, style, carrier) => {
  const close = (d.abilities.Fighting ?? 0) + advantageRank(ch, 'Close Attack');
  return Math.max(carrier.atk.bonus, close + skillRanks(ch, 'Close Combat', style.skill?.spec || style.name));
};

/** The raw attack line of one maneuver on one carrier, or null when the fight does not play it. */
function lineFor(ch, pl, style, p, md, carrier, bonusBase) {
  const label = `${p.name}${carrier.tag}`;
  const cap = (rank, bonus) => Math.max(1, Math.min(rank, 2 * pl - bonus));
  const common = { kind: 'close', roll: true, maneuver: true, style: style.name, ...(carrier.item ? { item: carrier.item } : {}) };
  const adv = ADVANCED[md.name];
  if (md.tier === 'advanced') {
    if (!adv) return null;
    const rank = cap(p.rank + (adv.strength ? carrier.atk.rank : 0), bonusBase);
    if (adv.kind === 'Damage') return { ...common, name: label, effect: 'Damage', resistance: adv.resist || 'Toughness', bonus: bonusBase, rank, power: synthetic(label, 'Damage', rank, { descriptors: adv.descriptors || [] }) };
    return { ...common, name: label, effect: adv.kind, resistance: adv.kind === 'Weaken' ? 'Fortitude' : undefined, bonus: bonusBase, rank: cap(p.rank, bonusBase), power: synthetic(label, adv.kind, cap(p.rank, bonusBase), { detail: adv.detail, extras: adv.extras || [] }) };
  }
  const bonus = bonusBase + attackChange(md);
  const aff = BASIC_AFFLICTIONS[md.name];
  const def = defenseChange(md);
  if (aff) return { ...common, name: label, effect: 'Affliction', resistance: 'Dodge', bonus, rank: cap(aff.rank, bonus), crit: critFrom(md), manDef: def, power: synthetic(label, 'Affliction', cap(aff.rank, bonus), { detail: aff.detail, flaws: aff.limited ? [{ name: 'Limited Degree' }] : [] }) };
  const mod = strengthMod(md);
  if (mod === null) return null;
  const rank = cap(Math.max(md.cost?.min_rank ?? 1, carrier.atk.rank + mod), bonus);
  return { ...common, name: label, effect: 'Damage', resistance: 'Toughness', bonus, rank, crit: critFrom(md), manDef: def, power: synthetic(label, 'Damage', rank, { extras: maneuverExtras(md) }) };
}

/** The raw attack lines for every maneuver of every style the character practices. */
export function maneuverAttacks(ch, R, d) {
  const out = [];
  for (const style of ch.styles || []) {
    const def = styleDef(R, style.name);
    const weaponDependent = !!(def?.style_flaws || []).find((f) => f.name === 'Weapon Dependent');
    const carriers = carriersOf(ch, R, def, d, weaponDependent);
    for (const p of maneuverPowers(ch, style.name)) {
      const md = maneuverDef(R, p.maneuverName || p.name, p.detail);
      if (!md) continue;
      for (const carrier of carriers) {
        const line = lineFor(ch, ch.pl || 10, style, p, md, carrier, base(ch, d, style, carrier));
        if (line && !out.some((x) => x.name === line.name)) out.push(line);
      }
    }
  }
  return out;
}
