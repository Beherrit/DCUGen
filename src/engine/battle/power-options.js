// The turn options that come from the power effects with their own action: Summon and Duplication, Create, Illusion and
// Environment, and (as they are built) the changes of form. Each option is { kind, u, run }, scored in the units of an attack's
// expected degrees so utility.js can weigh it beside the best attack, a heal and a buff.

import { summonOption } from './utility-summon.js';
import { createOption } from './utility-create.js';
import { illusionOption } from './utility-illusion.js';
import { environmentOption } from './utility-environment.js';

/** Every power option c could take this turn (null entries left out). */
export function powerOptions(b, R, c, enemies, mode) {  return [summonOption(b, R, c, enemies, mode), createOption(b, c, enemies), illusionOption(b, c, enemies), environmentOption(b, c, enemies)].filter(Boolean);
}
