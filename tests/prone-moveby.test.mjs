import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { createBattle, addCombatant, makeCombatant, startBattle } from '../src/engine/battle.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { grab } from '../src/engine/battle/maneuvers.js';
import { takeTurn } from '../src/engine/battle/turn.js';
import { standOrDrop } from '../src/engine/battle/stand.js';
import { makeProne, isProne } from '../src/engine/battle/prone.js';
import { moveZones } from '../src/engine/battle/conditions.js';
import { expectedValue } from '../src/engine/battle/odds.js';
import { makeRng } from '../src/engine/rng.js';

// Prone (p26, p177-178), Prone Fighting, Instant Up, Move-by Action, Improved Aim, Improved Defense, Grabbing Finesse
// and Fast Grab (p74-78). Scripted dice hand out d20 values in the order the engine asks. A fighter has Fighting 6,
// Parry 12 (DC 22), Strength 4, so an unarmed bonus of +6.
const dice = (...rolls) => ({ left: () => rolls.length, int: () => { if (!rolls.length) throw new Error('out of dice'); return rolls.shift(); }, next: () => 0.5, chance: () => true, pick: (a) => a[0] });
const mk = (name, o = {}) => ({
  name, pl: 10, identity: { codename: name },
  abilities: { Strength: 4, Stamina: 4, Agility: 2, Dexterity: 3, Fighting: 6, Intellect: 0, Awareness: 0, Presence: 0, ...(o.abilities || {}) },
  defenses: { Dodge: 4, Parry: 6, Fortitude: 5, Will: 3, Toughness: 0, ...(o.defenses || {}) },
  skills: [], advantages: o.advantages ? o.advantages.map((name) => ({ name })) : [], powers: o.powers || [], equipment: o.equipment || [], devices: [],
});
const spear = { name: 'Spear', cost: 4, effect: 'Damage 3', attack: { kind: 'close', rank: 3, strengthBased: true, crit: 19 } };
const blast = (rank = 8) => ({ name: 'Blast', effect: 'Damage', rank, range: 'Ranged', role: 'attack', extras: [], flaws: [] });
const get = (b, id) => b.combatants.find((c) => c.id === id);
const unarmed = (c) => c.attacks.find((a) => a.unarmed);
const ranged = (c) => c.attacks.find((a) => a.kind === 'ranged');

/** Teams of [id, character, style, zone]; fighters at the same index share a zone number. */
function scene(team, opts = {}) {
  const b = createBattle({ seed: 'pm', name: 'pm' }); Object.assign(b.options, opts);
  for (const [id, ch, style] of team) addCombatant(b, makeCombatant(R, ch, { id, team: id[0], style }));
  startBattle(b, R); b.log.length = 0;
  for (const [id, , , pos] of team) { const c = get(b, id); c.pos = pos; c.heroPoints = 0; }
  return b;
}
const duel = (a, t, style = 'brawler') => scene([['A0', a, style, 3], ['B0', t, 'brawler', 3]]);
const turn = (b, id, seed = 't1') => { b.log.length = 0; takeTurn(b, R, get(b, id), makeRng(seed)); return b.log; };
const texts = (log) => log.map((e) => e.text).join('\n');

// ---- Prone modifiers ----------------------------------------------------------------------------------------------

/** The attack modifier actually rolled: a to-hit roll of 10, read from the log. */
function modOf(a, t, { downA = false, downT = false, kind = 'close' } = {}) {
  const b = duel(a, t); const c = get(b, 'A0'); const d = get(b, 'B0');
  if (downA) makeProne(c, d, 'trip', 'x');
  if (downT) makeProne(d, c, 'trip', 'x');
  resolveAttack(b, R, c, kind === 'close' ? unarmed(c) : ranged(c), d, dice(10, 10, 10, 10), {});
  return b.log[0].dice[0].mod;
}

test('prone: +5 for a close attacker against a prone target, -5 for a ranged one, -5 on the prone fighter\'s own close attacks', () => {
  assert.equal(modOf(mk('A'), mk('B')), 6);
  assert.equal(modOf(mk('A'), mk('B'), { downT: true }), 11);
  assert.equal(modOf(mk('A'), mk('B'), { downA: true }), 1);
  assert.equal(modOf(mk('A'), mk('B'), { downA: true, downT: true }), 6, 'both on the ground cancel out');
  const gun = { powers: [blast()] };
  assert.equal(modOf(mk('A', gun), mk('B'), { kind: 'ranged' }), 3);
  assert.equal(modOf(mk('A', gun), mk('B'), { kind: 'ranged', downT: true }), -2);
  assert.equal(modOf(mk('A', gun), mk('B'), { kind: 'ranged', downA: true }), 3, 'a prone shooter has no penalty of its own');
});

test('Prone Fighting: no -5 for the prone fighter, and close foes get no +5 against it', () => {
  const pf = ['Prone Fighting'];
  assert.equal(modOf(mk('A', { advantages: pf }), mk('B'), { downA: true }), 6);
  assert.equal(modOf(mk('A'), mk('B', { advantages: pf }), { downT: true }), 6);
  assert.equal(modOf(mk('A', { powers: [blast()] }), mk('B', { advantages: pf }), { kind: 'ranged', downT: true }), -2, 'ranged attackers still have -5');
});

test('the planner sees prone too: a close attack is worth more against a prone fighter, unless it has Prone Fighting', () => {
  const ev = (adv, down) => { const b = duel(mk('A'), mk('B', { advantages: adv })); if (down) makeProne(get(b, 'B0'), get(b, 'A0'), 'trip', 'x'); return expectedValue(get(b, 'A0'), unarmed(get(b, 'A0')), get(b, 'B0')); };
  assert.ok(ev([], true) > ev([], false));
  assert.equal(ev(['Prone Fighting'], true), ev(['Prone Fighting'], false));
});

// ---- Standing up and dropping prone -------------------------------------------------------------------------------

function stand(setup, rolls, mode = 'full') {
  const b = duel(mk('Faller'), mk('Foe')); const c = get(b, 'A0');
  setup(c); makeProne(c, get(b, 'B0'), 'knockback', 'knocked prone');
  standOrDrop(b, c, { plan: 'attack', attack: unarmed(c), target: get(b, 'B0') }, [get(b, 'B0')], mode, dice(...rolls));
  return { b, c };
}

test('stand: with no better way it takes a move action, leaving no movement for the turn', () => {
  const { b, c } = stand((x) => { x.skills.Acrobatics = -2; }, []); // DC 20 is out of reach, so no roll is made
  assert.ok(!isProne(c));
  assert.equal(c.noMove, true);
  assert.equal(moveZones(c), 0);
  assert.match(b.log[0].text, /stands up as a move action\./);
});

test('stand: a DC 20 Acrobatics check stands up for free (20 passes, 19 fails and costs the move action)', () => {
  const ok = stand((x) => { x.skills.Acrobatics = 8; }, [12]);
  assert.ok(!isProne(ok.c));
  assert.equal(ok.c.noMove, false);
  assert.equal(moveZones(ok.c), 1);
  assert.match(ok.b.log[0].text, /free action \(Acrobatics d20 12 \+8 = 20 vs DC 20\)/);
  const bad = stand((x) => { x.skills.Acrobatics = 8; }, [11]);
  assert.ok(!isProne(bad.c));
  assert.equal(bad.c.noMove, true);
  assert.equal(moveZones(bad.c), 0);
  assert.match(bad.b.log[0].text, /move action \(Acrobatics d20 11 \+8 = 19 vs DC 20, too low to do it free\)/);
});

test('stand: a failed free attempt with no move left to pay with leaves the fighter prone', () => {
  const { b, c } = stand((x) => { x.skills.Acrobatics = 8; }, [11], 'half');
  assert.ok(isProne(c));
  assert.match(b.log[0].text, /still prone/);
});

test('Instant Up: stands up as a free action with no check', () => {
  const { b, c } = stand((x) => { x.adv['Instant Up'] = 1; x.skills.Acrobatics = -2; }, []);
  assert.ok(!isProne(c));
  assert.equal(c.noMove, false);
  assert.match(b.log[0].text, /free action \(Instant Up\)/);
});

test('a prone fighter that wants to fight up close stands first, then has no move left in that turn', () => {
  const b = scene([['A0', mk('Fallen', { abilities: { Strength: 8, Fighting: 8 } }), 'brawler', 1], ['B0', mk('Foe'), 'brawler', 3]]);
  get(b, 'A0').skills.Acrobatics = -1; makeProne(get(b, 'A0'), get(b, 'B0'), 'knockback', 'knocked prone');
  const log = turn(b, 'A0');
  assert.match(log[0].text, /Fallen stands up as a move action/);
  assert.match(log[1].text, /can't move/);
  assert.equal(get(b, 'A0').pos, 1);
});

const blaster = (name, o = {}) => mk(name, { powers: [blast(8)], ...o });

test('drop prone: a shooter in the open facing only shooters drops, shoots at -5 for its foes, and stays down', () => {
  const b = scene([['A0', blaster('Sniper', { abilities: { Stamina: 12 } }), 'blaster', 2], ['B0', blaster('Marksman'), 'blaster', 5]]);
  const log = turn(b, 'A0');
  assert.match(log[0].text, /Sniper drops prone \(a free action\)/);
  assert.equal(get(b, 'A0').conditions.find((x) => x.name === 'Prone').source, 'drop');
  assert.match(log[1].text, /Sniper .* Blast at Marksman/);
  turn(b, 'A0', 't2');
  assert.ok(isProne(get(b, 'A0')), 'a shooter that needs no move does not stand again');
});

test('drop prone is not chosen next to a melee threat, for a melee style, or when no foe shoots', () => {
  const brawlerFoe = scene([['A0', blaster('Sniper'), 'blaster', 2], ['B0', blaster('Both', { abilities: { Strength: 8, Fighting: 8 } }), 'blaster', 5]]); // it shoots, but it also hits hard up close
  assert.doesNotMatch(texts(turn(brawlerFoe, 'A0')), /drops prone/);
  const meleeStyle = scene([['A0', blaster('Thrower'), 'brawler', 2], ['B0', blaster('Marksman'), 'blaster', 5]]);
  assert.doesNotMatch(texts(turn(meleeStyle, 'A0')), /drops prone/);
  const unarmedFoe = scene([['A0', blaster('Sniper'), 'blaster', 2], ['B0', mk('Peaceful', { abilities: { Fighting: 0, Strength: 0 } }), 'brawler', 5]]);
  assert.doesNotMatch(texts(turn(unarmedFoe, 'A0')), /drops prone/);
});

// ---- Move-by Action -----------------------------------------------------------------------------------------------

const slasher = () => mk('Slasher', { abilities: { Strength: 8, Fighting: 8 } });
const moves = (log) => log.filter((e) => e.kind === 'move');

test('Move-by Action, ranged: shoots first, then steps out of the melee foe\'s reach, within the speed', () => {
  const b = scene([['A0', blaster('Skirmisher', { advantages: ['Move-by Action'] }), 'blaster', 3], ['B0', slasher(), 'brawler', 3]]);
  get(b, 'A0').speed = 2;
  const log = turn(b, 'A0');
  const shot = log.findIndex((e) => /Blast at Slasher/.test(e.text));
  const step = log.findIndex((e) => e.kind === 'move');
  assert.ok(shot >= 0 && step > shot, 'the move comes after the shot');
  assert.match(log[step].text, /back out of reach of Slasher after the shot \(Move-by Action\)/);
  assert.equal(get(b, 'A0').pos, 1, 'two zones, the whole speed');
  assert.equal(get(b, 'A0').zonesMoved, 2);
});

test('Move-by Action, ranged: the step back is limited by the speed that is left', () => {
  const b = scene([['A0', blaster('Skirmisher', { advantages: ['Move-by Action'] }), 'blaster', 3], ['B0', slasher(), 'brawler', 3]]);
  get(b, 'A0').speed = 1;
  turn(b, 'A0');
  assert.equal(get(b, 'A0').pos, 2);
});

test('without Move-by Action a shooter steps away before the shot instead, and only one zone', () => {
  const b = scene([['A0', blaster('Skirmisher'), 'blaster', 3], ['B0', slasher(), 'brawler', 3]]);
  get(b, 'A0').speed = 2;
  const log = turn(b, 'A0');
  assert.equal(log[0].kind, 'move');
  assert.match(log[0].text, /away from Slasher/);
  assert.equal(moves(log).length, 1);
  assert.equal(get(b, 'A0').pos, 2);
});

test('Move-by Action, melee: steps in, strikes a dangerous foe and steps back out, within the speed budget', () => {
  const mkB = (speed, adv = ['Move-by Action']) => {
    const b = scene([['A0', mk('Hitter', { abilities: { Strength: 7, Fighting: 8 }, advantages: adv }), 'brawler', 2], ['B0', mk('Slasher', { abilities: { Strength: 9, Fighting: 9 }, equipment: [spear] }), 'brawler', 3]]);
    get(b, 'A0').speed = speed; return b;
  };
  const b = mkB(3); const log = turn(b, 'A0');
  const kinds = log.map((e) => e.kind === 'move' ? 'move' : 'other').join();
  assert.equal(kinds.startsWith('move,other,'), true, kinds);
  assert.equal(log.at(-1).kind, 'move');
  assert.match(log.at(-1).text, /is gone before anyone can answer/);
  assert.equal(get(b, 'A0').pos, 2, 'back where it started');
  assert.ok(get(b, 'A0').zonesMoved <= 3, 'in and out within the speed');
  const slow = mkB(1); turn(slow, 'A0');
  assert.equal(get(slow, 'A0').pos, 3, 'with speed 1 the step in uses it all, so it cannot step back');
  const plain = mkB(3, []); const plainLog = turn(plain, 'A0');
  assert.equal(moves(plainLog).length, 1, 'without the advantage it only closes in');
  assert.equal(get(plain, 'A0').pos, 3);
});

// ---- Aim, Defend, Grab --------------------------------------------------------------------------------------------

test('Improved Aim: +10 for a close shot and +5 at range, against +5 and +2 without it; the aimed shot gets it', () => {
  const aim = (adv, foeZone, options = {}) => { // far off, only the kite tactic aims; next door a poor shot does
    const b = scene([['A0', blaster('Gunner', { advantages: adv }), 'blaster', 3], ['B0', mk('Brute', { defenses: { Dodge: 8 } }), 'brawler', foeZone]], options);
    const rng = makeRng('aim'); rng.chance = () => true;
    takeTurn(b, R, get(b, 'A0'), rng);
    return { b, bonus: get(b, 'A0').aiming?.bonus };
  };
  assert.equal(aim([], 4).bonus, 5, 'adjacent zone');
  assert.equal(aim(['Improved Aim'], 4).bonus, 10);
  assert.equal(aim([], 7, { teamTactics: { A: 'kite' } }).bonus, 2, 'at range');
  assert.equal(aim(['Improved Aim'], 7, { teamTactics: { A: 'kite' } }).bonus, 5);
  const { b } = aim(['Improved Aim'], 4);
  const shot = turn(b, 'A0');
  assert.match(shot[0].text, /takes the aimed shot \(\+10\)/);
  assert.equal(shot[1].dice[0].mod, 3 + 10, 'Dexterity +3 and the aim');
});

test('Improved Defense: +2 on the Defend roll', () => {
  const dc = (adv) => {
    const b = duel(mk('A'), mk('B', { advantages: adv })); const t = get(b, 'B0'); t.defending = true;
    resolveAttack(b, R, get(b, 'A0'), unarmed(get(b, 'A0')), t, dice(12, 12, 12), {}); // the defense roll first
    return b.log[0].dice[0].dc;
  };
  assert.equal(dc([]), 12 + 12);
  assert.equal(dc(['Improved Defense']), 12 + 12 + 2);
});

test('Grabbing Finesse: the hold is made with Dexterity instead of Strength (and Improved Hold adds 5)', () => {
  const dc = (adv) => {
    const b = duel(mk('Grabber', { abilities: { Strength: 2, Dexterity: 8 }, advantages: adv }), mk('Target'));
    grab(b, R, get(b, 'A0'), get(b, 'B0'), dice(15, 10), { free: true });
    return b.log[0].dice[0].dc;
  };
  assert.equal(dc([]), 10 + 2);
  assert.equal(dc(['Grabbing Finesse']), 10 + 8);
  assert.equal(dc(['Grabbing Finesse', 'Improved Hold']), 10 + 8 + 5);
});

test('Fast Grab: an unarmed hit turns into a hold; a miss, a weapon hit or no advantage does not', () => {
  const swing = (adv, roll, weapon) => {
    const b = duel(mk('Grappler', { advantages: adv, equipment: weapon ? [spear] : [] }), mk('Target'));
    const c = get(b, 'A0');
    resolveAttack(b, R, c, weapon ? c.attacks.find((a) => a.name === 'Spear') : unarmed(c), get(b, 'B0'), dice(roll, 10, 1), {});
    return { held: get(b, 'B0').grabbedBy === 'A0', text: texts(b.log) };
  };
  const hit = swing(['Fast Grab'], 17);
  assert.equal(hit.held, true);
  assert.match(hit.text, /Grappler uses Fast Grab to turn the hit into a hold/);
  assert.equal(swing(['Fast Grab'], 2).held, false, '2 + 6 misses Parry DC 22');
  assert.equal(swing([], 17).held, false);
  assert.equal(swing(['Fast Grab'], 17, true).held, false, 'the grab follows an unarmed hit only');
});
