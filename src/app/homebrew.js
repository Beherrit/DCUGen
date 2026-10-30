// Workshop > Homebrew: make your own power themes, archetypes and creatures from the built-in ones, keep them in
// packs, switch packs on and off, and share a pack as a file (or a code) your players load.

import { h, clear, toast, download, openDialog, copyText, slug } from './dom.js';
import { state } from './store.js';
import { emptyPack, makeTheme, makeArchetype, creatureFromCharacter, validatePack, applyPacks } from '../engine/homebrew.js';
import { ABILITIES } from '../engine/rules.js';
import { PACKS } from '../generated/rulesdata.js';

const KEY = 'dcugen.homebrew.v1';
let R; let hooks = {};
let packs = load();
let openId = null;

function load() {
  try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(packs)); } catch { toast('Couldn\'t save: storage is full'); } }

/** Load the switched-on packs into the rules. Call at start, and after any change. */
export function initHomebrew(rules, h2 = {}) {
  R = rules; hooks = h2;
  const n = applyPacks(R, packs);
  return n;
}

function changed(msg) {
  save();
  applyPacks(R, packs);
  hooks.changed?.();
  if (msg) toast(msg);
  hooks.rerender?.();
}

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pack = () => packs.find((p) => p.id === openId) || null;
const field = (label, control, hint) => h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', { class: 'hint' }, hint) : null);

// ---- sharing ---------------------------------------------------------------------------------------------------

const b64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

/** "DCUB1." + base64url(deflate(pack JSON)): a pack as one line to paste in a chat. */
export async function packCode(p) {
  const { enabled, ...clean } = p;
  return `DCUB1.${b64(await pipe(new TextEncoder().encode(JSON.stringify(clean)), new CompressionStream('deflate-raw')))}`;
}
export const isPackCode = (t) => /DCUB1\.[A-Za-z0-9_-]{8,}/.test(String(t || ''));
async function fromCode(text) {
  const m = /DCUB1\.([A-Za-z0-9_-]+)/.exec(String(text || ''));
  if (!m) throw new Error('That isn\'t a homebrew pack code (they start with DCUB1.)');
  return JSON.parse(new TextDecoder().decode(await pipe(unb64(m[1]), new DecompressionStream('deflate-raw'))));
}

/** Add a pack from a file's text or a code; a pack with the same id is replaced. Returns the pack or null. */
export async function importPack(textOrObject) {
  let raw = textOrObject;
  try {
    if (typeof raw === 'string') raw = isPackCode(raw) ? await fromCode(raw) : JSON.parse(raw);
  } catch (e) { toast(e.message.startsWith('That') ? e.message : 'That file isn\'t a homebrew pack'); return null; }
  const { ok, errors, pack: p } = validatePack(raw);
  if (!ok) { toast(errors[0] || 'That isn\'t a homebrew pack'); return null; }
  const was = packs.findIndex((x) => x.id === p.id);
  p.enabled = true;
  if (was >= 0) packs[was] = p; else packs.push(p);
  openId = p.id;
  changed(`${p.name}: ${p.themes.length} theme${p.themes.length === 1 ? '' : 's'}, ${p.archetypes.length} archetype${p.archetypes.length === 1 ? '' : 's'}, ${p.creatures.length} creature${p.creatures.length === 1 ? '' : 's'} loaded${errors.length ? ` (${errors.length} skipped)` : ''}`);
  return p;
}

// ---- making things -----------------------------------------------------------------------------------------------

async function themeDialog(p) {
  const book = R.raw.themes.filter((t) => !t.homebrew).sort((a, b) => a.name.localeCompare(b.name));
  const base = h('select', { id: 'hb-theme-base', 'aria-label': 'Start from' }, book.map((t) => h('option', { value: t.id }, t.name)));
  const name = h('input', { type: 'text', id: 'hb-theme-name', placeholder: 'e.g. Hellfire, Chronomancy, Nanites' });
  const color = h('input', { type: 'color', value: '#7a1fa2', 'aria-label': 'Color' });
  const desc = h('input', { type: 'text', placeholder: 'hellfire, brimstone', 'aria-label': 'Descriptors' });
  const words = h('input', { type: 'text', placeholder: 'Brimstone, Hellion, Pyre', 'aria-label': 'Codename words' });
  const adjs = h('input', { type: 'text', placeholder: 'Infernal, Damned', 'aria-label': 'Codename adjectives' });
  const costume = h('input', { type: 'text', placeholder: 'black and violet, red and bone', 'aria-label': 'Costume colours' });
  const weak = h('input', { type: 'text', placeholder: 'holy water, true names', 'aria-label': 'Weaknesses' });
  const powersBox = h('div', { class: 'hb-powers' });
  const drawPowers = () => {
    clear(powersBox);
    const t = R.raw.themes.find((x) => x.id === base.value);
    (t?.powers || []).forEach((pw, i) => powersBox.append(h('div', { class: 'hb-power', 'data-i': i },
      h('label', { class: 'hb-keep' }, h('input', { type: 'checkbox', checked: true, 'aria-label': 'Keep this power' }), h('small', null, `${pw.role} · ${pw.effect}${pw.range ? ` · ${pw.range}` : ''}`)),
      h('input', { type: 'text', value: (pw.names || []).join(', '), 'aria-label': `Names for ${pw.effect}` }))));
  };
  base.addEventListener('change', drawPowers);
  drawPowers();
  const ok = await openDialog({
    title: 'New power theme',
    body: [
      h('p', { class: 'hint', style: { margin: 0 } }, 'Start from the theme that works most like yours: its powers come along, renamed as you like. Rolls only use your theme when you pick it on the Forge.'),
      h('div', { class: 'add-row' }, field('Start from', base), field('Name', name), field('Color', color)),
      field('Descriptors', desc, 'Comma-separated. What the powers are made of.'),
      h('div', { class: 'add-row' }, field('Codename words', words), field('Codename adjectives', adjs)),
      h('div', { class: 'add-row' }, field('Costume colours', costume), field('Weaknesses', weak)),
      h('div', { class: 'label' }, 'Powers (rename them, or untick to drop)'), powersBox,
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Add theme', value: true, primary: true }],
  });
  if (!ok) return;
  const powers = {};
  powersBox.querySelectorAll('.hb-power').forEach((row) => { const i = Number(row.dataset.i); powers[i] = { off: !row.querySelector('input[type=checkbox]').checked, names: row.querySelector('input[type=text]').value }; });
  try {
    p.themes.push(makeTheme(R, p, { base: base.value, name: name.value, color: color.value, descriptors: desc.value, words: words.value, adjectives: adjs.value, costume: costume.value, weakness: weak.value, powers }));
    changed(`Theme "${name.value.trim()}" added: pick it under Power theme on the Forge`);
  } catch (e) { toast(e.message); }
}

async function archetypeDialog(p) {
  const book = R.raw.archetypes.filter((a) => !a.homebrew && !a.hidden).sort((a, b) => a.name.localeCompare(b.name));
  const base = h('select', { id: 'hb-arch-base', 'aria-label': 'Start from' }, book.map((a) => h('option', { value: a.id }, a.name)));
  const name = h('input', { type: 'text', id: 'hb-arch-name', placeholder: 'e.g. Fallen Angel, Street Shaman' });
  const blurb = h('input', { type: 'text', placeholder: 'One line: what they do', 'aria-label': 'Blurb' });
  const abil = Object.fromEntries(ABILITIES.map((a) => [a, h('input', { type: 'text', 'aria-label': a, size: 9 })]));
  const themeIn = h('div', { class: 'hb-themes' });
  const fill = () => {
    const a = R.raw.archetypes.find((x) => x.id === base.value);
    for (const k of ABILITIES) abil[k].value = a?.abilities?.[k] ?? '';
    clear(themeIn);
    for (const t of R.raw.themes.slice().sort((x, y) => (y.homebrew ? 1 : 0) - (x.homebrew ? 1 : 0) || x.name.localeCompare(y.name))) {
      const w = a?.themes?.[t.id] || 0;
      themeIn.append(h('label', { class: `hb-theme-w ${w ? 'on' : ''}` }, h('span', null, `${t.name}${t.homebrew ? ' (homebrew)' : ''}`), h('input', { type: 'number', min: 0, max: 10, value: w, 'data-theme': t.id, 'aria-label': `${t.name} weight` })));
    }
  };
  base.addEventListener('change', fill);
  fill();
  const ok = await openDialog({
    title: 'New archetype',
    body: [
      h('p', { class: 'hint', style: { margin: 0 } }, 'Start from the archetype that plays most like yours. Ability ranges use the book\'s notation: "1..3", "pl+2..pl+5", "pl/2..pl-3". Rolls only use it when you pick it.'),
      h('div', { class: 'add-row' }, field('Start from', base), field('Name', name)),
      field('Blurb', blurb),
      h('div', { class: 'label' }, 'Ability ranges'), h('div', { class: 'hb-abil' }, ABILITIES.map((a) => field(a.slice(0, 3).toUpperCase(), abil[a]))),
      h('div', { class: 'label' }, 'Themes it rolls with (higher = more often; (homebrew) is yours)'), themeIn,
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Add archetype', value: true, primary: true }],
  });
  if (!ok) return;
  const themes = {};
  themeIn.querySelectorAll('input[data-theme]').forEach((i) => { if (Number(i.value) > 0) themes[i.dataset.theme] = Number(i.value); });
  try {
    p.archetypes.push(makeArchetype(R, p, { base: base.value, name: name.value, blurb: blurb.value, abilities: Object.fromEntries(ABILITIES.map((a) => [a, abil[a].value])), themes }));
    changed(`Archetype "${name.value.trim()}" added: pick it under Archetype on the Forge`);
  } catch (e) { toast(e.message); }
}

async function creatureDialog(p) {
  const chars = [...(state.current ? [state.current] : []), ...state.roster.filter((c) => c.rosterId !== state.current?.rosterId)];
  if (!chars.length) { toast('Build the creature on the Forge first (roll one, or Build from scratch), then add it here.'); return; }
  const who = h('select', { id: 'hb-cr-from', 'aria-label': 'From' }, chars.map((c, i) => h('option', { value: i }, `${c.identity?.codename || 'Unnamed'} · PL ${c.pl}${i === 0 && state.current ? ' (open on the Forge)' : ''}`)));
  const name = h('input', { type: 'text', id: 'hb-cr-name', placeholder: 'Name in the Bestiary (empty: the codename)' });
  const cat = h('input', { type: 'text', value: 'Homebrew', 'aria-label': 'Category' });
  const summary = h('input', { type: 'text', placeholder: 'One line for the card', 'aria-label': 'Summary' });
  const tactics = h('input', { type: 'text', placeholder: 'How it fights', 'aria-label': 'Tactics' });
  const habitat = h('input', { type: 'text', placeholder: 'Where it\'s found', 'aria-label': 'Habitat' });
  const weakness = h('input', { type: 'text', placeholder: 'What beats it', 'aria-label': 'Weakness' });
  const minion = h('input', { type: 'checkbox', 'aria-label': 'Minion' });
  const ok = await openDialog({
    title: 'New Bestiary creature',
    body: [
      h('p', { class: 'hint', style: { margin: 0 } }, 'A creature is a character sheet with notes for the GM: build it on the Forge, then add it here. It shows in the Bestiary with the book\'s creatures.'),
      field('From', who), h('div', { class: 'add-row' }, field('Name', name), field('Category', cat)),
      field('Summary', summary), h('div', { class: 'add-row' }, field('Tactics', tactics), field('Habitat', habitat)), field('Weakness', weakness),
      h('label', { class: 'hb-keep' }, minion, ' A minion (minion rules)'),
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Add creature', value: true, primary: true }],
  });
  if (!ok) return;
  const ch = chars[Number(who.value)];
  const c = creatureFromCharacter(p, ch, { name: name.value, category: cat.value, summary: summary.value, tactics: tactics.value, habitat: habitat.value, weakness: weakness.value, minion: minion.checked });
  p.creatures.push(c);
  changed(`${c.name} is in the Bestiary`);
}

// ---- the page ------------------------------------------------------------------------------------------------------

function itemRow(p, kind, x) {
  const remove = async () => {
    const ok = await openDialog({ title: `Remove ${x.name}?`, body: h('p', { style: { margin: 0 } }, 'Characters already made with it keep their powers; new rolls can\'t pick it.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
    if (!ok) return;
    p[kind] = p[kind].filter((y) => y.id !== x.id);
    changed(`${x.name} removed`);
  };
  const meta = kind === 'themes' ? `from ${R.raw.themes.find((t) => t.id === x.base)?.name || x.base || 'a theme'} · ${x.powers.length} powers` : kind === 'archetypes' ? `from ${R.raw.archetypes.find((a) => a.id === x.base)?.name || x.base || 'an archetype'}` : `PL ${x.pl} · ${x.category}`;
  return h('li', { class: 'hb-item' }, kind === 'themes' ? h('span', { class: 'swatch', style: { '--c': x.color || '#888', background: x.color || '#888' } }) : null,
    h('b', null, x.name), h('small', { class: 'hint' }, meta),
    h('span', { class: 'spacer' }),
    kind === 'creatures' ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => hooks.showCreature?.(x.name) }, 'Bestiary') : null,
    kind !== 'creatures' ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => hooks.roll?.(kind === 'themes' ? { theme: x.id } : { archetype: x.id }) }, 'Roll one') : null,
    h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${x.name}`, onClick: remove }, 'Remove'));
}

function packPanel(p) {
  const nameIn = h('input', { type: 'text', id: 'hb-pack-name', value: p.name, 'aria-label': 'Pack name', onChange: (e) => { p.name = e.target.value.trim() || 'Homebrew'; changed(); } });
  const author = h('input', { type: 'text', value: p.author || '', placeholder: 'Made by (optional)', 'aria-label': 'Author', onChange: (e) => { p.author = e.target.value.trim(); changed(); } });
  const section = (title, kind, add, empty) => h('section', { class: 'hb-sec' },
    h('div', { class: 'gm-head' }, h('h3', null, title, ' ', h('span', { class: 'count' }, p[kind].length)), h('span', { class: 'spacer' }), h('button', { class: 'btn sm', type: 'button', id: `hb-add-${kind}`, onClick: () => add(p) }, '+ Add')),
    p[kind].length ? h('ul', { class: 'hb-items' }, p[kind].map((x) => itemRow(p, kind, x))) : h('p', { class: 'hint', style: { margin: 0 } }, empty));
  return h('section', { class: 'panel hb-pack' },
    h('div', { class: 'add-row' }, field('Pack', nameIn), field('Author', author)),
    section('Power themes', 'themes', themeDialog, 'Your own theme of powers, from a built-in one: Hellfire from Fire, Nanites from Tech…'),
    section('Archetypes', 'archetypes', archetypeDialog, 'Your own kind of hero or villain, from a built-in archetype.'),
    section('Creatures', 'creatures', creatureDialog, 'A sheet you built on the Forge, with notes for the GM, in the Bestiary.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', id: 'hb-save-file', onClick: () => { const { enabled, ...clean } = p; download(`${slug(p.name)}.dcugen-pack.json`, JSON.stringify(clean, null, 2), 'application/json'); toast('Pack saved: send the file to your players; they load it in Workshop > Homebrew'); } }, 'Save pack file'),
      h('button', { class: 'btn', type: 'button', id: 'hb-copy-code', onClick: async () => { const c = await packCode(p); toast((await copyText(c)) ? `Pack code copied (${Math.round(c.length / 1024) || 1} KB): paste it in a chat` : 'Copy failed: save the file instead'); } }, 'Copy pack code'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { const ok = await openDialog({ title: `Delete ${p.name}?`, body: h('p', { style: { margin: 0 } }, 'Its themes, archetypes and creatures go from this device. Save the pack file first to keep a copy.'), buttons: [{ label: 'Keep', value: false }, { label: 'Delete', value: true, danger: true }] }); if (ok) { packs = packs.filter((x) => x.id !== p.id); openId = null; changed(`${p.name} deleted`); } } }, 'Delete pack')));
}

/** The Homebrew page in the Workshop. */
export function homebrewPage() {
  if (!openId && packs.length) openId = packs[0].id;
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'hb-file', onChange: async (e) => { const f = e.target.files?.[0]; if (f) await importPack(await f.text()); e.target.value = ''; } });
  const codeIn = h('input', { type: 'text', id: 'hb-code', placeholder: 'Paste a pack code (DCUB1…)', 'aria-label': 'Pack code' });
  const p = pack();
  return h('div', { class: 'hb' },
    h('section', { class: 'panel hb-packs' },
      h('h2', null, 'Homebrew packs'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Your own power themes, archetypes and Bestiary creatures, kept in packs. Switch a pack off to set it aside. Share a pack as a file or a code, and your players load it here.'),
      packs.length ? h('ul', { class: 'hb-pack-list' }, packs.map((x) => h('li', { class: `hb-pack-row ${x.id === openId ? 'active' : ''}` },
        h('input', { type: 'checkbox', checked: x.enabled !== false, 'aria-label': `Use ${x.name}`, onChange: (e) => { x.enabled = e.target.checked; changed(`${x.name} ${x.enabled ? 'on' : 'off'}`); } }),
        h('button', { type: 'button', class: 'linkish', onClick: () => { openId = x.id; hooks.rerender?.(); } }, x.name),
        h('small', { class: 'hint' }, `${count(x.themes.length, 'theme')} · ${count(x.archetypes.length, 'archetype')} · ${count(x.creatures.length, 'creature')}${x.author ? ` · by ${x.author}` : ''}`)))) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', id: 'hb-new', onClick: () => { const n = { ...emptyPack(packs.length ? `Homebrew ${packs.length + 1}` : 'My homebrew'), enabled: true }; packs.push(n); openId = n.id; changed(); } }, '+ New pack'),
        h('button', { class: 'btn', type: 'button', onClick: () => fileIn.click() }, 'Load a pack file'), fileIn),
      h('div', { class: 'add-row' }, codeIn, h('button', { class: 'btn', type: 'button', id: 'hb-code-go', onClick: async () => { if (await importPack(codeIn.value.trim())) codeIn.value = ''; } }, 'Load code')),
      PACKS.length ? [
        h('div', { class: 'label' }, 'Packs that come with DCUGen'),
        h('ul', { class: 'hb-pack-list' }, PACKS.map((bp) => {
          const have = packs.some((x) => x.id === bp.id);
          return h('li', { class: 'hb-pack-row' },
            h('b', null, bp.name), h('small', { class: 'hint' }, `${count(bp.themes.length, 'theme')} · ${count(bp.archetypes.length, 'archetype')} · ${count(bp.creatures.length, 'creature')}${bp.author ? ` · ${bp.author}` : ''}`),
            bp.notes ? h('small', { class: 'hint', style: { flexBasis: '100%' } }, bp.notes) : null,
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm', type: 'button', 'data-pack': bp.id, disabled: have, onClick: () => importPack(JSON.parse(JSON.stringify(bp))) }, have ? 'Added' : '+ Add'));
        }))] : null),
    p ? packPanel(p) : null);
}
