// File exports: the filled Excel character sheet, roster workbooks, JSON and text.

import { download, slug, toast } from './dom.js';
import { inflateRaw } from './share.js';
import { fillCharacterSheet, rosterWorkbook } from '../engine/xlsx.js';
import { statBlockText } from '../engine/render.js';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function loadTemplate() {
  if (window.DCUGEN_SHEET_TEMPLATE) {
    const bin = atob(window.DCUGEN_SHEET_TEMPLATE);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const res = await fetch('../../data/sheet_template.xlsx');
  if (!res.ok) throw new Error('The Excel template could not be loaded.');
  return new Uint8Array(await res.arrayBuffer());
}

export async function exportExcel(ch, R) {
  try {
    const bytes = await fillCharacterSheet(await loadTemplate(), ch, R, inflateRaw);
    download(`${slug(ch.identity?.codename)}.xlsx`, new Blob([bytes], { type: XLSX_TYPE }));
    toast('Excel character sheet saved');
  } catch (e) {
    toast(`Excel export failed: ${e.message}`);
  }
}

export function exportRosterExcel(characters, R, name = 'dcugen-roster') {
  const bytes = rosterWorkbook(characters, R);
  download(`${slug(name)}.xlsx`, new Blob([bytes], { type: XLSX_TYPE }));
  toast(`Saved ${characters.length} character${characters.length === 1 ? '' : 's'} to Excel`);
}

export function exportJson(ch) {
  download(`${slug(ch.identity?.codename)}.dcugen.json`, JSON.stringify(ch, null, 2), 'application/json');
  toast('Character file saved');
}

export function exportRosterJson(characters) {
  download('dcugen-roster.json', JSON.stringify({ app: 'DCUGen', version: 1, characters }, null, 2), 'application/json');
  toast('Roster file saved');
}

export function exportText(ch, R) {
  download(`${slug(ch.identity?.codename)}.txt`, statBlockText(ch, R), 'text/plain');
  toast('Stat block saved');
}

/** Read characters from a .json file (a single character or a roster file). */
export async function readCharactersFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : Array.isArray(data.characters) ? data.characters : [data];
  return list.filter((c) => c && c.abilities && c.pl);
}
