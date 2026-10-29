// Seeded mixed fights for the grid tests: a pool of generated heroes and catalog creatures, and a fight builder that
// varies the match-up, the scale, scenery, knockback and team tactics with the fight number.
import { RULES as R } from '../../src/engine/index.js';
import { generateCharacter } from '../../src/engine/generator.js';
import { catalogEntries } from '../../src/engine/workshop.js';
import { catalogToCharacter } from '../../src/engine/catalog.js';
import { createBattle, addCombatant, makeCombatant, addCover, COVER_KINDS } from '../../src/engine/battle.js';

export { R };
const ARCHES = ['paragon', 'powerhouse', 'speedster', 'blaster', 'crimefighter', 'martialartist', 'weaponmaster', 'gadgeteer', 'battlesuit', 'mystic', 'psychic', 'shapeshifter', 'sizechanger', 'totem', 'elemental', 'infiltrator', 'mastermind', 'healer', 'android', 'robot'];
const TACTICS = ['none', 'line', 'kite', 'cover', 'bodyguard', 'withdraw', 'focus', 'alpha', 'flank', 'intimidate'];
let pool = null;

/** The characters fights are drawn from, built once. */
function characters() {
  if (pool) return pool;
  const entries = catalogEntries(R);
  pool = {
    heroes: ARCHES.flatMap((a, i) => [0, 1].map((k) => generateCharacter(R, { seed: `grid-${a}-${k}`, archetype: a, pl: 8 + ((i + k) % 5) }))),
    beasts: Array.from({ length: 12 }, (_, k) => catalogToCharacter(entries[(k * 41 + 3) % entries.length])),
  };
  return pool;
}

/** A tiny deterministic mixer so the same fight number always builds the same fight. */
const pick = (n, salt, len) => Math.abs(Math.imul(n + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) % len;
const clone = (ch) => JSON.parse(JSON.stringify(ch));

/** Build fight number n at a scale ('street', 'block', 'district'); the options vary with n. */
export function buildFight(n, scale) {
  const { heroes, beasts } = characters();
  const b = createBattle({ seed: `grid-${scale}-${n}`, name: `grid ${n}` });
  b.options.scale = scale;
  b.options.knockback = n % 5 === 0;
  b.options.enclosed = n % 7 === 3;
  if (n % 6 === 1) b.options.ambush = 'A';
  const shape = n % 4;
  const sides = shape === 0 ? [[heroes], [heroes]] : shape === 1 ? [[heroes, heroes], [beasts, beasts, beasts]] : shape === 2 ? [[heroes], [heroes], [heroes]] : [[heroes, heroes, heroes], [heroes, heroes, heroes]];
  const teams = ['A', 'B', 'C'];
  sides.forEach((sources, t) => sources.forEach((src, k) => {
    const ch = clone(src[pick(n, t * 7 + k + 1, src.length)]);
    addCombatant(b, makeCombatant(R, ch, { id: `${teams[t]}${k}`, team: teams[t] }));
  }));
  if (n % 3 === 0) b.options.teamTactics = { A: TACTICS[pick(n, 99, TACTICS.length)], B: TACTICS[pick(n, 17, TACTICS.length)] };
  if (n % 4 === 2) for (let k = 0; k < 4; k++) addCover(b, COVER_KINDS[pick(n, 30 + k, COVER_KINDS.length)].id, 1 + pick(n, 50 + k, 10), 1 + pick(n, 70 + k, 10));
  b.trace = [];
  return b;
}
