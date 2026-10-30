import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { RULES as R } from '../src/engine/index.js';
import { sheet, statBlockText } from '../src/engine/render.js';
import { statBlockRows, fillCharacterSheet, readWorkbookCharacters } from '../src/engine/xlsx.js';
import { switchForm, addForm } from '../src/engine/forms.js';
import { characterKey, keyFor, fromKey } from '../src/engine/keys.js';
import { encodeCharacter, decodeCharacter } from '../src/app/share.js';
import { generateCharacter } from '../src/engine/generator.js';
import { addStyle } from '../src/engine/martial/styles.js';
import { addManeuver } from '../src/engine/martial/maneuvers.js';
import { buyWholeStyle } from '../src/engine/martial/template.js';
import { diffTraits } from '../src/engine/advancement.js';

const base = () => ({
  pl: 10, abilities: { Strength: 2, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 4, Intellect: 0, Awareness: 0, Presence: 0 },
  defenses: {}, skills: [], advantages: [], powers: [], identity: { codename: 'Tester' }, theme: { name: 'Martial' },
});

function trained() {
  const ch = base();
  addStyle(ch, R, 'Aikido', { tier: 'student' });
  addManeuver(ch, R, 'Aikido', { name: 'Soft Landing', rank: 4 });
  addManeuver(ch, R, 'Aikido', { name: 'Throw' });
  return ch;
}

test('the sheet lists styles with stances and maneuvers, and keeps maneuvers out of the powers', () => {
  const s = sheet(trained(), R);
  assert.equal(s.powers.length, 0);
  assert.equal(s.styles.length, 1);
  const a = s.styles[0];
  assert.equal(a.tierLabel, 'Student');
  assert.ok(a.stances.some((x) => x.name === 'Blocking' && x.dc === 13 && /Parry/.test(x.line)));
  assert.deepEqual(a.maneuvers.map((m) => m.label), ['Soft Landing', 'Throw']);
  assert.match(a.maneuvers[1].line, /damage Str\+4/);
  assert.equal(s.cost.styles, a.cost);
});

test('the text stat block and the Excel rows carry the styles and their points', () => {
  const ch = trained();
  const text = statBlockText(ch, R);
  assert.match(text, /Fighting styles: Aikido \(Student, \d+ points\)/);
  assert.match(text, /Stances: .*Blocking \(DC 13\)/);
  assert.match(text, /Fighting styles \d+ = \d+/);
  const { rows } = statBlockRows(ch, R);
  assert.ok(rows.some((r) => r[0] === 'FIGHTING STYLES'));
  assert.ok(rows.some((r) => /Soft Landing 4/.test(r[0]) && r[1] === 2));
  assert.ok(rows.some((r) => r[0] === 'Fighting styles' && r[1] > 0));
});

test('a character with no styles prints exactly as before', () => {
  const text = statBlockText(base(), R);
  assert.ok(!/Fighting styles/.test(text));
  assert.ok(!statBlockRows(base(), R).rows.some((r) => /FIGHTING STYLES/.test(String(r[0]))));
});

test('share codes and keys keep the styles', async () => {
  const ch = generateCharacter(R, { seed: 'styles-key', pl: 10 });
  buyWholeStyle(ch, R, 'Aikido', { tier: 'student' });
  const back = await decodeCharacter(await encodeCharacter(ch));
  assert.deepEqual(back.styles, ch.styles);
  const made = await keyFor(R, ch);
  assert.equal(made.kind, 'edits', 'a style added after the roll makes it an edited key');
  assert.deepEqual((await fromKey(R, made.key)).character.styles, ch.styles, 'an edited roll still opens with its style');
  const plain = generateCharacter(R, { seed: 'styles-key', pl: 10 });
  assert.ok(characterKey(R, plain), 'a character with no styles keeps its short key');
});

test('each alternate form keeps its own styles', () => {
  const ch = trained();
  const two = addForm(ch, { copy: false, name: 'Civilian' });
  const civ = switchForm(two, 1);
  assert.equal(civ.styles, undefined);
  const back = switchForm(civ, 0);
  assert.equal(back.styles[0].name, 'Aikido');
});

test('the advancement log names a style learned and its tier', () => {
  const before = base();
  const after = trained();
  const lines = diffTraits(before, after, R).map((d) => d.text);
  assert.ok(lines.some((t) => /New fighting style: Aikido \(student\)/.test(t)));
  assert.ok(lines.some((t) => /New power: Soft Landing/.test(t)));
});

test('the Excel sheet fills in the styles and imports back with them', async () => {
  const template = new Uint8Array(fs.readFileSync(new URL('../data/sheet_template.xlsx', import.meta.url)));
  const inflate = (b) => zlib.inflateRawSync(b);
  const ch = generateCharacter(R, { seed: 'styles-xlsx', pl: 10 });
  buyWholeStyle(ch, R, 'Aikido', { tier: 'student' });
  const bytes = await fillCharacterSheet(template, ch, R, inflate);
  const back = await readWorkbookCharacters(bytes, inflate);
  assert.deepEqual(back[0].styles, JSON.parse(JSON.stringify(ch.styles)));
});
