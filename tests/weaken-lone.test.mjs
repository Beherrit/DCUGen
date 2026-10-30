// Weaken in the AI's hands when the team has nothing a lowered trait would help: a lone ghost with only a draining
// touch must still use it, and Weaken Stamina lowers both Toughness and Fortitude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { generateCharacter } from '../src/engine/generator.js';
import { createBattle, addCombatant, makeCombatant, startBattle, runToEnd } from '../src/engine/battle.js';
import { parseWeakenTrait, weakenTraits } from '../src/engine/battle/weaken-traits.js';

const ghost = () => catalogToCharacter(catalogEntries(R).find((e) => e.name === 'Ghost'));

test('Weaken Stamina is read as Stamina and takes Toughness and Fortitude down together', () => {
  assert.equal(parseWeakenTrait('Stamina; resisted by Fortitude'), 'Stamina');
  const t = { weakened: {} };
  weakenTraits(t, 'Stamina', 2);
  assert.deepEqual(t.weakened, { Toughness: 2, Fortitude: 2 });
});

test('a lone ghost whose only usable attack is a Weaken uses it instead of holding every turn', () => {
  let touches = 0; let idle = 0;
  for (let s = 0; s < 6; s++) {
    const b = createBattle({ seed: `lone-ghost-${s}` });
    addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: `lone-ghost-foe-${s}`, archetype: 'martialartist', pl: 6 }), { team: 'A' }));
    addCombatant(b, makeCombatant(R, ghost(), { team: 'B' }));
    startBattle(b, R);
    runToEnd(b, R);
    for (const e of b.log) {
      if (!/^Ghost/.test(e.text)) continue;
      if (/Chilling Touch/.test(e.text)) touches++;
      if (/nothing worth doing/.test(e.text)) idle++;
    }
  }
  assert.ok(touches >= 6, `the ghost used Chilling Touch only ${touches} times in six fights`);
  assert.ok(idle < touches, `it idled ${idle} times against ${touches} touches`);
});
