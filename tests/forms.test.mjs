import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { addForm, switchForm, removeForm, renameForm, hasForms, activeForm, formCharacters, MAX_FORMS } from '../src/engine/forms.js';
import { checkLimits } from '../src/engine/limits.js';
import { keyFor, fromKey } from '../src/engine/keys.js';
import { generateCharacter } from '../src/engine/generator.js';

const load = () => JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url)));

test('a second form starts as a copy and switching keeps each build separate', () => {
  let ch = addForm(load(), { copy: true });
  assert.ok(hasForms(ch));
  assert.equal(activeForm(ch), 0);
  ch = switchForm(ch, 1);
  ch.abilities.Strength = 1; ch.powers = []; ch.pl = 2; ch.identity.codename = 'Evan';
  ch = switchForm(ch, 0);
  assert.equal(ch.abilities.Strength, 9);
  assert.equal(ch.powers.length, 4);
  assert.equal(ch.pl, 10);
  assert.equal(ch.identity.codename, 'Shadowshot - Blue armor');
  assert.equal(ch.identity.realName, 'Evan Lianne', 'the person is shared');
  ch = switchForm(ch, 1);
  assert.equal(ch.abilities.Strength, 1);
  assert.equal(ch.identity.codename, 'Evan');
  assert.equal(ch.pl, 2);
});

test('each form is checked as its own build', () => {
  let ch = switchForm(addForm(load(), { copy: false }), 1);
  ch.abilities.Strength = 30;
  const [a, b] = formCharacters(ch);
  assert.ok(!checkLimits(a, R).some((i) => i.message.includes('Strength 30')));
  assert.ok(checkLimits(b, R).some((i) => i.severity === 'error' && i.message.includes('Strength 30')));
});

test('up to 8 forms; removing down to one turns forms off', () => {
  let ch = load();
  for (let i = 1; i < MAX_FORMS; i++) ch = addForm(ch);
  assert.equal(ch.forms.length, MAX_FORMS);
  assert.throws(() => addForm(ch));
  ch = renameForm(ch, 3, 'Wolf');
  assert.equal(ch.forms[3].name, 'Wolf');
  assert.equal(removeForm(ch, 0), ch, 'the active form stays');
  for (let i = MAX_FORMS - 1; i >= 1; i--) ch = removeForm(ch, i);
  assert.equal(ch.forms, undefined);
});

test('a rolled character with forms keeps them through its key', async () => {
  let ch = generateCharacter(R, { seed: 'forms-key', pl: 8 });
  ch = switchForm(addForm(ch), 1);
  ch.abilities.Strength += 3;
  const found = await keyFor(R, ch);
  assert.equal(found.kind, 'edits');
  const back = (await fromKey(R, found.key)).character;
  assert.equal(back.forms.length, 2);
  assert.equal(back.activeForm, 1);
  assert.equal(back.abilities.Strength, ch.abilities.Strength);
  assert.equal(switchForm(back, 0).abilities.Strength, ch.abilities.Strength - 3);
});
