// Records (or checks) a fixed set of seeded fights, so engine refactors can prove they change nothing.
//   node tools/battle-golden.mjs          write tests/fixtures/battle-golden.json
// tests/battle-golden.test.mjs replays the same fights and compares every log line.
import { writeFileSync, readFileSync } from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { createBattle, addCombatant, makeCombatant, runToEnd } from '../src/engine/battle.js';

const ARCHES = ['paragon', 'powerhouse', 'speedster', 'blaster', 'crimefighter', 'martialartist', 'weaponmaster', 'gadgeteer', 'battlesuit', 'mystic', 'psychic', 'shapeshifter', 'sizechanger', 'totem', 'elemental', 'infiltrator', 'mastermind', 'healer', 'android', 'robot'];
const hero = (arch, i) => generateCharacter(R, { seed: `golden-${arch}-${i}`, archetype: arch, pl: 8 + (i % 5) });
const ballista = () => JSON.parse(readFileSync(new URL('../tests/fixtures/ballista.json', import.meta.url), 'utf8'));

/** The fixed scenarios: name, per-side character builders, and battle options. */
export function scenarios() {
  const es = catalogEntries(R);
  const beast = (k) => catalogToCharacter(es[(k * 37) % es.length]);
  const out = [];
  for (let i = 0; i < 20; i++) {
    const a = ARCHES[i % ARCHES.length]; const b = ARCHES[(i * 7 + 3) % ARCHES.length];
    out.push({ name: `duel ${a} v ${b}`, A: [() => hero(a, i)], B: [() => hero(b, i + 1)], options: {} });
  }
  for (let i = 0; i < 8; i++) {
    out.push({ name: `team v creatures ${i}`, A: [() => hero(ARCHES[i], i), () => hero(ARCHES[i + 8], i)], B: [() => beast(i), () => beast(i + 9), () => beast(i + 17)], options: {} });
  }
  for (let i = 0; i < 6; i++) {
    const opts = [{ enclosed: true }, { ambush: 'A' }, { ambush: 'B', enclosed: true }][i % 3];
    out.push({ name: `ballista v ${ARCHES[i * 3]} ${JSON.stringify(opts)}`, A: [ballista], B: [() => hero(ARCHES[i * 3], i)], options: opts });
  }
  for (let i = 0; i < 6; i++) {
    out.push({ name: `three teams ${i}`, A: [() => hero(ARCHES[i], 1)], B: [() => hero(ARCHES[i + 5], 2)], C: [() => hero(ARCHES[i + 10], 3)], options: {} });
  }
  return out;
}

/** Play one scenario and return its log as plain lines plus the winner. */
export function play(s, idx) {
  const b = createBattle({ seed: `golden-${idx}`, name: s.name });
  Object.assign(b.options, s.options);
  for (const team of ['A', 'B', 'C']) (s[team] || []).forEach((mk, k) => addCombatant(b, makeCombatant(R, mk(), { id: `${team}${k}`, team })));
  runToEnd(b, R);
  return { name: s.name, winner: b.winner, rounds: b.round, log: b.log.map((e) => `${e.round}|${e.kind}|${e.actor || ''}|${e.text}`) };
}

if (process.argv[1]?.endsWith('battle-golden.mjs')) {
  const all = scenarios().map(play);
  writeFileSync(new URL('../tests/fixtures/battle-golden.json', import.meta.url), JSON.stringify(all, null, 1));
  console.log(`recorded ${all.length} fights, ${all.reduce((n, f) => n + f.log.length, 0)} log lines`);
}
