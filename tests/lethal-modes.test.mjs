// Lethal damage in the other places a fight is set up: tournaments (a setting of every match), city war (a setting of the war,
// kept in each planned fight, with the dead staying dead when their team rests) and the fight record (the options it keeps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import * as T from '../src/engine/tournament.js';
import { buildGame } from '../src/engine/tournament/game.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/engine/tournament/state.js';
import { createCityWar, addTeam } from '../src/engine/citywar.js';
import { planFight, buildFightBattle, applyOutcome, playFight } from '../src/engine/citywar/fight.js';
import { recover } from '../src/engine/citywar/step.js';
import { fightRecord } from '../src/engine/records/record.js';
import { createBattle, addCombatant, makeCombatant, runToEnd } from '../src/engine/battle.js';
import { bruiser, weakling, entrants } from './helpers/tournament.mjs';

test('tournament: Lethal damage is off by default, a setting that is kept, and reaches every game\'s battle', () => {
  assert.equal(DEFAULT_SETTINGS.lethal, false);
  assert.equal(normalizeSettings({}).lethal, false);
  assert.equal(normalizeSettings({ lethal: true }).lethal, true);
  const t = T.createTournament({ seed: 'lethal', format: 'single', entrants: entrants(2, bruiser), settings: { lethal: true } });
  assert.equal(t.settings.lethal, true);
  const [A, B] = t.entrants;
  assert.equal(buildGame(t, R, A, B, 'g1').options.lethal, true);
  const plain = T.createTournament({ seed: 'plain', format: 'single', entrants: entrants(2, bruiser) });
  assert.equal(buildGame(plain, R, plain.entrants[0], plain.entrants[1], 'g1').options.lethal, false);
});

function war(lethal) {
  const w = createCityWar({ seed: 'dead' });
  w.lethal = lethal;
  addTeam(w, { name: 'Reds', members: [bruiser('Red')], x: 0, y: 0 });
  addTeam(w, { name: 'Blues', members: [weakling('Blue'), weakling('Blue2')], x: 1, y: 0 });
  return w;
}

test('city war: the war\'s setting is kept in each planned fight and sets the battle\'s option', () => {
  for (const lethal of [false, true]) {
    const w = war(lethal);
    const rec = planFight(w, w.teams[0], w.teams[1]);
    assert.equal(rec.lethal, lethal);
    assert.equal(buildFightBattle(w, R, rec).options.lethal, lethal);
  }
  assert.equal(createCityWar({}).lethal, false);
});

test('city war: someone who died stays out of the war, and a rest does not bring them back', () => {
  const w = war(true);
  const rec = planFight(w, w.teams[0], w.teams[1]);
  const b = playFight(w, R, rec);
  applyOutcome(w, b, rec);
  const blues = w.teams[1];
  const dead = b.combatants.filter((c) => c.dead).map((c) => c.id);
  const states = blues.state.filter((s) => s.dead).length;
  assert.equal(states, dead.filter((id) => id.startsWith(blues.id)).length, 'the war remembers who died');
  assert.ok(dead.length >= 1, 'a bruiser against weaklings in a lethal fight kills someone');
  assert.ok(b.log.some((e) => /^Dead: /.test(e.text)), 'the log says who died');
  recover(w, blues); // the team rests: the knocked out come back, the dead do not
  assert.equal(blues.state.filter((s) => s.dead && s.out).length, states, 'the dead stay out');
  assert.equal(blues.state.filter((s) => !s.dead && s.out).length, 0, 'everyone else is back on their feet');
  const off = war(false);
  const rec2 = planFight(off, off.teams[0], off.teams[1]);
  const b2 = playFight(off, R, rec2);
  assert.equal(b2.combatants.filter((c) => c.dead).length, 0, 'nobody dies with the option off');
});

test('the fight record keeps the Lethal damage option and the environment', () => {
  const b = createBattle({ seed: 'rec-lethal' });
  Object.assign(b.options, { lethal: true, environment: 'aerial', scale: 'street' });
  addCombatant(b, makeCombatant(R, bruiser('One'), { id: 'A0', team: 'A' }));
  addCombatant(b, makeCombatant(R, weakling('Two'), { id: 'B0', team: 'B' }));
  runToEnd(b, R);
  const rec = fightRecord(b, { date: '2026-03-01T12:00:00.000Z' });
  assert.equal(rec.options.lethal, true);
  assert.equal(rec.options.environment, 'aerial');
  const plain = createBattle({ seed: 'rec-plain' });
  assert.equal(fightRecord(plain).options.lethal, false);
  assert.equal(fightRecord(plain).options.environment, null);
});
