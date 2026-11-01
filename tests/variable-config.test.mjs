import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { checkLimits } from '../src/engine/limits.js';
import { deriveAll } from '../src/engine/derive.js';
import { costBreakdown } from '../src/engine/costs.js';
import { makeCombatant } from '../src/engine/battle/combatant.js';
import { addConfig, removeConfig, duplicateConfig, configCost, configCapacity, setActiveConfig, allConfigs, configsText, switchAction } from '../src/engine/variable-config.js';
import { withActive, asBuilt, stripTemp } from '../src/engine/active-powers.js';
import { statBlockText } from '../src/engine/render.js';

const blast = (rank, extra = {}) => ({ name: 'Omni Blast', effect: 'Damage', rank, range: 'Ranged', extras: [], flaws: [], descriptors: ['cosmic'], ...extra });
const flight = (rank) => ({ name: 'Omni Flight', effect: 'Flight', rank, extras: [], flaws: [], descriptors: ['cosmic'] });

/** A legal PL 10 character with a Variable 6 (30 points to allocate) that has two configurations. */
function omni() {
  const ch = generateCharacter(R, { pl: 10, seed: 'variable-menu' });
  ch.abilities.Dexterity = 4;
  const v = { name: 'Cosmic Power', effect: 'Variable', rank: 6, extras: [], flaws: [], descriptors: ['cosmic'], alternates: [] };
  addConfig(v, { name: 'Blaster', powers: [blast(6)] });
  addConfig(v, { name: 'Flier', powers: [flight(10)] });
  ch.powers = [...(ch.powers || []), v];
  ch.npc = true; // the point budget is not what these tests are about
  return ch;
}
const variable = (ch) => ch.powers.find((p) => p.effect === 'Variable');

test('a Variable holds 5 points per rank, and a configuration costs the full price of its powers', () => {
  const ch = omni();
  const v = variable(ch);
  assert.equal(configCapacity(v), 30);
  assert.equal(configCost(v.configs[0], R), 12, 'ranged Damage 6 costs 2 per rank');
  assert.equal(configCost(v.configs[1], R), 20, 'Flight 10 costs 2 per rank');
  assert.equal(allConfigs(ch, R).length, 2);
  assert.equal(switchAction(v), 'standard');
});

test('a configuration over rank x 5 is an error', () => {
  const ch = omni();
  variable(ch).configs[0].powers = [blast(16)]; // 32 points
  const over = checkLimits(ch, R).filter((i) => i.rule === 'variable');
  assert.equal(over.length, 1);
  assert.equal(over[0].severity, 'error');
  assert.match(over[0].message, /"Blaster" costs 32 power points; Cosmic Power 6 has 30/);
});

test('configurations are held to the power level limits, as if they were on', () => {
  const ch = omni();
  variable(ch).configs[0].powers = [blast(14)]; // +4 attack + 14 = 18 ... raise Dex to break it
  ch.abilities.Dexterity = 8;
  const pl = checkLimits(ch, R).filter((i) => i.pl && i.message.startsWith('Cosmic Power › Blaster:'));
  assert.ok(pl.length >= 1, 'the Blaster configuration breaks the attack limit');
  assert.ok(!checkLimits(ch, R).some((i) => i.message.startsWith('Cosmic Power › Flier')), 'the Flier configuration is fine');
});

test('the active configuration counts on the sheet but costs nothing on the build', () => {
  const ch = omni();
  const before = costBreakdown(ch, R).total;
  assert.ok(!deriveAll(ch, R).attacks.some((a) => a.name === 'Omni Blast'));
  const on = setActiveConfig(ch, 'Cosmic Power', variable(ch).configs[0].id);
  assert.equal(variable(ch).activeConfig, undefined, 'the original is not changed');
  const atk = deriveAll(on, R).attacks.find((a) => a.name === 'Omni Blast');
  assert.ok(atk, 'its attack is on the sheet');
  assert.equal(atk.rank, 6);
  assert.equal(costBreakdown(on, R).total, before);
  assert.equal(costBreakdown(withActive(on), R).total, before, 'even after the powers are put in');
  const off = setActiveConfig(on, 'Cosmic Power', null);
  assert.equal(variable(off).activeConfig, undefined);
  assert.ok(!deriveAll(off, R).attacks.some((a) => a.name === 'Omni Blast'));
});

test('withActive is safe to apply twice, and asBuilt and stripTemp take it back out', () => {
  const base = omni();
  const ch = setActiveConfig(base, null, variable(base).configs[0].id);
  const w = withActive(ch);
  assert.equal(withActive(w), w);
  assert.equal(w.powers.filter((p) => p.temp).length, 1);
  assert.equal(stripTemp(w).powers.filter((p) => p.temp).length, 0);
  const b = asBuilt(w);
  assert.equal(b.powers.filter((p) => p.temp).length, 0);
  assert.equal(variable(b).activeConfig, undefined);
});

test('a configuration that is on does not count as a build error, but its limits are still checked', () => {
  const ch = omni();
  ch.abilities.Dexterity = 8;
  variable(ch).configs[0].powers = [blast(14)];
  const on = setActiveConfig(ch, null, variable(ch).configs[0].id);
  const msgs = checkLimits(on, R).map((i) => i.message);
  assert.ok(msgs.some((m) => m.startsWith('Cosmic Power › Blaster:')));
  assert.ok(!msgs.some((m) => m.startsWith('Omni Blast:')), 'not reported again as a power of the build');
});

test('a pool Variable: the active configuration and placed points share rank x 5', () => {
  const ch = omni();
  const v = variable(ch);
  v.pool = true;
  v.placed = [{ target: 'Strength', points: 5 }]; // 10 pp
  let on = setActiveConfig(ch, null, v.configs[1].id); // Flier, 20 pp
  assert.ok(!checkLimits(on, R).some((i) => i.rule === 'variable'));
  variable(on).placed = [{ target: 'Strength', points: 6 }]; // 12 pp
  on = setActiveConfig(on, null, variable(on).configs[1].id);
  assert.ok(checkLimits(on, R).some((i) => i.rule === 'variable' && /plus 12 pp placed/.test(i.message)));
});

test('add, copy and remove configurations', () => {
  const ch = omni();
  const v = variable(ch);
  const copy = duplicateConfig(v, v.configs[0].id);
  assert.equal(copy.name, 'Blaster (copy)');
  assert.notEqual(copy.id, v.configs[0].id);
  v.activeConfig = copy.id;
  removeConfig(v, copy.id);
  assert.equal(v.activeConfig, undefined);
  assert.equal(v.configs.length, 2);
  removeConfig(v, v.configs[0].id); removeConfig(v, v.configs[0].id);
  assert.equal(v.configs, undefined);
});

test('the Battle Room fights with the configuration that is on, instead of generic stunts', () => {
  const ch = omni();
  const on = setActiveConfig(ch, null, variable(ch).configs[0].id);
  const c = makeCombatant(R, on, { style: 'omni' });
  assert.ok(c.attacks.some((a) => a.name === 'Omni Blast' && a.rank === 6));
  assert.ok(!c.attacks.some((a) => a.stunt), 'no generic omni stunts when there is a menu');
  const flier = makeCombatant(R, setActiveConfig(ch, null, variable(ch).configs[1].id), { style: 'omni' });
  assert.ok(flier.flying, 'Flight from the Flier configuration');
  // A Variable with no menu still improvises
  const plain = omni(); delete variable(plain).configs;
  assert.ok(makeCombatant(R, plain, { style: 'omni' }).attacks.some((a) => a.stunt));
});

test('the stat block lists the menu', () => {
  const ch = setActiveConfig(omni(), null, null);
  const v = variable(ch);
  assert.match(configsText(v, R), /^Configurations \(30 pp\): Blaster \(Omni Blast \(Damage 6\); 12 pp\); Flier/);
  assert.match(statBlockText(ch, R), /Configurations \(30 pp\): Blaster/);
});

test('a legal rolled character stays legal with an empty menu', () => {
  const ch = generateCharacter(R, { pl: 10, seed: 'variable-menu-2' });
  const before = checkLimits(ch, R).map((i) => i.message);
  ch.powers.push({ name: 'V', effect: 'Variable', rank: 1, extras: [], flaws: [], configs: [] });
  const after = checkLimits(ch, R).filter((i) => i.rule !== 'budget').map((i) => i.message);
  assert.deepEqual(after.filter((m) => !before.includes(m)), []);
});
