// Favored Foe and Favored Environment (Hero's Handbook p74): +2 on the social skills against the named foe, and +2 on attack
// checks or on defenses in the named environment. The environment is a Battle Room option (b.options.environment).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerArena, who, text } from './helpers/power-arena.mjs';
import { feintPick } from '../src/engine/battle/tricks.js';
import { isFavoredFoe, foeBonus, inFavoredEnvironment, favoredTurn, environmentsOf, ENVIRONMENTS } from '../src/engine/battle/favored.js';
import { defenseOf } from '../src/engine/battle/conditions.js';
import { rollToHit } from '../src/engine/battle/attack-roll.js';
import { dice } from './helpers/power-arena.mjs';

const adv = (name, param) => [{ name, rank: 1, param }];

test('Favored Foe: the foe is matched by its name or type, every word of the advantage must show', () => {
  const b = powerArena([['U', 'A', { advantages: adv('Favored Foe', 'robots') }, { x: 0, y: 0 }], ['Robot Sentinel', 'B', {}, { x: 1, y: 0 }], ['Tom', 'B', {}, { x: 2, y: 0 }]]);
  const u = who(b, 'U');
  assert.equal(isFavoredFoe(u, who(b, 'Robot Sentinel')), true, 'a plural matches the singular');
  assert.equal(isFavoredFoe(u, who(b, 'Tom')), false);
  const two = powerArena([['U', 'A', { advantages: adv('Favored Foe', 'street gangs') }, { x: 0, y: 0 }], ['Street Boss', 'B', {}, { x: 1, y: 0 }], ['Street Gang Thug', 'B', {}, { x: 2, y: 0 }]]);
  assert.equal(isFavoredFoe(who(two, 'U'), who(two, 'Street Boss')), false, 'both words are needed');
  assert.equal(isFavoredFoe(who(two, 'U'), who(two, 'Street Gang Thug')), true);
});

test('Favored Foe: +2 on Deception, Intimidation, Insight and Perception against the foe, nothing on the other skills', () => {
  const b = powerArena([['U', 'A', { advantages: adv('Favored Foe', 'robots') }, { x: 0, y: 0 }], ['Robot', 'B', {}, { x: 1, y: 0 }], ['Man', 'B', {}, { x: 2, y: 0 }]]);
  const [u, r, m] = ['U', 'Robot', 'Man'].map((id) => who(b, id));
  assert.equal(foeBonus(u, r, 'Deception'), 2);
  assert.equal(foeBonus(u, r, 'Athletics'), 0);
  assert.equal(foeBonus(u, m, 'Deception'), 0);
  assert.equal(feintPick(u, r).mine, feintPick(u, m).mine + 2, 'the feint against the favored foe is two better');
});

test('Favored Environment: it matches the arena\'s environment by the words of the advantage, and an enclosed room as enclosed', () => {
  const b = powerArena([['U', 'A', { advantages: adv('Favored Environment', 'underwater') }, { x: 0, y: 0 }], ['T', 'B', {}, { x: 1, y: 0 }]]);
  const u = who(b, 'U');
  assert.equal(inFavoredEnvironment(b, u), false, 'open ground');
  b.options.environment = 'aquatic';
  assert.equal(inFavoredEnvironment(b, u), true);
  b.options.environment = 'aerial';
  assert.equal(inFavoredEnvironment(b, u), false);
  const room = powerArena([['U', 'A', { advantages: adv('Favored Environment', 'cramped indoor rooms') }, { x: 0, y: 0 }], ['T', 'B', {}, { x: 1, y: 0 }]], { enclosed: true });
  assert.deepEqual(environmentsOf(room), ['enclosed']);
  assert.equal(inFavoredEnvironment(room, who(room, 'U')), true);
  assert.ok(ENVIRONMENTS.length >= 5);
});

test('Favored Environment: +2 on the attack check, or +2 on active defenses when hurt or outnumbered, for the round', () => {
  const b = powerArena([['U', 'A', { hp: 0, advantages: adv('Favored Environment', 'in the air') }, { x: 0, y: 0 }], ['T', 'B', {}, { x: 1, y: 0 }]], { environment: 'aerial' });
  const [u, t] = [who(b, 'U'), who(b, 'T')];
  const base = defenseOf(u, 'Parry');
  favoredTurn(b, u, 1, 0); // one foe, no allies: not outnumbered by enough
  assert.equal(u.envAttack, 2);
  assert.equal(defenseOf(u, 'Parry'), base);
  assert.match(text(b), /favored environment: \+2 to attack checks/);
  const atk = u.attacks.find((a) => a.unarmed);
  const notes = [];
  const r = rollToHit(b, u, atk, t, dice(10), { trade: 0, allOut: 0, defensive: 0, charge: false }, 0, notes);
  assert.ok(notes.includes('favored environment: +2'));
  assert.equal(r.mod, atk.bonus + 2);
  u.defMod = 0; u.bruises = 2;
  favoredTurn(b, u, 1, 0); // hurt: it defends instead
  assert.equal(u.envAttack, 0);
  assert.equal(defenseOf(u, 'Parry'), base + 2);
  b.options.environment = null;
  u.defMod = 0;
  favoredTurn(b, u, 1, 0);
  assert.equal(u.envAttack, 0);
  assert.equal(defenseOf(u, 'Parry'), base, 'out of its environment: nothing');
});
