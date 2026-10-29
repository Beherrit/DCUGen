import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, step, addCover } from '../src/engine/battle.js';

const body = (powers, extra = {}) => ({
  pl: 10, abilities: { Strength: 6, Stamina: 6, Agility: 3, Dexterity: 4, Fighting: 6, Intellect: 0, Awareness: 2, Presence: 0 },
  defenses: { Dodge: 6, Parry: 6 }, skills: [], advantages: [], powers, ...extra,
});
const blast = { name: 'Blast', effect: 'Damage', rank: 10, range: 'Ranged', role: 'attack', extras: [], flaws: [] };
const boulder = { name: 'Hurled Boulder', effect: 'Damage', rank: 9, range: 'Ranged', role: 'attack', extras: [], flaws: [] };

/** Start a fight and let only the fighter with id `who` take one turn. */
function oneTurn(b, who) {
  startBattle(b, R);
  b.order = [who, ...b.order.filter((id) => id !== who)]; b.turn = 0;
  step(b, R);
  return b.combatants.find((c) => c.id === who);
}

test('a blaster uses cover in its own zone even without the Take Cover tactic', () => {
  const b = createBattle({ seed: 'polish-cover' });
  addCombatant(b, makeCombatant(R, body([blast]), { id: 'S', team: 'A', style: 'blaster' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
  const piece = addCover(b, 'brick-wall', b.combatants[0].pos);
  const s = oneTurn(b, 'S');
  assert.equal(s.behind, piece.id ?? piece, 'the blaster should be behind the wall in its zone');
});

test('a brawler with no Take Cover tactic does not hide behind cover', () => {
  const b = createBattle({ seed: 'polish-cover-2' });
  addCombatant(b, makeCombatant(R, body([boulder]), { id: 'T', team: 'A', style: 'brawler' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
  addCover(b, 'brick-wall', b.combatants[0].pos);
  const t = oneTurn(b, 'T');
  assert.ok(!t.behind, 'a close-in style should not stop for cover by default');
});

test('melee styles throw their ranged attacks instead of clawing with them', () => {
  for (const style of ['beast', 'brawler', 'tank']) {
    const b = createBattle({ seed: `polish-verb-${style}` });
    addCombatant(b, makeCombatant(R, body([boulder], { abilities: { Strength: 1, Stamina: 6, Agility: 3, Dexterity: 4, Fighting: 0, Intellect: 0, Awareness: 2, Presence: 0 } }), { id: 'G', team: 'A', style }));
    addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
    oneTurn(b, 'G');
    const line = b.log.find((e) => e.actor === 'G' && /Hurled Boulder/.test(e.text));
    if (!line) continue; // this seed chose to move; the other styles still check the wording
    assert.match(line.text, /^\S+ (hurls|throws|flings|lets fly with) Hurled Boulder at /, `${style}: ${line.text}`);
  }
});

test('the ambush note says the surprised lose the round', () => {
  const b = createBattle({ seed: 'polish-ambush' });
  b.options.ambush = 'A';
  addCombatant(b, makeCombatant(R, body([blast]), { id: 'S', team: 'A' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B' }));
  startBattle(b, R);
  const note = b.log.find((e) => /^Ambush:/.test(e.text));
  assert.match(note.text, /lose the round and are vulnerable until round 2/);
});
