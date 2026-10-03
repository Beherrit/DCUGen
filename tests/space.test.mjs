import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { vehicleCost, vehicleIssues, vehicleFeature, vehicleStatLine } from '../src/engine/vehicles.js';
import {
  travelTime, travelTimeRank, spaceTravelTime, randomPlanet, randomSpaceship, sensorRange, distanceRankFromMiles,
  rankToMiles, timeText, spaceRoutes, shipClasses, spacecraft, SPACE_TRAVEL_SPEED,
} from '../src/engine/space.js';

const V = R.raw.vehicles;
const S = R.raw.spaceRules;
const SPACE = V.premade.filter((v) => v.category === 'Space');
const NEW = SPACE.filter((v) => v.passengers !== undefined && v.source === 'DCUGen');

const CLASSES = ['Fighter', 'Interceptor', 'Bomber', 'Shuttle', 'Dropship', 'Scout', 'Courier', 'Yacht', 'Freighter', 'Hauler', 'Tanker',
  'Mining Ship', 'Salvage Tug', 'Medical Frigate', 'Corvette', 'Frigate', 'Destroyer', 'Cruiser', 'Battlecruiser', 'Carrier', 'Dreadnought',
  'Colony Ship', 'Generation Ship', 'Science Vessel', 'Prison Barge', 'Pirate Raider', 'Smuggler', 'Racer', 'Escape Pod', 'Lifeboat',
  'Mobile Station', 'Starbase', 'Orbital Platform', 'Asteroid Fortress', 'Alien Saucer', 'Living Ship', 'Crystal Ship', 'Swarm Ship',
  'Hive Ship', 'Seedship', 'Ancient Derelict', 'Planet-killer'];

test('space rules are built into the rules data', () => {
  assert.ok(S && S.rules.length >= 40, 'space_rules.json loaded');
  const groups = new Set(S.rules.map((r) => r.group));
  for (const g of ['Distances & travel', 'Sensors & detection', 'Space combat', 'Environment & hazards', 'Ships & crews', 'Alien worlds']) assert.ok(groups.has(g), g);
  const ids = new Set();
  for (const r of S.rules) {
    assert.ok(r.id && r.title && r.text && r.source, r.id);
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
    assert.match(r.source, /DCA|DCUGen/, r.id);
    if (r.table) for (const row of r.table.rows) assert.equal(row.length, r.table.columns.length, `${r.id}: ${row[0]}`);
  }
});

test('about sixty new spacecraft, every one with a class and valid features', () => {
  assert.ok(NEW.length >= 55, `${NEW.length} new spacecraft`);
  for (const v of NEW) {
    assert.ok(CLASSES.includes(v.class), `${v.name}: class ${v.class}`);
    assert.ok(['Sci-Fi', 'Alien', 'Cosmic'].includes(v.setting), `${v.name}: setting ${v.setting}`);
    assert.ok(v.crew && v.passengers && v.summary, v.name);
    for (const f of v.features) assert.ok(vehicleFeature(f.name, R), `${v.name}: ${f.name}`);
    assert.deepEqual(vehicleIssues(v, R), [], v.name);
  }
  for (const c of CLASSES) assert.ok(SPACE.some((v) => v.class === c), `class ${c} has a ship`);
  for (const v of SPACE) assert.ok(v.class, `${v.name} has a class`);
  assert.equal(shipClasses(R).length, CLASSES.length);
});

test('spacecraft costs are computed by vehicleCost', () => {
  for (const v of SPACE) {
    const c = vehicleCost(v, R);
    assert.equal(v.cost, c.total, v.name);
    assert.equal(c.total, c.breakdown.reduce((s, b) => s + b.cost, 0), v.name);
    assert.match(vehicleStatLine(v, R), /Cost: \d+ ep$/);
  }
  // Hand check, Arrowhawk Starfighter: Huge 2 + Str 9 (+1) + Flight 14 (28) + Defense 8 (+2) + Toughness 11 (+2)
  // + Ejection System 1 + Twin Blasters (Ranged Damage 10 = 20, one Alternate Effect +1) + Targeting Sensors (Senses 6) = 63
  const arrow = SPACE.find((v) => v.id === 'arrowhawk-starfighter');
  assert.equal(vehicleCost(arrow, R).total, 2 + 1 + 28 + 2 + 2 + 1 + 21 + 6);
  // Space Travel is a Movement power: 2 points per rank
  const courier = SPACE.find((v) => v.id === 'quicksilver-courier');
  assert.ok(vehicleCost(courier, R).breakdown.some((b) => b.label === 'Power: Hyperdrive' && b.cost === 6));
});

test('new space features are 1-point features marked DCUGen', () => {
  for (const name of ['Artificial Gravity', 'Hangar Bay', 'Jump Computer', 'Recycling Life Support', 'Docking Collar', 'Fuel Scoop']) {
    const f = vehicleFeature(name, R);
    assert.ok(f, name);
    assert.equal(f.cost, 1, name);
    assert.match(f.source, /^DCUGen/, name);
  }
});

test('travel time follows the Measurements Table (time = distance - speed)', () => {
  // DCA 12: a normal human (speed 0) walks 30 miles (distance 13) in about 16 hours
  assert.match(travelTime(R, { distanceRank: 13, speedRank: 0 }), /^16 hours/);
  // DCA 11: Flight 12 covers 8,000 miles (rank 21) in an hour (time 9)
  assert.match(travelTime(R, { distanceRank: 21, speedRank: 12 }), /^1 hour/);
  // DCA 10: Speed 14 crosses 30 miles in time rank -1, 3 seconds
  assert.match(travelTime(R, { distanceRank: 13, speedRank: 14 }), /^3 seconds/);
  assert.equal(travelTimeRank({ distanceRank: 26, speedRank: 12 }), 14);
  assert.equal(timeText(R, 14), '1 day');
  assert.equal(timeText(R, 31), '400 years');
  // distance ranks round up (DCA 10): 6 miles is rank 11, 30 miles rank 13, the Moon rank 26
  assert.equal(distanceRankFromMiles(R, 6), 11);
  assert.equal(distanceRankFromMiles(R, 30), 13);
  assert.equal(distanceRankFromMiles(R, 238900), 26);
  assert.equal(distanceRankFromMiles(R, 4e6), 30);
  assert.equal(distanceRankFromMiles(R, 4.1e6), 31);
  assert.equal(rankToMiles(R, 32), 16e6);
});

test('named routes and Space Travel times', () => {
  assert.ok(spaceRoutes(R).length >= 10);
  const moon = spaceTravelTime(R, { route: 'earth-moon', flightRank: 12 });
  assert.equal(moon.distanceRank, 26);
  assert.equal(moon.best.time, '1 day');
  const star = spaceTravelTime(R, { route: 'nearest-star', spaceTravelRank: 2 });
  assert.equal(star.best.timeRank, star.distanceRank - SPACE_TRAVEL_SPEED[2]);
  assert.equal(star.best.time, '16 hours');
  // Space Travel 1 only reaches planets in one system (DCA 110)
  const far = spaceTravelTime(R, { route: 'nearest-star', spaceTravelRank: 1 });
  assert.equal(far.best, null);
  assert.match(far.text, /out of reach/);
  // the faster usable mode wins
  const mars = spaceTravelTime(R, { route: 'earth-mars', spaceTravelRank: 1, flightRank: 16 });
  assert.equal(mars.best.mode, 'Space Travel 1');
  // the stored travel table agrees with the engine
  const table = S.rules.find((r) => r.id === 'space-travel-table').table;
  const col = table.columns.indexOf('Space Travel 3');
  const row = table.rows.find((r) => r[0] === 'Across the galaxy');
  assert.equal(row[col], spaceTravelTime(R, { route: 'across-galaxy', spaceTravelRank: 3 }).best.time);
  assert.throws(() => spaceTravelTime(R, { route: 'nowhere', flightRank: 10 }));
});

test('sensor range scales by 10 per Extended rank', () => {
  assert.equal(sensorRange(R, 0).feetPerPenalty, 10);
  assert.equal(sensorRange(R, { extended: 2 }).feetPerPenalty, 1000);
  const radar = sensorRange(R, 'Radio (radar), Accurate radio, Extended radio 6');
  assert.equal(radar.extended, 6);
  assert.match(radar.perPenalty, /1,894 miles/);
  assert.ok(radar.traits.some((t) => /accurate/.test(t)));
  assert.match(sensorRange(R, { detect: 'life signs' }).text, /touch/);
  assert.match(sensorRange(R, { name: 'Sensor Suite', effect: 'Senses', rank: 9, detail: 'Radio, Extended radio 12' }).routine, /light-year|AU/);
});

test('randomPlanet is deterministic and fills every table', () => {
  const a = randomPlanet(R, { seed: 'tatooine-not' });
  assert.deepEqual(a, randomPlanet(R, { seed: 'tatooine-not' }));
  assert.notDeepEqual(a, randomPlanet(R, { seed: 'another-world' }));
  for (const k of ['type', 'gravity', 'atmosphere', 'temperature', 'hazard', 'inhabitants', 'interest']) {
    assert.ok(a[k].result, k);
    assert.ok(a[k].roll >= 1 && a[k].roll <= 20, k);
  }
  for (let i = 0; i < 50; i++) assert.ok(randomPlanet(R, { seed: i }).summary.length > 40);
});

test('randomSpaceship is deterministic, filtered and priced', () => {
  assert.deepEqual(randomSpaceship(R, { seed: 'same' }), randomSpaceship(R, { seed: 'same' }));
  for (let i = 0; i < 40; i++) {
    const v = randomSpaceship(R, { seed: `s-${i}` });
    assert.equal(v.category, 'Space');
    assert.deepEqual(vehicleIssues(v, R), [], v.name);
    assert.equal(v.cost, vehicleCost(v, R).total);
    assert.ok(v.features.length - (spacecraft(R).find((x) => x.name === v.name).features.length) <= 2);
  }
  for (const c of CLASSES) assert.equal(randomSpaceship(R, { seed: c, shipClass: c }).class, c);
  for (const setting of ['Alien', 'Cosmic', 'Sci-Fi']) assert.equal(randomSpaceship(R, { seed: setting, setting }).setting, setting);
});
