import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { martialCards } from '../src/app/rules-martial.js';

const cards = martialCards(R);
const inCat = (cat) => cards.filter((c) => c.cat === cat);

test('the Rules tab has a card for every fighting style, with its page', () => {
  const styles = inCat('Fighting styles');
  assert.equal(styles.length, 166);
  const aikido = styles.find((c) => c.title === 'Aikido');
  assert.match(aikido.meta, /Traditional/);
  assert.match(aikido.details, /Stances: Avoiding, Blocking/);
  assert.match(aikido.details, /Soft Landing/);
  assert.equal(aikido.source, 'MA 172');
});

test('stances: the rules, a table of every stance with DC, benefits and detriments, and a card each', () => {
  const stances = inCat('Stances');
  const table = stances.find((c) => c.title === 'Stances (table)');
  assert.equal(table.table[0].join('|'), 'Stance|DC|Benefits|Detriments');
  assert.equal(table.table.length - 1, 33);
  assert.deepEqual(table.table.find((r) => r[0] === 'Blocking').slice(0, 2), ['Blocking', 13]);
  assert.ok(stances.some((c) => c.title === 'Fighting style stances: the rules' && /Neutral/.test(c.summary)));
  assert.equal(stances.length, 33 + 2);
});

test('combat maneuvers: a table of the basic ones and a card for each of the 136', () => {
  const man = inCat('Combat maneuvers');
  assert.equal(man.length, 136 + 1);
  assert.ok(man[0].table.length > 30);
  const soft = man.find((c) => c.title === 'Soft Landing');
  assert.match(soft.meta, /1 point per 2 ranks/);
  assert.equal(soft.source, 'MA 154');
});

test('weapons, headquarters features and the optional rules are there, each with a page', () => {
  assert.equal(inCat('Weapons').length, 38 + 127 + 6 + 29 + 7);
  assert.ok(inCat('Headquarters').some((c) => c.title === 'Dojo (Fighting Style)'));
  const optional = inCat('Optional rules');
  for (const name of ['Hit Location', 'Disabling Critical Hits', 'Off-Hand Attacks', 'Unarmed Defense against Close Combat Weapons', 'Entangle Weapon', 'Buy Time']) {
    assert.ok(optional.some((c) => c.title === name), name);
  }
  const hit = optional.find((c) => c.title === 'Hit Location');
  assert.equal(hit.table.length - 1, 8);
  for (const c of cards) assert.match(c.source || '', /^MA \d+(-\d+)?$/, `${c.cat}: ${c.title}`);
});

test('the new advantages, extras and flaws carry their Martial Arts page', () => {
  const ma = R.raw.advantages.filter((a) => /^MA /.test(a.source || ''));
  assert.ok(ma.length > 100);
  assert.ok(R.raw.modifiers.extras.some((m) => /^MA/.test(m.source || '')));
  assert.ok(R.raw.modifiers.flaws.some((m) => /^MA/.test(m.source || '')));
});
