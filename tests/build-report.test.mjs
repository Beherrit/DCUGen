// The build report on each fighter: which of its powers, modifiers, advantages and skills the simulator uses and which it
// ignores, read from tools/battle-coverage/coverage.json through the shipped src/generated/battle-coverage.js.
// Source: src/engine/battle/build-report.js, tools/battle-coverage/lib.mjs (generatedModule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { R } from './helpers/fighters.mjs';
import { makeCombatant, buildReport } from '../src/engine/battle.js';
import { BATTLE_COVERAGE } from '../src/generated/battle-coverage.js';
import { loadCoverage, generatedModule } from '../tools/battle-coverage/lib.mjs';

const ballista = () => JSON.parse(readFileSync(new URL('./fixtures/ballista.json', import.meta.url), 'utf8'));
const entries = loadCoverage();
const power = (effect, extras = [], flaws = []) => ({ name: effect, effect, rank: 3, extras: extras.map((name) => ({ name })), flaws: flaws.map((name) => ({ name })), role: 'utility' });
const person = (parts = {}) => ({ pl: 10, abilities: {}, defenses: {}, skills: [], advantages: [], powers: [], ...parts });

test('the shipped module is exactly what the coverage list says, so the app never reports from stale rules', () => {
  const file = readFileSync(new URL('../src/generated/battle-coverage.js', import.meta.url), 'utf8');
  assert.equal(file, generatedModule(entries));
  assert.equal(BATTLE_COVERAGE.length, entries.filter((e) => e.status !== 'n/a').length);
});

test('Ballista: only Innate is ignored; Kinetic control, Deflect, Luck Control, Leadership and Teamwork are used', () => {
  const report = buildReport(makeCombatant(R, ballista(), { id: 'b', team: 'A' }));
  assert.deepEqual(report.ignored.map((x) => x.name), ['Innate']);
  assert.match(report.ignored[0].why, /not protected from Nullify/);
  for (const name of ['Damage', 'Deflect', 'Reaction', 'Luck Control', 'Throwing Mastery', 'Leadership', 'Teamwork', 'Luck', 'Protection', 'Close Combat', 'Ranged Combat']) assert.ok(report.used.includes(name), name);
  assert.deepEqual(report.partial.map((x) => x.name).filter((n) => ['Teamwork', 'Deflect', 'Luck Control'].includes(n)).sort(), ['Deflect', 'Luck Control', 'Teamwork']);
  assert.ok(!report.used.includes('Persuasion') && !report.ignored.some((x) => x.name === 'Persuasion'), 'a skill that is n/a in a fight is not listed');
  assert.ok(!report.ignored.some((x) => x.name === 'Insidious'), 'an n/a modifier is not listed');
});

test('a combatant and its character give the same report', () => {
  const ch = ballista();
  assert.deepEqual(buildReport(makeCombatant(R, ch, { id: 'b', team: 'A' })), buildReport(ch));
});

test('traits the simulator does not use are ignored with the reason from the coverage list', () => {
  const ch = person({ powers: [power('Summon'), power('Damage', ['Innate'], ['Tiring'])], skills: [{ name: 'Stealth', ranks: 4 }, { name: 'Persuasion', ranks: 4 }] });
  const report = buildReport(ch);
  const names = report.ignored.map((x) => x.name);
  assert.ok(names.includes('Summon') && names.includes('Innate') && names.includes('Stealth'), names.join(', '));
  assert.equal(report.ignored.find((x) => x.name === 'Stealth').why, entries.find((e) => e.kind === 'skill' && e.name === 'Stealth').note);
  assert.ok(!names.includes('Persuasion') && !names.includes('Damage'));
});

test('a trait the list does not know is left out rather than guessed at, and a trait is listed once however often it appears', () => {
  const report = buildReport(person({ powers: [power('Time Bubble'), power('Summon'), power('Summon')] }));
  assert.deepEqual(report.ignored.map((x) => x.name), ['Summon']);
  assert.deepEqual(buildReport(person()), { used: [], partial: [], ignored: [] });
});

test('every entry of the coverage list is sorted the right way: none ignored, partial used with a note, full used, n/a left out', () => {
  for (const e of entries) {
    const parts = {
      effect: { powers: [power(e.name)] }, extra: { powers: [power('Damage', [e.name])] }, flaw: { powers: [power('Damage', [], [e.name])] },
      advantage: { advantages: [{ name: e.name, rank: 1 }] }, skill: { skills: [{ name: e.name, ranks: 1 }] },
    }[e.kind];
    if (!parts) continue;                                    // actions, maneuvers, conditions and rules are not traits of a fighter
    const r = buildReport(person(parts));
    const mine = (list) => list.filter((x) => x.name === e.name && (x.kind || e.kind) === e.kind);
    const where = { none: [mine(r.ignored).length, 0, 0], partial: [0, 1, 1], full: [0, 1, 0], 'n/a': [0, 0, 0] }[e.status];
    assert.deepEqual([mine(r.ignored).length, r.used.filter((n) => n === e.name).length, mine(r.partial).length], where, `${e.kind} ${e.name} (${e.status})`);
  }
});
