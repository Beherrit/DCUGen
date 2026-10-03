import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter, generateTeam } from '../src/engine/generator.js';
import { fillCharacterSheet, rosterWorkbook, unzip, setCell, templateCells } from '../src/engine/xlsx.js';
import { statBlockText } from '../src/engine/render.js';

const template = new Uint8Array(fs.readFileSync(new URL('../data/sheet_template.xlsx', import.meta.url)));
const inflate = (b) => zlib.inflateRawSync(b);
const text = (bytes) => new TextDecoder().decode(bytes);

test('filled character sheet keeps the template and adds a Full Stat Block sheet', async () => {
  const ch = generateCharacter(R, { seed: 'sheet-1', archetype: 'blaster', pl: 10 });
  const out = await fillCharacterSheet(template, ch, R, inflate);
  const files = await unzip(out, inflate);
  const sheet1 = text(files['xl/worksheets/sheet1.xml']);
  const wb = text(files['xl/workbook.xml']);
  assert.ok(sheet1.includes(ch.identity.codename.replace(/&/g, '&amp;')));
  assert.match(wb, /name="Full Stat Block"/);
  assert.ok(files['xl/drawings/drawing1.xml'], 'template drawing kept');
  const full = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  assert.equal(full.length, 2);
  assert.match(text(files['[Content_Types].xml']), /sheet2\.xml/);
});

test('template cells put the key numbers where the sheet expects them', () => {
  const ch = generateCharacter(R, { seed: 'sheet-2', pl: 11 });
  const cells = templateCells(ch, R);
  assert.equal(cells.W33, 11);
  assert.equal(cells.AD33, 165);
  assert.equal(cells.K2, ch.identity.codename);
  assert.equal(typeof cells.N18, 'number');
});

test('setCell replaces values, keeps styles, and inserts missing cells in column order', () => {
  const xml = '<worksheet><sheetData><row r="2"><c r="B2" s="5"/><c r="D2" s="7"><v>1</v></c></row></sheetData></worksheet>';
  let out = setCell(xml, 'B2', 'Hero & Co');
  assert.match(out, /<c r="B2" s="5" t="inlineStr"><is><t xml:space="preserve">Hero &amp; Co<\/t><\/is><\/c>/);
  out = setCell(out, 'C2', 42);
  assert.match(out, /<c r="B2"[\s\S]*<c r="C2"><v>42<\/v><\/c><c r="D2"/);
  out = setCell(out, 'A5', 'x');
  assert.match(out, /<\/row><row r="5">/);
});

test('roster workbook has a summary sheet and one sheet per character', async () => {
  const team = generateTeam(R, { seed: 'wb-team', size: 3 });
  const files = await unzip(rosterWorkbook(team.members, R), inflate);
  const wb = text(files['xl/workbook.xml']);
  assert.equal((wb.match(/<sheet /g) || []).length, 4);
  assert.match(text(files['xl/worksheets/sheet1.xml']), /Codename/);
});

test('stat block text follows the book layout', () => {
  const ch = generateCharacter(R, { seed: 'text-1' });
  const t = statBlockText(ch, R);
  for (const part of ['STR ', 'Offense:', 'Defense:', 'Power Points: Abilities', `= ${ch.pl * 15}`]) assert.ok(t.includes(part), part);
});
