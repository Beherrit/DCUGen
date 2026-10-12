import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RULES as R } from '../src/engine/index.js';
import { dossierText, dossierEntries } from '../src/engine/dossier.js';
import { addForm, switchForm, renameForm } from '../src/engine/forms.js';
import { asCompanion, blankCompanion } from '../src/engine/companions.js';
import { statBlockText } from '../src/engine/render.js';

const load = () => JSON.parse(fs.readFileSync(new URL('./fixtures/shadowshot.json', import.meta.url)));

test('a plain character exports as its stat block', () => {
  const ch = load();
  assert.equal(dossierText(ch, R).trim(), statBlockText(ch, R).trim());
});

test('the dossier has every form and companion, and the pool state', () => {
  let ch = renameForm(addForm(load(), { copy: false }), 1, 'Civilian');
  ch = switchForm(ch, 1);
  ch.identity.codename = 'Evan';
  ch = switchForm(ch, 0);
  ch.companions = [asCompanion(blankCompanion(2, 'Ace'), 'companion')];
  Object.assign(ch.powers[3], { pool: true, placed: [{ target: 'Strength', points: 2 }] });
  const e = dossierEntries(ch, R);
  assert.deepEqual(e.map((x) => x.title), ['Form 1: Form 1', 'Form 2: Civilian', 'Companion: Ace']);
  const text = dossierText(ch, R);
  assert.match(text, /FORM 2: CIVILIAN/);
  assert.match(text, /EVAN \(CIVILIAN\)/);
  assert.match(text, /COMPANION: ACE/);
  assert.match(text, /Physical stat redistribution: pool 4\/12 pp placed \(Strength \+2\)/);
});
