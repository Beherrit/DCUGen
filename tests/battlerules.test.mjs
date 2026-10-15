// The Battle Room follows the Hero's Handbook: critical hits, minions, hero points, Recover, Charge, Aim,
// concealment. Checked across many seeded fights by reading the log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { catalogEntries } from '../src/engine/workshop.js';
import { catalogToCharacter } from '../src/engine/catalog.js';
import { createBattle, addCombatant, makeCombatant, runToEnd } from '../src/engine/battle.js';

const es = catalogEntries(R);
const creature = (re) => catalogToCharacter(es.find((e) => re.test(e.name)) || es[0]);
const ARCHS = ['paragon', 'powerhouse', 'speedster', 'martialartist', 'mystic', 'psychic', 'gadgeteer', 'weaponmaster', 'crimefighter', 'battlesuit'];

/** Many fights: heroes against heroes, and heroes against a mob of minions. */
function fights(n = 60) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = createBattle({ seed: `rules-${i}` });
    const a1 = ARCHS[i % ARCHS.length]; const a2 = ARCHS[(i * 3 + 1) % ARCHS.length];
    addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: `ra-${i}`, archetype: a1, pl: 8 + (i % 5) }), { team: 'A' }));
    addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: `rb-${i}`, archetype: a2, pl: 8 + ((i + 2) % 5) }), { team: 'B' }));
    if (i % 3 === 0) for (let k = 0; k < 4; k++) addCombatant(b, makeCombatant(R, creature(/thug/i), { team: 'B', name: `Thug #${k + 1}` }));
    runToEnd(b, R);
    out.push(b);
  }
  return out;
}
const all = fights();
const entries = all.flatMap((b) => b.log.map((e) => ({ ...e, b })));
const by = (b, id) => b.combatants.find((c) => c.id === id);

test('a natural 20 is a critical hit only if the total also reaches the defense', () => {
  let checked = 0;
  for (const e of entries) {
    if (e.kind !== 'crit' || !e.dice?.[0] || e.dice[0].label !== 'Attack' || e.dice.length > 1) continue;
    if (e.dice[0].roll === 20) { assert.ok(e.dice[0].total >= e.dice[0].dc, e.text); checked++; }
  }
  // and some natural 20s that fell short are logged as plain hits
  const plain = entries.filter((e) => e.kind === 'hit' && e.dice?.[0]?.roll === 20 && e.dice[0].total < e.dice[0].dc);
  assert.ok(checked + plain.length > 0, 'saw natural 20s');
});

test('minions never score critical hits against non-minions; non-minions hit minions with routine attacks', () => {
  for (const e of entries) {
    if (e.kind !== 'crit') continue;
    const a = by(e.b, e.actor); const t = by(e.b, e.target);
    if (a?.minion && t && !t.minion) assert.fail(`minion crit: ${e.text}`);
  }
  assert.ok(entries.some((e) => /routine attack against a minion/.test(e.text)), 'some routine attacks against minions');
});

test('a hero point re-roll keeps the better roll, and counts 1-10 as +10', () => {
  let n = 0;
  for (const e of entries) {
    const re = e.dice?.find((d) => d.label === 'Hero point re-roll');
    if (!re) continue;
    n++;
    assert.ok(re.roll >= 11, `re-roll counts as 11-20: ${re.roll}`);
    assert.ok(re.total >= e.dice[0].total, e.text);
  }
  assert.ok(n > 0, 'saw hero point re-rolls');
});

test('Recover happens at most once per fighter per fight, and gives +2 defenses', () => {
  let n = 0;
  for (const b of all) {
    const seen = new Map();
    for (const e of b.log.filter((x) => /takes a moment to recover/.test(x.text))) {
      seen.set(e.actor, (seen.get(e.actor) || 0) + 1);
      assert.match(e.text, /\+2 to defenses/);
      n++;
    }
    for (const [, k] of seen) assert.equal(k, 1);
  }
  assert.ok(n > 0, 'some fighters recovered');
});

test('close fighters charge from far away (at −2), and a hero point never removes staggered', () => {
  assert.ok(entries.some((e) => /charges/.test(e.text) && e.kind === 'move'), 'someone charged');
  assert.ok(entries.some((e) => /charge: −2 to hit/.test(e.text)), 'the charge penalty is applied');
  assert.ok(!entries.some((e) => /hero point to recover from being staggered/.test(e.text)));
});

test('fights still end: no stalemates from the new actions', () => {
  const stale = all.filter((b) => !b.winner).length;
  assert.ok(stale <= all.length * 0.1, `${stale} of ${all.length} stalemates`);
});

test('a squad of minions makes team attacks, and helpers spend their turn on it', () => {
  const team = entries.filter((e) => /^Team attack:/.test(e.text));
  assert.ok(team.length > 0, 'some team attacks');
  for (const e of team) assert.match(e.text, /\+[25] to|no help lands/);
});

test('immunities follow descriptors: immune to physical damage, and half-effect immunity', async () => {
  const { makeCombatant: mk, createBattle: cb, addCombatant: add, startBattle: start, step: st } = await import('../src/engine/battle.js');
  const hero = (immunity, flaws = []) => {
    const ch = generateCharacter(R, { seed: 'imm-target', archetype: 'paragon', pl: 10 });
    ch.powers = [...ch.powers, { id: 'imm', name: 'Immune', effect: 'Immunity', rank: 10, detail: immunity, extras: [], flaws }];
    return ch;
  };
  const brawler = generateCharacter(R, { seed: 'imm-brawler', archetype: 'powerhouse', pl: 10 });
  const fight = (target) => {
    const b = cb({ seed: 'imm' });
    add(b, mk(R, brawler, { team: 'A', name: 'Brute' }));
    add(b, mk(R, target, { team: 'B', name: 'Target' }));
    start(b, R);
    for (let i = 0; i < 40 && b.status === 'running'; i++) st(b, R);
    return b;
  };
  const brute = mk(R, brawler, { team: 'A' });
  const fists = brute.attacks.find((a) => a.unarmed || a.kind === 'close');
  assert.ok(fists.descriptors.includes('physical'), `close attack is physical: ${fists.descriptors}`);
  // Immune to physical damage: the brute's fists do nothing.
  // Immune to physical damage: the brute knows its fists can't hurt and doesn't waste its turns swinging.
  const b1 = fight(hero('Physical damage'));
  const bruteId = b1.combatants.find((x) => x.name === 'Brute').id;
  assert.ok(!b1.log.some((e) => e.actor === bruteId && ['hit', 'crit', 'condition', 'ko'].includes(e.kind)), 'no damage gets through');
  assert.ok(b1.log.some((e) => e.actor === bruteId && /nothing worth doing/.test(e.text)), 'the brute holds instead of swinging');
  // Half effect: the hits land at half rank.
  const b2 = fight(hero('Physical damage', [{ name: 'Limited to Half Effect' }]));
  assert.ok(b2.log.some((e) => /half effect\): rank/.test(e.text)), 'half immunity halves the rank');
  assert.ok(!b2.log.some((e) => /Target is immune to physical/.test(e.text)));
});
