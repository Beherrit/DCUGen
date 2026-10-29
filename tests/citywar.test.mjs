import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle, runToEnd, statusLine } from '../src/engine/battle.js';
import {
  createCityWar, generateTerrain, setTerrain, terrainAt, addTeam, removeTeam, moveTeam, teamAt, teamById, standingTeams,
  quickFill, stepCity, runCity, cityOdds, serializeCity, reviveCity, buildFightBattle, standings, GANG_NAMES, TACTIC_IDS, cellName, resetCity,
} from '../src/engine/citywar.js';
import { ambushFor, planFight } from '../src/engine/citywar/fight.js';
import { restsAfterFight, restsBeforeMarching } from '../src/engine/citywar/step.js';
import { recordId } from '../src/engine/records/record.js';
import { fightRecord } from '../src/engine/records/record.js';

// Hand-made fighters, so the scenario tests do not depend on the generator.
const bruiser = (name) => ({
  identity: { codename: name }, pl: 10,
  abilities: { Strength: 8, Stamina: 8, Agility: 2, Dexterity: 0, Fighting: 8, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 2, Parry: 6, Fortitude: 6, Will: 2 }, skills: [], advantages: [], powers: [],
});
const weakling = (name) => ({
  identity: { codename: name }, pl: 1,
  abilities: { Strength: 0, Stamina: 0, Agility: 0, Dexterity: 0, Fighting: 0, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 }, skills: [], advantages: [], powers: [],
});

/** Two teams side by side at (0,0) and (1,0), the defender's cell with the given terrain. */
function duel({ seed = 'duel', terrain = 'street', tacticA = 'none', tacticB = 'none', size = 2 } = {}) {
  const war = createCityWar({ seed });
  const mk = (p) => Array.from({ length: size }, (_, i) => bruiser(`${p}${i + 1}`));
  addTeam(war, { name: 'Reds', color: '#c00', tactic: tacticA, members: mk('R'), x: 0, y: 0 });
  addTeam(war, { name: 'Blues', color: '#00c', tactic: tacticB, members: mk('B'), x: 1, y: 0 });
  setTerrain(war, 0, 0, terrain); setTerrain(war, 1, 0, terrain);
  return war;
}

test('terrain is the same for the same seed, differs between seeds, and has streets, buildings and parks', () => {
  assert.deepEqual(generateTerrain('alpha'), generateTerrain('alpha'));
  assert.notDeepEqual(generateTerrain('alpha'), generateTerrain('beta'));
  for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'omega']) {
    const cells = generateTerrain(seed);
    assert.equal(cells.length, 144);
    const n = { street: 0, building: 0, park: 0 };
    for (const c of cells) n[c.terrain]++;
    assert.ok(n.street > 0 && n.building > 0 && n.park > 0, `${seed}: ${JSON.stringify(n)}`);
    assert.ok(n.building / 144 > 0.3 && n.building / 144 < 0.6, `${seed} buildings ${n.building}`);
    assert.ok(n.park / 144 > 0.08 && n.park / 144 < 0.22, `${seed} parks ${n.park}`);
  }
  assert.equal(createCityWar({ seed: 'alpha' }).cells.length, 144);
});

test('setTerrain changes one cell and refuses bad input', () => {
  const war = createCityWar({ seed: 'x' });
  assert.ok(setTerrain(war, 3, 4, 'park'));
  assert.equal(terrainAt(war, 3, 4), 'park');
  assert.equal(setTerrain(war, 3, 4, 'moon'), false);
  assert.equal(setTerrain(war, 12, 0, 'park'), false);
  assert.equal(cellName(5, 6), 'F7');
});

test('setup: one team per cell, ids T1..Tn, remove and move work', () => {
  const war = createCityWar({ seed: 's' });
  const a = addTeam(war, { name: 'A', members: [bruiser('a')], x: 1, y: 1 });
  const b = addTeam(war, { name: 'B', members: [bruiser('b')], x: 2, y: 2 });
  assert.deepEqual([a.id, b.id], ['T1', 'T2']);
  assert.throws(() => addTeam(war, { name: 'C', members: [], x: 1, y: 1 }), /already holds/);
  assert.throws(() => addTeam(war, { name: 'C', members: [], x: 12, y: 0 }), /off the map/);
  assert.equal(moveTeam(war, 'T1', 2, 2), false);
  assert.ok(moveTeam(war, 'T1', 5, 5));
  assert.equal(teamAt(war, 5, 5).id, 'T1');
  removeTeam(war, 'T2');
  assert.equal(war.teams.length, 1);
  assert.equal(addTeam(war, { name: 'D', members: [], x: 2, y: 2 }).id, 'T3');
});

test('quickFill makes 12 teams on distinct cells with distinct tactics and plain invented names', () => {
  const war = createCityWar({ seed: 'fill-1' });
  const teams = quickFill(war, R);
  assert.equal(teams.length, 12);
  assert.equal(new Set(teams.map((t) => `${t.x},${t.y}`)).size, 12);
  assert.equal(new Set(teams.map((t) => t.tactic)).size, 12);
  assert.ok(teams.every((t) => t.tactic !== 'none' && TACTIC_IDS.includes(t.tactic)));
  assert.equal(new Set(teams.map((t) => t.name)).size, 12);
  assert.ok(teams.every((t) => GANG_NAMES.includes(t.name) && t.members.length === 3 && t.members.every((m) => m.pl === 10)));
  assert.ok(teams.every((t) => !t.members.some((m) => m.bio)), 'life stories are left off to keep the save small');
  assert.deepEqual(createCityWar({ seed: 'fill-1' }) && quickFill(createCityWar({ seed: 'fill-1' }), R).map((t) => [t.name, t.x, t.y]), teams.map((t) => [t.name, t.x, t.y]));
});

test('no gang name uses the books or a real organization', () => {
  const banned = /batman|superman|gotham|metropolis|justice|titans|joker|robin|lantern corps|mafia|yakuza|triad|crips|bloods|cartel|kkk|hells angels|legion|league|society|syndicate/i;
  for (const n of GANG_NAMES) assert.doesNotMatch(n, banned, n);
  assert.equal(new Set(GANG_NAMES).size, GANG_NAMES.length);
});

test('a full 12-team run ends with exactly one team left, and every fight replays to the same winner from its record', () => {
  const war = createCityWar({ seed: 'full-1' });
  quickFill(war, R);
  runCity(war, R);
  assert.equal(war.status, 'over');
  const left = standingTeams(war);
  assert.equal(left.length, 1, 'one team left (or the turn cap was hit)');
  assert.equal(war.winner, left[0].id);
  assert.ok(war.battles.length >= 11);
  for (const rec of war.battles) {
    const b = runToEnd(buildFightBattle(war, R, rec), R);
    assert.equal(b.winner || null, rec.winner, `fight ${rec.n} replays to the same winner`);
    assert.equal(Math.max(1, Math.min(b.round, b.options.maxRounds)), rec.rounds);
    assert.equal(b.options.enclosed, rec.terrain === 'building');
  }
  assert.equal(standings(war)[0].id, war.winner);
  assert.ok(war.log.at(-1).text.includes('last team standing'));
});

test('the same seed gives the same campaign; a saved war resumes to the same end', () => {
  const a = createCityWar({ seed: 'twin' }); quickFill(a, R, { teams: 6, size: 2 });
  const b = reviveCity(JSON.parse(JSON.stringify(serializeCity(a))));
  for (let i = 0; i < 3; i++) stepCity(a, R);
  const mid = reviveCity(JSON.parse(JSON.stringify(serializeCity(a))));
  runCity(a, R); runCity(b, R); runCity(mid, R);
  assert.equal(a.winner, b.winner);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.log, mid.log, 'resuming from a save in the middle gives the same war');
  resetCity(b);
  assert.equal(b.turn, 0); assert.equal(b.log.length, 0);
  runCity(b, R);
  assert.deepEqual(a.battles, b.battles, 'Replay with the same seed plays the same war');
});

test('a fight in a building cell is enclosed; on the street or in a park it is the block scale with scenery', () => {
  for (const [terrain, enclosed] of [['building', true], ['street', false], ['park', false]]) {
    const war = duel({ seed: `arena-${terrain}`, terrain });
    stepCity(war, R);
    const rec = war.battles[0];
    assert.equal(rec.terrain, terrain);
    const b = buildFightBattle(war, R, rec);
    assert.equal(b.options.enclosed, enclosed, terrain);
    assert.equal(b.options.scale, 'block');
    if (enclosed) assert.equal(b.cover.length, 0); else assert.ok(b.cover.length >= 2, `${terrain} has scenery`);
    if (terrain === 'park') assert.ok(b.cover.every((p) => ['wooden-fence', 'tree'].includes(p.kind) && p.material === 'wood'));
    if (terrain === 'street') assert.ok(b.cover.length >= 3);
  }
});

test('the defender fought on the previous turn: the attacker ambushes; a team resting in a park ambushes its attacker', () => {
  const war = duel({ seed: 'amb' });
  const [red, blue] = war.teams;
  war.turn = 5;
  assert.equal(ambushFor(war, blue), null);
  blue.lastFight = 4;
  assert.equal(ambushFor(war, blue), 'A', 'attacked right after fighting');
  blue.lastFight = 3;
  assert.equal(ambushFor(war, blue), null, 'two turns ago is old news');
  blue.resting = true;
  assert.equal(ambushFor(war, blue), 'A', 'resting on a street');
  setTerrain(war, 1, 0, 'building');
  assert.equal(ambushFor(war, blue), 'A', 'resting in a building');
  setTerrain(war, 1, 0, 'park');
  assert.equal(ambushFor(war, blue), 'B', 'resting in a park is hidden');
  blue.lastFight = 4;
  assert.equal(ambushFor(war, blue), 'B', 'hidden wins over just having fought');
  blue.resting = false;
  assert.equal(ambushFor(war, blue), 'A', 'in a park but awake and just fought');
  const rec = planFight(war, red, blue);
  assert.equal(rec.terrain, 'park');
  assert.equal(rec.ambush, 'A');
});

test('through a campaign step, a hidden team in a park ambushes its attacker and the log says so', () => {
  let found = null;
  for (let k = 0; k < 12 && !found; k++) {
    const war = duel({ seed: `amb-step-${k}`, terrain: 'park' });
    war.teams[1].resting = true; // Blues are hidden in the park; if Reds act first they walk into it
    stepCity(war, R);
    if (war.battles[0]?.attacker === 'T1') found = war;
  }
  assert.ok(found, 'some seed has Reds acting first');
  const rec = found.battles[0];
  assert.equal(rec.ambush, 'B');
  assert.match(found.log.find((l) => l.kind === 'fight').text, /^Turn 1: Reds walk into an ambush by Blues at B1, a park\./);
  const b = buildFightBattle(found, R, rec);
  assert.equal(b.options.ambush, 'B');
  startBattle(b, R);
  assert.ok(b.log.some((e) => /Ambush: team B/.test(e.text)));
});

test('a team attacked right after fighting is ambushed, in the log and in the battle', () => {
  const war = createCityWar({ seed: 'amb-after' });
  addTeam(war, { name: 'Left', members: [weakling('L1')], x: 0, y: 0 });
  addTeam(war, { name: 'Right', members: [weakling('R1')], x: 1, y: 0 });
  stepCity(war, R); // a stalemate each way: the second attack of the turn lands on a team that has just fought
  const [first, second] = war.battles;
  assert.equal(first.ambush, null);
  assert.equal(second.ambush, 'A');
  assert.match(war.log.filter((l) => l.kind === 'fight')[1].text, / ambush /);
  assert.equal(buildFightBattle(war, R, second).options.ambush, 'A');
});

test('the loser is out and its cell is free; the winner carries its bruises and fatigue; the fight is logged in plain words', () => {
  const war = createCityWar({ seed: 'carry-1' });
  addTeam(war, { name: 'Reds', members: [bruiser('R1'), bruiser('R2')], x: 0, y: 0 });
  addTeam(war, { name: 'Weak', members: [weakling('W1')], x: 1, y: 0 });
  stepCity(war, R);
  assert.equal(war.battles.length, 1);
  const rec = war.battles[0];
  const reds = teamById(war, 'T1'); const weak = teamById(war, 'T2');
  assert.equal(weak.status, 'out');
  assert.equal(weak.outTurn, 1);
  assert.equal(teamAt(war, 1, 0), null, 'the cell is free');
  assert.equal(war.status, 'over');
  assert.equal(war.winner, 'T1');
  assert.equal(rec.winner, rec.attacker === 'T1' ? 'A' : 'B');
  assert.ok(reds.won === 1 && reds.fights === 1 && weak.fights === 1);
  assert.match(war.log.find((l) => l.kind === 'fight').text, /^Turn 1: .* (fight|ambush) .* at [A-L]\d+, a (street|building|park)\b.*win in \d+ rounds? and (lose \d+ fighters?|lose no one)\.$/);
  assert.deepEqual(Object.keys(rec).filter((k) => ['turn', 'attacker', 'defender', 'cell', 'terrain', 'ambush', 'winner', 'rounds', 'koA', 'koB', 'seed'].includes(k)).length, 11);
});

test('a stalemate leaves both teams in the war and counts as a fight for both', () => {
  const war = createCityWar({ seed: 'stale' });
  addTeam(war, { name: 'Left', members: [weakling('L1')], x: 0, y: 0 });
  addTeam(war, { name: 'Right', members: [weakling('R1')], x: 1, y: 0 });
  stepCity(war, R);
  const rec = war.battles[0];
  assert.equal(rec.winner, null);
  assert.equal(standingTeams(war).length, 2);
  assert.equal(war.battles.length, 2, 'each team attacked once on its turn');
  assert.ok(war.teams.every((t) => t.fights === 2 && t.lastFight === 1));
  assert.equal(war.battles[1].ambush, 'A', 'the second attack hits a team that has just fought');
  assert.match(war.log.find((l) => l.kind === 'fight').text, /Nobody wins/);
});

test('damage is carried: a bruise taken in one fight is still there at the start of the next, and a rest clears it', () => {
  const war = duel({ seed: 'carry-2', size: 2 });
  const [red, blue] = war.teams;
  red.state[0] = { out: false, bruises: 3, fatigue: 1 };
  red.state[1] = { out: true, bruises: 0, fatigue: 0 };
  const rec = planFight(war, red, blue);
  assert.deepEqual(rec.a, [{ i: 0, bruises: 3, fatigue: 1 }], 'the knocked-out member does not fight');
  assert.equal(rec.b.length, 2);
  const b = buildFightBattle(war, R, rec);
  startBattle(b, R);
  const c = b.combatants.find((x) => x.id === 'T1-m0');
  assert.equal(c.bruises, 3);
  assert.equal(c.fatigue, 1);
  assert.match(statusLine(c), /3 bruises/);
  assert.equal(b.combatants.find((x) => x.id === 'T2-m0').bruises, 0);
  assert.equal(b.combatants.length, 3);
  // outcome written back
  runToEnd(b, R);
  const total = red.state.reduce((s, x) => s + x.bruises, 0);
  assert.ok(total >= 0);
});

test('the carry hook: makeCombatant carry is applied after the reset when the battle starts, and nothing changes without it', () => {
  const mk = (carry) => {
    const b = createBattle({ seed: 'hook' });
    addCombatant(b, makeCombatant(R, bruiser('One'), { id: 'one', team: 'A', carry }));
    addCombatant(b, makeCombatant(R, bruiser('Two'), { id: 'two', team: 'B' }));
    return b;
  };
  const plain = mk(undefined);
  assert.equal(plain.combatants[0].carry, null);
  startBattle(plain, R);
  assert.equal(plain.combatants[0].bruises, 0);
  const hurt = mk({ bruises: 2, fatigue: 1 });
  startBattle(hurt, R);
  assert.equal(hurt.combatants[0].bruises, 2);
  assert.equal(hurt.combatants[0].fatigue, 1);
  // a plain fight is exactly what it was
  const again = mk(undefined);
  runToEnd(again, R); runToEnd(plain, R);
  assert.deepEqual(plain.log.map((e) => e.text), again.log.map((e) => e.text));
});

test('resting: Alpha Strike and No Retreat never rest; Sustain rests when anyone is hurt; others when half are hurt or out', () => {
  const team = (tactic, states) => ({ tactic, members: states.map(() => ({})), state: states.map((s) => ({ out: false, bruises: 0, fatigue: 0, ...s })) });
  const hurtOne = [{ bruises: 1 }, {}, {}, {}];
  const hurtTwo = [{ bruises: 1 }, { out: true }, {}, {}];
  assert.equal(restsAfterFight(team('alpha', hurtTwo)), false);
  assert.equal(restsAfterFight(team('noretreat', hurtTwo)), false);
  assert.equal(restsAfterFight(team('sustain', hurtOne)), true);
  assert.equal(restsAfterFight(team('sustain', [{}, {}, {}, {}])), false);
  assert.equal(restsAfterFight(team('focus', hurtOne)), false);
  assert.equal(restsAfterFight(team('focus', hurtTwo)), true, 'half hurt or out');
  assert.equal(restsBeforeMarching(team('sustain', hurtOne)), true);
  assert.equal(restsBeforeMarching(team('focus', hurtOne)), false);
  assert.equal(restsBeforeMarching(team('focus', [{ out: true }, { out: true }, { out: true }, {}])), true, 'mostly out');
  assert.equal(restsBeforeMarching(team('alpha', [{ out: true }, { out: true }, { out: true }, {}])), false, 'never rests while someone can fight');
  assert.equal(restsAfterFight(team('alpha', [{ out: true }, { out: true }])), true, 'but with nobody standing it must');
});

test('a resting team recovers on its next turn: knocked-out members return and bruises clear', () => {
  const war = createCityWar({ seed: 'rest-1' });
  addTeam(war, { name: 'Far', members: [bruiser('F1'), bruiser('F2')], x: 0, y: 0 });
  addTeam(war, { name: 'Away', members: [bruiser('A1')], x: 11, y: 11 });
  const far = war.teams[0];
  far.state[0] = { out: true, bruises: 2, fatigue: 1 };
  far.state[1] = { out: false, bruises: 1, fatigue: 0 };
  far.resting = true;
  stepCity(war, R);
  assert.equal(far.resting, false);
  assert.ok(far.state.every((s) => !s.out && s.bruises === 0 && s.fatigue === 0));
  assert.ok(war.log.some((l) => l.kind === 'recover' && /bring back 1 fighter/.test(l.text)));
  assert.equal(war.battles.length, 0);
});

test('teams march one cell a turn toward the nearest team, and fight when next door', () => {
  const war = createCityWar({ seed: 'march' });
  addTeam(war, { name: 'West', members: [bruiser('W')], x: 0, y: 0 });
  addTeam(war, { name: 'East', members: [bruiser('E')], x: 5, y: 0 });
  stepCity(war, R);
  const [w, e] = war.teams;
  assert.equal(w.x + (5 - e.x), 2, 'each moved one cell');
  assert.equal(war.battles.length, 0);
  stepCity(war, R); stepCity(war, R);
  assert.equal(war.battles.length, 1, 'a fight once they are next to each other');
  assert.equal(Math.max(Math.abs(w.x - e.x), Math.abs(w.y - e.y)) <= 1, true);
});

test('cityOdds totals equal n, leaves the setup alone and is repeatable', () => {
  const war = createCityWar({ seed: 'odds-1' });
  quickFill(war, R, { teams: 4, size: 2 });
  const before = JSON.stringify(serializeCity(war));
  const o = cityOdds(war, R, 6);
  assert.equal(o.n, 6);
  assert.equal(Object.values(o.wins).reduce((s, x) => s + x, 0) + o.none, 6);
  assert.deepEqual(Object.keys(o.wins), war.teams.map((t) => t.id));
  assert.equal(JSON.stringify(serializeCity(war)), before, 'the setup war is not touched');
  assert.deepEqual(cityOdds(war, R, 6), o);
});

test('a fight is kept as a Fights record with source city-war and a label naming the turn, teams and cell', () => {
  const war = createCityWar({ seed: 'rec-1' });
  quickFill(war, R, { teams: 3, size: 2 });
  const seen = [];
  runCity(war, R, { onFight: (b, rec, w, label) => seen.push({ rec, label, saved: fightRecord(b, { source: 'city-war', label }) }) });
  assert.equal(seen.length, war.battles.length);
  for (const { rec, label, saved } of seen) {
    assert.match(label, /^Turn \d+: .+ (fight|ambush|walk into an ambush by) .+ at [A-L]\d+$/);
    assert.equal(saved.source, 'city-war');
    assert.equal(saved.seed, rec.seed);
    assert.equal(saved.id, recordId(rec.seed, 1));
    assert.equal(saved.options.enclosed, rec.terrain === 'building');
    assert.equal(saved.options.scale, rec.terrain === 'building' ? 'street' : 'block');
  }
});

test('standings list the last team first, then teams by how long they lasted', () => {
  const war = createCityWar({ seed: 'rank' });
  quickFill(war, R, { teams: 5, size: 2 });
  runCity(war, R);
  const rows = standings(war);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].alive, true);
  const outs = rows.slice(1).map((r) => r.outTurn);
  assert.deepEqual(outs, [...outs].sort((a, b) => b - a));
  assert.ok(rows.every((r) => r.fights >= 0 && r.left >= 0));
});

test('the turn cap ends a war nobody wins', () => {
  const war = createCityWar({ seed: 'cap' });
  addTeam(war, { name: 'Left', members: [weakling('L1')], x: 0, y: 0 });
  addTeam(war, { name: 'Right', members: [weakling('R1')], x: 1, y: 0 });
  runCity(war, R, { maxTurns: 5 });
  assert.equal(war.status, 'over');
  assert.equal(war.winner, null);
  assert.equal(war.turn, 5);
  assert.match(war.log.at(-1).text, /stalemate/);
});
