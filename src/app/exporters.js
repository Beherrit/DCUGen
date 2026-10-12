// File exports: the filled Excel character sheet, roster workbooks, JSON and text.

import { download, slug, toast } from './dom.js';
import { inflateRaw } from './share.js';
import { fillCharacterSheet, rosterWorkbook, readWorkbookCharacters } from '../engine/xlsx.js';
import { portraitPng } from './portrait.js';
import { dossierText, dossierEntries } from '../engine/dossier.js';
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
    let png = null;
    try { png = await portraitPng(ch); } catch { png = null; }
    const bytes = await fillCharacterSheet(await loadTemplate(), ch, R, inflateRaw, { portraitPng: png });
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

/** Stat block text: every form and companion when there are any. */
export function exportText(ch, R) {
  const entries = dossierEntries(ch, R);
  download(`${slug(ch.identity?.codename)}.txt`, dossierText(ch, R), 'text/plain');
  toast(entries.length > 1 ? `Stat blocks saved: ${entries.length} (every form and companion)` : 'Stat block saved');
}

/** An Excel workbook with a summary and a sheet for every form and companion. */
export function exportDossierExcel(ch, R) {
  const list = dossierEntries(ch, R).map((e) => (e.kind === 'companion' ? { ...e.ch, identity: { ...e.ch.identity, codename: `${e.ch.identity?.codename || 'Companion'} (companion)` } } : e.ch));
  exportRosterExcel(list, R, `${ch.identity?.codename || 'character'} dossier`);
}

/** Read characters from a DCUGen file: a character or roster .json, or a DCUGen Excel export (.xlsx). */
export async function readCharactersFile(file) {
  const valid = (list) => list.filter((c) => c && c.abilities && c.pl);
  if (/\.xlsx$/i.test(file.name) || file.type === XLSX_TYPE) {
    const list = await readWorkbookCharacters(new Uint8Array(await file.arrayBuffer()), inflateRaw);
    if (!list) throw new Error(`${file.name} has no DCUGen data. Only sheets exported from DCUGen can be imported.`);
    return valid(list);
  }
  const data = JSON.parse(await file.text());
  return valid(Array.isArray(data) ? data : Array.isArray(data.characters) ? data.characters : [data]);
}
