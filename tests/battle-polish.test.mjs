import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, step, addCover, squares, feet, inReach } from '../src/engine/battle.js';

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

test('a blaster uses cover beside it, with the wall between it and the enemy, even without the Take Cover tactic', () => {
  const b = createBattle({ seed: 'polish-cover' });
  addCombatant(b, makeCombatant(R, body([blast]), { id: 'S', team: 'A', style: 'blaster' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
  const piece = addCover(b, 'brick-wall', 2, 5); // the blaster starts at B6 (column 1), the brawler at K6
  addCover(b, 'brick-wall', 0, 5); // a wall on the far side of the blaster gives no cover against the brawler
  const s = oneTurn(b, 'S');
  assert.equal(s.behind, piece.id, 'the blaster should be behind the wall that lies between it and the enemy');
  assert.deepEqual([s.x, s.y], [1, 5], 'and it did not need to move');
});

test('a brawler with no Take Cover tactic does not hide behind cover', () => {
  const b = createBattle({ seed: 'polish-cover-2' });
  addCombatant(b, makeCombatant(R, body([boulder]), { id: 'T', team: 'A', style: 'brawler' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
  addCover(b, 'brick-wall', 2, 5);
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
  b.options.scale = 'district'; // 250 ft squares: nine squares apart is beyond the Blast's 1,000 ft long range
  // A flier: fast enough that closing "all the way" would carry it into the brawler's zone this turn.
  const flight = { name: 'Flight', effect: 'Flight', rank: 9, role: 'movement', extras: [], flaws: [] };
  addCombatant(b, makeCombatant(R, body([blast, flight]), { id: 'S', team: 'A', style: 'blaster' }));
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'B', style: 'brawler' }));
  startBattle(b, R);
  const [s, t] = ['S', 'B'].map((id) => b.combatants.find((c) => c.id === id));
  assert.ok(squares(s, t) * 250 > 1000, 'the shooter starts beyond long range');
  assert.ok(s.moveFt >= 2 * 250 * 9, 'the test needs a flier who could reach melee in one turn');
  b.order = ['S', 'B']; b.turn = 0;
  step(b, R);
  assert.ok(squares(s, t) >= 1, 'the thrower must not walk into the brawler\'s square');
  const moved = b.log.find((e) => e.actor === 'S' && e.kind === 'move');
  if (moved) assert.doesNotMatch(moved.text, /all the way/);
  // Beyond long range there is no attack at all: the shot is made only after moving into range.
  for (const e of b.log.filter((x) => x.actor === 'S' && ['hit', 'miss'].includes(x.kind))) {
    for (const d of e.dice || []) assert.ok(d.mod > -20, `fired from out of range: ${e.text}`);
  }
  assert.ok(feet(b, s, t) <= 1000, 'the shooter should have moved into range');
  assert.equal(squares(s, t), 1, 'and stopped at short range (250 ft), no closer');
});

test('a brawler out of reach still closes all the way in', () => {
  const b = createBattle({ seed: 'polish-close-2' });
  addCombatant(b, makeCombatant(R, body([]), { id: 'B', team: 'A', style: 'brawler' }));
  addCombatant(b, makeCombatant(R, body([blast]), { id: 'S', team: 'B', style: 'blaster' }));
  startBattle(b, R);
  const [br, s] = ['B', 'S'].map((id) => b.combatants.find((c) => c.id === id));
  br.x = 2; br.y = 5; s.x = 4; s.y = 5; // two squares apart
  b.order = ['B', 'S']; b.turn = 0;
  step(b, R);
  assert.ok(inReach(b, br, s), 'the brawler moved up into reach');
});

test('wooden weapons are wood (Toughness 3) whatever the prefix, everything else is steel (9)', async () => {
  const { equipmentToughness } = await import('../src/engine/battle/items.js');
  for (const name of ['Bow', 'Longbow', 'Shortbow', 'Crossbow', 'Compound Bow', 'Quarterstaff', 'Bo Staff', 'Club', 'War Clubs']) assert.equal(equipmentToughness(name), 3, name);
  for (const name of ['Revolver', 'Elbow Blade', 'Katana', 'Rainbow Gun']) assert.equal(equipmentToughness(name), 9, name);
});

test('Evasion adds to the Dodge check against an area but never avoids it entirely (Hero Handbook p76, p126)', () => {
  const bomb = { name: 'Bomb', effect: 'Damage', rank: 8, range: 'Ranged', role: 'attack', extras: [{ name: 'Area', option: 'Burst' }], flaws: [] };
  const dodger = body([], { advantages: [{ name: 'Evasion', rank: 2 }], defenses: { Dodge: 20, Parry: 6 } });
  let halves = 0;
  for (let i = 0; i < 12; i++) {
    const b = createBattle({ seed: `evasion-${i}` });
    addCombatant(b, makeCombatant(R, body([bomb]), { id: 'G', team: 'A', style: 'blaster' }));
    addCombatant(b, makeCombatant(R, dodger, { id: 'D', team: 'B', style: 'duelist' }));
    oneTurn(b, 'G');
    for (const e of b.log.filter((x) => x.target === 'D' && /dives for cover/.test(x.text))) {
      assert.doesNotMatch(e.text, /slips clear/);
      if (/half effect/.test(e.text)) halves++;
    }
  }
  assert.ok(halves > 0, 'the dodger should have made some Dodge checks and taken half effect');
});
