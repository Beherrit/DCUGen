// The roles a fighter's build suggests. A fighter can have several. Roles never decide what a fighter does; each only
// weighs one kind of choice a little more (ROLE_WEIGHT), so a mixed build acts like its main role while still doing the
// obvious thing. The choices are scored in utility.js and the files beside it.

import { stopOf } from './control-stop.js';

export const ROLES = ['healer', 'controller', 'debuffer', 'buffer', 'protector', 'striker', 'tank'];
/** The weight a matching role puts on its kind of choice. */
export const ROLE_WEIGHT = 1.15;

/** The roles of a built fighter (after its attacks, gifts, Deflect and advantages are known). */
export function detectRoles(c) {
  const roles = [];
  const gifts = c.gifts || [];
  const damage = c.attacks.filter((a) => a.effect === 'Damage' && a.rank > 0);
  if (c.healing || gifts.some((g) => g.kinds.includes('regen'))) roles.push('healer');
  if (c.attacks.some((a) => stopOf(a) >= 0.5)) roles.push('controller');
  if (c.attacks.some((a) => a.effect === 'Weaken')) roles.push('debuffer');
  if (gifts.some((g) => g.trait !== 'Regeneration' && g.trait !== 'Toughness') || c.adv.Inspire || c.adv.Leadership) roles.push('buffer');
  if (c.deflect || c.adv.Interpose || gifts.some((g) => g.trait === 'Toughness')) roles.push('protector');
  if (damage.some((a) => a.rank >= c.pl - 2)) roles.push('striker');
  if (c.d.defenses.Toughness >= c.pl + 2 || c.impervious > 0 || c.sustainedProtection >= c.pl / 2) roles.push('tank');
  return roles;
}

/**
 * Roles whose weight is not ROLE_WEIGHT. A control is already valued by the turns it takes off the enemy, measured turn by
 * turn (control-stop.js), so a controller's extra 15 percent counted the same thing twice: with it, five mixed match-ups
 * won 36.0 percent of 12000 fights, 37.2 without (standard error 0.44); the healer and the other roles lost nothing from theirs.
 */
const OWN_WEIGHT = { controller: 1 };

/** The weight c puts on a kind of choice: ROLE_WEIGHT when it has the role (1 for a controller, see above), else 1. */
export const roleWeight = (c, role) => ((c.roles || []).includes(role) ? OWN_WEIGHT[role] ?? ROLE_WEIGHT : 1);
