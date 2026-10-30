// The generator's attack guarantee: every fighter ends with an attack that uses a fair share of its PL.
//
// A character whose only attack is Unarmed at a low Strength cannot scratch anyone at PL 10, so a fight
// between two of them never ends. After the equipment is bought, `ensureAttack` checks for that and adds
// the missing piece: a weapon for crime fighters, a Strength-based strike for martial artists, the theme's
// own attack for everyone else. It draws from its own forked random stream, so a character that already
// had a fair attack is built exactly as before.

import { deriveAll, attacks, skillRanks, advantageRank, allPowers } from './derive.js';
import { equipmentPoints } from './costs.js';
import { EP_PER_EQUIPMENT_RANK } from './rules.js';

/** True when the character has an attack worth rolling: any non-Unarmed one, or an Unarmed strong enough on its own. */
export function hasFairAttack(ch, R) {
  const list = attacks(ch, R);
  if (list.some((a) => a.name !== 'Unarmed')) return true;
  const u = list[0];
  return u.rank >= ch.pl - 3 && u.rank + (u.bonus ?? 0) >= 2 * ch.pl - 4;
}

/** Set the Close Combat ranks for one specialty (0 removes it). */
function setCloseRanks(ch, spec, ranks) {
  const i = ch.skills.findIndex((s) => s.name === 'Close Combat' && s.spec === spec);
  if (i >= 0) {
    if (ranks > 0) ch.skills[i].ranks = ranks; else ch.skills.splice(i, 1);
  } else if (ranks > 0) ch.skills.push({ name: 'Close Combat', spec, ranks });
}

/** The to-hit before specialty ranks: Fighting plus any Close Attack. */
function closeBase(ch, R) {
  return deriveAll(ch, R).abilities.Fighting + advantageRank(ch, 'Close Attack');
}

/** Aim for damage rank `pl` down to `pl - 2`, but never so high that Fighting alone breaks the 2 x PL cap. */
function damageGoal(ch, base, rng) {
  return Math.min(ch.pl - rng.int(0, 2), 2 * ch.pl - base);
}

/** Keep the Unarmed attack legal after Strength went up. */
function capUnarmed(ch, R) {
  const abil = deriveAll(ch, R).abilities;
  const room = Math.max(0, 2 * ch.pl - abil.Strength - closeBase(ch, R));
  if (skillRanks(ch, 'Close Combat', 'Unarmed') > room) setCloseRanks(ch, 'Unarmed', room);
}

function freeName(ch, base) {
  const used = new Set(allPowers(ch).map((x) => x.power.name));
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
  return name;
}

/** A Strength-based Damage power (named for the style, "Martial Strikes" by default) sized to sit near the PL limit. */
function addStrike(ch, R, ctx, rng) {
  const { pl } = ch;
  const strength = deriveAll(ch, R).abilities.Strength;
  const base = closeBase(ch, R);
  const goal = Math.max(strength + 1, damageGoal(ch, base, rng));
  const name = freeName(ch, ctx.style?.name ? `${ctx.style.name} Strikes` : 'Martial Strikes');
  ch.powers.push({
    id: `p${Math.floor(rng.next() * 2 ** 40).toString(36)}`, name, effect: 'Damage', rank: goal - strength, role: 'attack',
    range: 'Close', strengthBased: true, attackSkill: 'Unarmed', extras: [], flaws: [],
    descriptors: ctx.theme?.descriptors?.length ? [rng.pick(ctx.theme.descriptors)] : [], alternates: [],
  });
  setCloseRanks(ch, 'Unarmed', Math.max(0, 2 * pl - goal - base));
  return true;
}

/** A melee weapon from the equipment tables, with Strength and Close Combat raised to use it well. */
function addWeapon(ch, R, ctx, rng, tools) {
  const owned = new Set(ch.equipment.map((x) => x.name));
  const options = (R.raw.equipment?.weapons || [])
    .filter((w) => /Melee/.test(w.category) && /Damage/.test(w.effect) && !owned.has(w.name))
    .map((w) => tools.parseItem(w, 'weapon'))
    .filter((it) => it.attack?.kind === 'close' && it.attack.strengthBased);
  const item = rng.weighted(options, (it) => it.attack.rank);
  if (!item) return false;
  ch.equipment.push(item);
  const adv = ch.advantages.find((a) => a.name === 'Equipment');
  const ranks = Math.max(1, Math.ceil(equipmentPoints(ch) / EP_PER_EQUIPMENT_RANK));
  if (adv) adv.rank = Math.max(adv.rank, ranks); else ch.advantages.push({ name: 'Equipment', rank: ranks });

  const base = closeBase(ch, R);
  const strength = deriveAll(ch, R).abilities.Strength;
  const goal = damageGoal(ch, base, rng);
  const want = Math.min(Math.max(strength, goal - item.attack.rank), ch.pl + 10);
  ch.abilities.Strength += want - strength;
  capUnarmed(ch, R);
  setCloseRanks(ch, item.name, Math.max(0, 2 * ch.pl - (want + item.attack.rank) - base));
  return true;
}

/**
 * Give the character a fair attack if it lacks one. Returns true when something was added.
 * tools: { parseItem, themeAttack } from the generator (themeAttack() adds the theme's own attack, or returns false).
 */
export function ensureAttack(ch, R, ctx, tools) {
  if (hasFairAttack(ch, R)) return false;
  const rng = ctx.rng.fork('attack-fix');
  const { arch } = ctx;
  if (arch.powerless && addWeapon(ch, R, ctx, rng, tools)) return true;
  if (arch.styles) return addStrike(ch, R, ctx, rng);
  if (tools.themeAttack()) return true;
  return addStrike(ch, R, ctx, rng);
}
