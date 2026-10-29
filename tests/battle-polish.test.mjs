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

test('a thrower who is out of range closes to short range, not into melee', () => {
  const b = createBattle({ seed: 'polish-close' });
  // A flier: fast enough that closing "all the way" would carry it into the brawler's zone this turn.
  const flight = { name: 'Flight', effect: 'Flight', rank: 9, role: 'movement', extras: [], flaws: [] };
  addCombatant(b, makeCombatant(R, body([blast, flight]), { id: 'S', team: 'A', style: 'blaster' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
  startBattle(b, R);
  const [s, t] = ['S', 'B'].map((id) => b.combatants.find((c) => c.id === id));
  assert.ok(s.speed * 2 >= 6, 'the test needs a flier who could reach melee in one turn');
  s.pos = 0; t.pos = 6; // six zones apart: beyond long range
  b.order = ['S', 'B']; b.turn = 0;
  step(b, R);
  assert.ok(s.pos < t.pos, 'the thrower must not walk into the brawler\'s zone');
  assert.equal(t.pos - s.pos >= 1, true);
  const moved = b.log.find((e) => e.actor === 'S' && e.kind === 'move');
  if (moved) assert.doesNotMatch(moved.text, /all the way/);
  // Beyond long range there is no attack at all: the shot is made only after moving into range.
  for (const e of b.log.filter((x) => x.actor === 'S' && ['hit', 'miss'].includes(x.kind))) {
    for (const d of e.dice || []) assert.ok(d.mod > -20, `fired from out of range: ${e.text}`);
  }
  assert.ok(t.pos - s.pos <= 5, 'the shooter should have moved into range');
});

test('a brawler out of reach still closes all the way in', () => {
  const b = createBattle({ seed: 'polish-close-2' });
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'A', style: 'brawler' }));
  addCombatant(b, makeCombatant(R, body([blast]), { id: 'S', team: 'B', style: 'blaster' }));
  startBattle(b, R);
  const [br, s] = ['B', 'S'].map((id) => b.combatants.find((c) => c.id === id));
  br.pos = 2; s.pos = 3;
  b.order = ['B', 'S']; b.turn = 0;
  step(b, R);
  assert.equal(br.pos, s.pos);
});

test('wooden weapons are wood (Toughness 3) whatever the prefix, everything else is steel (9)', async () => {
  const { equipmentToughness } = await import('../src/engine/battle/items.js');
  for (const name of ['Bow', 'Longbow', 'Shortbow', 'Crossbow', 'Compound Bow', 'Quarterstaff', 'Bo Staff', 'Club', 'War Clubs']) assert.equal(equipmentToughness(name), 3, name);
  for (const name of ['Revolver', 'Elbow Blade', 'Katana', 'Rainbow Gun']) assert.equal(equipmentToughness(name), 9, name);
});
