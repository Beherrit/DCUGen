import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter, generateTeam } from '../src/engine/generator.js';
import { fillCharacterSheet, rosterWorkbook, unzip, setCell, templateCells, readWorkbookCharacters } from '../src/engine/xlsx.js';
import { awardPoints } from '../src/engine/advancement.js';
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
  assert.equal(full.length, 3); // sheet, Full Stat Block, hidden DCUGen Data
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
  assert.equal((wb.match(/<sheet /g) || []).length, 5); // + hidden DCUGen Data
  assert.match(text(files['xl/worksheets/sheet1.xml']), /Codename/);
});

test('stat block text follows the book layout', () => {
  const ch = generateCharacter(R, { seed: 'text-1' });
  const t = statBlockText(ch, R);
  for (const part of ['STR ', 'Offense:', 'Defense:', 'Power Points: Abilities', `= ${ch.pl * 15}`]) assert.ok(t.includes(part), part);
});

test('DCUGen Excel exports import back exactly (character and roster)', async () => {
  const ch = generateCharacter(R, { seed: 'roundtrip-1', pl: 9 });
  ch.notes = 'Quotes "and" <tags> & ampersands';
  awardPoints(ch, R, 2, 'Session 1');
  const back = await readWorkbookCharacters(await fillCharacterSheet(template, ch, R, inflate), inflate);
  assert.equal(back.length, 1);
  assert.deepEqual(back[0], JSON.parse(JSON.stringify(ch)));
  const team = generateTeam(R, { seed: 'roundtrip-team', size: 3, pl: 8 }).members;
  const roster = await readWorkbookCharacters(rosterWorkbook(team, R), inflate);
  assert.equal(roster.length, team.length);
  assert.equal(roster[1].identity.codename, team[1].identity.codename);
  assert.equal(await readWorkbookCharacters(template, inflate), null);
});

test('a portrait PNG is embedded in the Excel sheet as a picture', async () => {
  const { embedImage, fillCharacterSheet, unzip } = await import('../src/engine/xlsx.js');
  const fs = await import('node:fs');
  const zlib = await import('node:zlib');
  const inflateRaw = async (bytes) => new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes)));
  const template = new Uint8Array(fs.readFileSync(new URL('../data/sheet_template.xlsx', import.meta.url)));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const ch = generateCharacter(R, { seed: 'xlsx-portrait' });
  const bytes = await fillCharacterSheet(template, ch, R, inflateRaw, { portraitPng: png });
  const files = await unzip(bytes, inflateRaw);
  assert.ok(files['xl/media/image1.png'], 'media part');
  const dec = new TextDecoder();
  assert.ok(dec.decode(files['xl/drawings/drawing1.xml']).includes('<xdr:pic>'));
  assert.ok(dec.decode(files['xl/drawings/_rels/drawing1.xml.rels']).includes('media/image1.png'));
  assert.ok(dec.decode(files['[Content_Types].xml']).includes('Extension="png"'));
  // a workbook without a drawing gets one
  const plain = { '[Content_Types].xml': new TextEncoder().encode('<Types><Default Extension="rels" ContentType="x"/></Types>'), 'xl/worksheets/sheet1.xml': new TextEncoder().encode('<worksheet><sheetData/><pageMargins/></worksheet>') };
  embedImage(plain, png, { col: 0, row: 0 });
  assert.ok(dec.decode(plain['xl/worksheets/sheet1.xml']).includes('<drawing r:id="rId1"/>'));
  assert.ok(plain['xl/drawings/drawing1.xml'] && plain['xl/worksheets/_rels/sheet1.xml.rels']);
});
