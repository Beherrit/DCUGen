import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { parseHit, resolveHit, statusOf, spotlight, complicationPrompts, describeHit } from '../src/engine/gmboard.js';

const load = () => { const c = JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url))); c.powers[3].pool = true; return c; };
const names = ['Shadowshot - Blue armor', 'Spark', 'Doctor Null'];
const dice = (...rolls) => { const q = [...rolls]; return () => q.shift(); };

test('hits typed in plain words', () => {
  const h = parseHit('Burst Damage 10 hits Shadowshot and Spark', names);
  assert.deepEqual([h.effect, h.rank, h.resist, h.dc, h.area], ['Damage', 10, 'Toughness', 25, true]);
  assert.deepEqual(h.targets, ['Shadowshot - Blue armor', 'Spark']);
  const a = parseHit('Affliction 8 vs Fortitude on Spark', names);
  assert.deepEqual([a.effect, a.resist, a.dc, a.area, a.targets], ['Affliction', 'Fortitude', 18, false, ['Spark']]);
  assert.equal(parseHit('Weaken Strength 6 hits everyone', names).targets.length, 3);
  assert.equal(parseHit('Weaken Presence 6 hits Spark', names).resist, 'Will');
  assert.match(parseHit('Damage hits Spark', names).error, /rank/);
  assert.match(parseHit('Damage 10', names).error, /who/);
  assert.match(describeHit(h), /Area Damage 10: Toughness DC 25, Dodge DC 20 for half/);
});

test('damage resolves on the character: area Dodge for half, then Toughness', () => {
  const ch = load(); // Dodge 6, Toughness 14
  let r = resolveHit(ch, { effect: 'Damage', rank: 10, resist: 'Toughness', area: true }, R, dice(19, 2));
  assert.match(r.text, /dives clear .* half effect, rank 5/);
  assert.equal(r.dice[1].dc, 20);
  assert.equal(r.play.bruises, 1, '2 + 14 = 16 vs 20: a bruise');
  r = resolveHit(ch, { effect: 'Damage', rank: 10, resist: 'Toughness', area: false }, R, dice(1));
  assert.equal(r.play.damage, 'dazed', '1 + 14 = 15 vs 25: two degrees');
});

test('afflictions add their conditions by degree; weaken drains points', () => {
  const ch = load();
  let r = resolveHit(ch, { effect: 'Affliction', rank: 10, resist: 'Will' }, R, dice(1));
  assert.ok(r.play.conditions.includes('Stunned') || r.play.damage === 'incapacitated');
  r = resolveHit(ch, { effect: 'Weaken', rank: 8, resist: 'Fortitude', trait: 'Strength' }, R, dice(1));
  assert.equal(r.play.weakened.Strength, Math.min(8, 18 - (1 + statusOf(ch, R).defenses.Fortitude)));
});

test('status, spotlight and complication prompts', () => {
  const ch = load();
  const s = statusOf(ch, R);
  assert.equal(s.name, 'Shadowshot - Blue armor');
  assert.equal(s.defenses.Toughness, 14);
  const t0 = '2026-10-12T10:00:00Z';
  const entries = [{ t: '2026-10-12T10:05:00Z', who: 'Spark', text: 'Spark rolls…', dice: { roll: 20 } }, { t: '2026-10-12T09:00:00Z', who: 'Shadowshot - Blue armor', text: 'old' }];
  const sp = spotlight([{ key: 'a', name: 'Shadowshot - Blue armor' }, { key: 'b', name: 'Spark' }], entries, {}, t0);
  assert.equal(sp[0].name, 'Shadowshot - Blue armor', 'least spotlight first');
  assert.equal(sp[1].score, 3);
  ch.complications = [{ type: 'Weakness to Gold (contact)', text: 'Loss of Flight, Etheneural Absorption, all but 1 Protection from armor, Str and Sta reduced to 1' }];
  const prompts = complicationPrompts('A charity gala at the gold exchange, reporters everywhere', [{ key: 'a', name: 'Shadowshot', complications: ch.complications }, { key: 'b', name: 'Spark', complications: [{ type: 'Secret Identity', text: 'Esme the delivery driver' }] }]);
  assert.deepEqual(prompts.map((p) => p.name).sort(), ['Shadowshot', 'Spark']);
  assert.ok(prompts.find((p) => p.name === 'Shadowshot').why.includes('gold'));
});
