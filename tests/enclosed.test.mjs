import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { ARENA, ENCLOSED_ARENA, arenaOf, createBattle, addCombatant, makeCombatant, startBattle, runRound, runToEnd, placeAll, serializeBattle, reviveBattle } from '../src/engine/battle.js';

// Two hand-made fighters: a melee brute with no powers and a glass-cannon archer-type.
const bruiser = () => ({
  name: 'Bruiser', pl: 10,
  abilities: { Strength: 8, Stamina: 8, Agility: 2, Dexterity: 0, Fighting: 8, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 2, Parry: 6, Fortitude: 6, Will: 2 },
  skills: [], advantages: [], powers: [],
});
const shooter = () => ({
  name: 'Shooter', pl: 10,
  abilities: { Strength: 0, Stamina: 4, Agility: 6, Dexterity: 6, Fighting: 2, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 6, Parry: 2, Fortitude: 4, Will: 2 },
  skills: [{ name: 'Ranged Combat', spec: 'Blast', ranks: 4 }],
  advantages: [],
  powers: [{ name: 'Blast', effect: 'Damage', rank: 10, range: 'Ranged', role: 'attack', extras: [], flaws: [] }],
});

const BRUISER_ID = 'bruiser-1';
const SHOOTER_ID = 'shooter-1';
// Pinned seed. The Shooter acts first in round 1 and can daze the Bruiser, which costs the Bruiser its attack,
// so the round-1 test needs a seed where that does not happen (checked: 21 of 30 seeds tried work).
const SEED = 'enclosed-2';

function arena({ enclosed = false, seed = SEED, enclosedAfterAdd = false } = {}) {
  const b = createBattle({ seed, name: 'Enclosed test' });
  if (enclosed && !enclosedAfterAdd) b.options.enclosed = true;
  addCombatant(b, makeCombatant(R, bruiser(), { id: BRUISER_ID, team: 'A', style: 'brawler' }));
  addCombatant(b, makeCombatant(R, shooter(), { id: SHOOTER_ID, team: 'B', style: 'blaster' }));
  if (enclosed && enclosedAfterAdd) { b.options.enclosed = true; placeAll(b); }
  return b;
}
const pos = (b, id) => b.combatants.find((c) => c.id === id).pos;
// A normal attack is logged as 'hit' or 'miss'; 'attack' is used for special attacks (holds, area).
// A trip is also a close attack (it starts with an attack check against Parry), logged with the trip result.
const bruiserAttacks = (b) => b.log.filter((e) => e.actor === BRUISER_ID && (['attack', 'hit', 'miss'].includes(e.kind) || /tries to trip/.test(e.text)));

// The first fighter of team B is nudged one zone toward the middle by the spread rule, so with 8 zones it stands at 5 (ARENA - 3), as before this feature.
test('open ground: team A starts at zone 1, team B at zone 5, arena is ARENA (default placement unchanged)', () => {
  const b = arena();
  assert.equal(b.options.enclosed, false);
  assert.equal(pos(b, BRUISER_ID), 1);
  assert.equal(pos(b, SHOOTER_ID), ARENA - 3);
  assert.equal(arenaOf(b), ARENA);
  assert.equal(ARENA, 8);
});

test('enclosed: placeAll puts the teams at zones 0 and 1 on a two-zone line', () => {
  for (const afterAdd of [false, true]) {
    const b = arena({ enclosed: true, enclosedAfterAdd: afterAdd });
    assert.equal(pos(b, BRUISER_ID), 0, `bruiser, afterAdd=${afterAdd}`);
    assert.equal(pos(b, SHOOTER_ID), 1, `shooter, afterAdd=${afterAdd}`);
    assert.equal(arenaOf(b), ENCLOSED_ARENA);
  }
  assert.equal(ENCLOSED_ARENA, 2);
});

test('enclosed: a speed 1 brawler attacks in round 1; on open ground it is still closing', () => {
  const enc = arena({ enclosed: true });
  startBattle(enc, R);
  runRound(enc, R);
  const hits = bruiserAttacks(enc);
  assert.ok(hits.length >= 1, 'bruiser attacks in round 1 when enclosed');
  assert.ok(hits.every((e) => e.round === 1));

  const open = arena();
  startBattle(open, R);
  runRound(open, R);
  assert.equal(bruiserAttacks(open).length, 0, 'bruiser spends round 1 closing on open ground');
  assert.ok(open.round >= 2 || open.status === 'over');
});

test('enclosed: startBattle logs the Enclosed space note, open ground does not', () => {
  const enc = arena({ enclosed: true });
  startBattle(enc, R);
  const notes = enc.log.filter((e) => e.kind === 'note' && e.text.startsWith('Enclosed space:'));
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /nobody can keep their distance/);

  const open = arena();
  startBattle(open, R);
  assert.equal(open.log.filter((e) => e.text.startsWith('Enclosed space:')).length, 0);
});

test('enclosed: nobody leaves zones 0..1 during or at the end of a fight', () => {
  const b = arena({ enclosed: true });
  startBattle(b, R);
  const inside = (label) => {
    for (const c of b.combatants) assert.ok(c.pos >= 0 && c.pos <= 1, `${c.name} at ${c.pos} ${label}`);
  };
  inside('at start');
  let rounds = 0;
  while (b.status === 'running' && rounds++ < 30) { runRound(b, R); inside(`after round ${rounds}`); }
  runToEnd(b, R);
  inside('at the end');
  assert.equal(b.status, 'over');
});

test('enclosed survives save and load: option kept and arena is two zones', () => {
  const b = arena({ enclosed: true });
  const data = JSON.parse(JSON.stringify(serializeBattle(b)));
  const back = reviveBattle(R, data);
  assert.equal(back.options.enclosed, true);
  assert.equal(arenaOf(back), ENCLOSED_ARENA);

  const open = reviveBattle(R, JSON.parse(JSON.stringify(serializeBattle(arena()))));
  assert.equal(open.options.enclosed, false);
  assert.equal(arenaOf(open), ARENA);
});
