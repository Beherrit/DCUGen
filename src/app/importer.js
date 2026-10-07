// Import characters from anywhere: DCUGen Excel sheets, .json files, share codes and links.
// Imported characters open in new Forge tabs and can be saved to the roster in the same step.

import { h, toast, openDialog } from './dom.js';
import { upsert, emit } from './store.js';
import { readCharactersFile } from './exporters.js';
import { decodeCharacter, decodePaper, isPaperKey, decodeHandout, isHandoutKey } from './share.js';
import { fromKey } from '../engine/keys.js';

let hooks = { open: null, afterSave: null, openPaper: null, openHandout: null };

/** open(ch) shows a character in a new Forge tab; afterSave() refreshes roster views. */
export function setImportHooks(h2) { hooks = { ...hooks, ...h2 }; }

const ACCEPT = '.xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Bring characters in. Returns how many were imported. */
export async function importCharacters(list, { open = true, save = true } = {}) {
  let n = 0;
  for (const raw of list) {
    if (!raw) continue;
    const ch = { ...raw };
    delete ch.rosterId;
    delete ch.savedAt;
    const kept = save ? upsert(ch) : ch;
    if (open) hooks.open?.(kept);
    n++;
  }
  if (save && n) { emit('roster'); hooks.afterSave?.(); }
  return n;
}

async function readAll(files, text) {
  const out = [];
  if (text && text.trim()) out.push(await openAnything(text.trim()));
  for (const f of files || []) out.push(...(await readCharactersFile(f)));
  return out;
}

let R = null;
export function setImportRules(rules) { R = rules; }

/** A character key (DCUK1/DCUP1), a share code or link, or character JSON. */
export async function openAnything(text) {
  const t = text.trim();
  if (isPaperKey(t)) { hooks.openPaper?.(await decodePaper(t)); return null; }
  if (isHandoutKey(t)) { hooks.openHandout?.(await decodeHandout(t)); return null; }
  const keyMatch = /DCU[KPE]1\.[A-Za-z0-9%._~-]+/.exec(t);
  if (keyMatch && !/DCU1\./.test(t)) {
    const { character, versionMatch, edited } = await fromKey(R, keyMatch[0]);
    if (!versionMatch) toast(edited ? 'That key was made with a different version of DCUGen: its edits are exact, other details may differ from what its owner sees.' : 'That key was made with a different version of DCUGen, so details may differ from what its owner sees.');
    return character;
  }
  return decodeCharacter(t);
}

export async function importFiles(files, opts) {
  try {
    const list = await readAll(files, '');
    const n = await importCharacters(list, opts);
    toast(n ? `Imported ${n} character${n === 1 ? '' : 's'}${opts?.save === false ? '' : ' and saved to your roster'}` : 'No characters found in that file');
  } catch (e) {
    toast(`Import failed: ${e.message}`);
  }
}

export async function importDialog({ open = true } = {}) {
  const area = h('textarea', { id: 'import-code', placeholder: 'Paste a character key (DCUK1... / DCUP1... / DCUE1...), a front-page or handout key (DCUN1... / DCUH1...), a share code or link, or character JSON' });
  const file = h('input', { type: 'file', id: 'import-file', accept: ACCEPT, multiple: true });
  const save = h('input', { type: 'checkbox', id: 'import-save', checked: true });
  const openIt = h('input', { type: 'checkbox', id: 'import-open', checked: open });
  const res = await openDialog({
    title: 'Import characters',
    body: [
      h('p', { style: { margin: 0 } }, 'Got a character from your GM or another player? Bring it in here. Everything (powers, advancement history, notes) comes across.'),
      h('label', { class: 'field' }, h('span', null, 'Files: DCUGen Excel sheets (.xlsx), character or roster files (.json)'), file),
      h('label', { class: 'field' }, h('span', null, 'Or paste a character key, share code or link'), area),
      h('label', { class: 'check' }, save, ' Save to my roster'),
      h('label', { class: 'check' }, openIt, ' Open in Forge tabs'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Tip: you can also drag files straight onto the page.'),
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Import', value: true, primary: true }],
  });
  if (!res) return 0;
  try {
    const list = await readAll(file.files, area.value);
    const n = await importCharacters(list, { open: openIt.checked, save: save.checked });
    toast(n ? `Imported ${n} character${n === 1 ? '' : 's'}${save.checked ? ' and saved to your roster' : ''}` : 'Nothing to import');
    return n;
  } catch (e) {
    toast(`Import failed: ${e.message}`);
    return 0;
  }
}

/** Drop .xlsx / .json files anywhere on the page to import them. */
export function enableDropImport(target = document.body) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  target.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; document.body.classList.add('drop-ready'); });
  target.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  target.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('drop-ready'); });
  target.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('drop-ready');
    const files = [...e.dataTransfer.files].filter((f) => /\.(xlsx|json)$/i.test(f.name));
    if (!files.length) { toast('Drop a DCUGen .xlsx or .json file to import it'); return; }
    importFiles(files, { open: true, save: true });
  });
}
