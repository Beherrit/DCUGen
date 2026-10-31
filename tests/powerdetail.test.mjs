import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { powerCost, primaryOwnCost } from '../src/engine/costs.js';
import { explainPower, statBlockText } from '../src/engine/render.js';

const bolt = () => ({
  name: 'Storm Bolt', effect: 'Damage', rank: 8, range: 'Ranged', extras: [], flaws: [],
  description: 'Violet lightning that smells of ozone.',
  linked: [{ name: 'Blinding Flash', effect: 'Affliction', rank: 8, range: 'Ranged', extras: [], flaws: [], description: 'Everyone nearby sees spots.' }],
  alternates: [{ name: 'Chain Lightning', effect: 'Damage', rank: 8, range: 'Ranged', extras: [], flaws: [] }],
});

test('linked effects add their full cost; a Dynamic array shares the primary as its pool', () => {
  const p = bolt();
  assert.equal(primaryOwnCost(p, R), 32);
  assert.equal(powerCost(p, R), 33);
  p.dynamic = true;
  assert.equal(powerCost(p, R), 35); // +1 for the Dynamic base effect, +2 for the Dynamic AE (DCA 125)
  const notes = explainPower(p, R).notes.map((n) => `${n.name}: ${n.text}`).join('\n');
  assert.match(notes, /Linked: Blinding Flash: Happens at the same time/);
  assert.match(notes, /32-point pool/);
});

test('power descriptions go into the text stat block', () => {
  const ch = { pl: 10, abilities: {}, defenses: {}, skills: [], advantages: [], devices: [], equipment: [], identity: { codename: 'Tempest' }, powers: [{ ...bolt(), dynamic: true }] };
  const text = statBlockText(ch, R);
  assert.match(text, /Storm Bolt: Violet lightning that smells of ozone\./);
  assert.match(text, /Blinding Flash \(linked\): Everyone nearby sees spots\./);
  assert.match(text, /32 points Dynamic pool/);
});
