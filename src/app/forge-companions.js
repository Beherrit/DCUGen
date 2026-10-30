// Companions on the Forge: sidekicks, minions and pets, each with a full sheet on the owner's page.

import { h, toast, openDialog } from './dom.js';
import { sortChars } from './sorting.js';
import { state, emit, upsert } from './store.js';
import { renderFile } from './sheetview.js';
import { generateCharacter } from '../engine/generator.js';
import { randomSeed } from '../engine/rng.js';
import { COMPANION_KINDS, companionsOf, companionBudget, asCompanion, blankCompanion, suggestedPl } from '../engine/companions.js';
import { catalogToCharacter } from '../engine/catalog.js';
import { F } from './forge-common.js';
import { saveTabs, setCurrent } from './forge-tabs.js';

// ---- companions: sidekicks, minions, pets, each with a full sheet ------------------------------------------
export const openCompanion = new Set(); // ids of companions whose sheets are unfolded
const editingCompanion = new Set();

export function companionsSection(ch) {
  const list = companionsOf(ch);
  const setAt = (i, c) => { const o = JSON.parse(JSON.stringify(state.current)); o.companions[i] = c; F.commit(o); };
  const cards = list.map((comp, i) => {
    const kind = COMPANION_KINDS[comp.companionKind] || COMPANION_KINDS.companion;
    const b = companionBudget(ch, comp, F.R);
    const open = openCompanion.has(comp.id);
    const editing = editingCompanion.has(comp.id);
    const head = h('div', { class: 'comp-head' },
      h('span', { class: 'swatch', style: { '--c': comp.theme?.color || '#5b6b4a' } }),
      h('b', { class: 'comp-name' }, comp.identity?.codename || 'Companion'),
      h('span', { class: 'chip' }, kind.label),
      h('span', { class: 'chip num' }, `PL ${comp.pl}`),
      h('span', { class: `status ${b.ok ? 'ok' : 'warn'}`, title: b.message }, b.budget != null ? `${b.cost}/${b.budget} pp` : b.ok ? `${b.cost ?? '?'} pp` : 'Needs the advantage'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', type: 'button', 'aria-expanded': String(open), onClick: () => { if (open) openCompanion.delete(comp.id); else openCompanion.add(comp.id); F.renderCurrent(); } }, open ? 'Hide sheet' : 'Show sheet'),
      open ? h('button', { class: 'btn sm', type: 'button', 'aria-pressed': String(editing), onClick: () => { if (editing) editingCompanion.delete(comp.id); else editingCompanion.add(comp.id); F.renderCurrent(); } }, editing ? 'Done editing' : 'Edit') : null,
      h('button', { class: 'btn sm', type: 'button', title: 'Open as its own tab (Power Lab, Bio, exports), then save it back', onClick: () => setCurrent({ ...JSON.parse(JSON.stringify(comp)), companionOf: { ownerId: ch.id, ownerName: ch.identity?.codename || 'their hero', index: i } }, { newTab: true }) }, 'Open in a tab'),
      h('button', { class: 'btn sm', type: 'button', title: 'Add to the Battle Room', onClick: () => F.api.throwIn?.(comp) }, 'Battle Room'),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${comp.identity?.codename}`, onClick: async () => {
        const ok = await openDialog({ title: `Remove ${comp.identity?.codename}?`, body: h('p', { style: { margin: 0 } }, 'Their sheet goes with them. Save them to the roster first if you want to keep a copy.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
        if (ok) { const o = JSON.parse(JSON.stringify(state.current)); o.companions.splice(i, 1); if (!o.companions.length) delete o.companions; F.commit(o); }
      } }, 'Remove'));
    const body = open ? renderFile(comp, F.R, { editing, onChange: (c) => setAt(i, c), noPortrait: false }).el : null;
    return h('div', { class: 'comp-card' }, head, !b.ok || b.budget != null ? h('p', { class: `hint comp-budget ${b.ok ? '' : 'bad'}` }, b.message) : null, body ? h('div', { class: 'comp-sheet' }, body) : null);
  });
  return h('section', { class: 'companions no-print-empty', id: 'companions' },
    h('div', { class: 'comp-title' }, h('h3', null, 'Companions'), h('span', { class: 'hint' }, 'Sidekicks, minions, animals and other followers, each with a full sheet.'),
      h('span', { class: 'spacer' }), h('button', { class: 'btn sm', type: 'button', id: 'add-companion', onClick: () => addCompanionDialog(ch) }, '+ Companion')),
    cards);
}

export async function addCompanionDialog(owner) {
  const kindSel = h('select', { id: 'comp-kind' }, Object.entries(COMPANION_KINDS).map(([k, v]) => h('option', { value: k }, v.label)));
  const kindHint = h('p', { class: 'hint', style: { margin: '2px 0 0' } }, COMPANION_KINDS.sidekick.blurb);
  const rankIn = h('input', { type: 'number', min: 1, max: 40, value: 4, id: 'comp-rank' });
  const rankRow = h('label', { class: 'field' }, h('span', null, 'Advantage rank (adds it to the hero if they lack it)'), rankIn);
  const nameIn = h('input', { type: 'text', id: 'comp-name', placeholder: 'Name, e.g. Kid Flash, Ace the Bat-Hound' });
  const srcSel = h('select', { id: 'comp-source' },
    h('option', { value: 'roll' }, 'Roll a new character'),
    h('option', { value: 'blank' }, 'Blank sheet (build it yourself)'),
    h('option', { value: 'bestiary' }, 'An animal or creature from the Bestiary'),
    state.roster.length ? h('option', { value: 'roster' }, 'Someone from your roster (a copy)') : null);
  const plIn = h('input', { type: 'number', min: 0, max: 20, value: suggestedPl(owner, 'sidekick', 4), id: 'comp-pl' });
  const creatures = Object.values(F.R.raw.catalog || {}).flat().sort((a, b) => a.name.localeCompare(b.name));
  const find = h('input', { type: 'search', placeholder: 'Search: wolf, hawk, dragon, robot…', id: 'comp-find' });
  const creatureSel = h('select', { id: 'comp-creature', size: 6 }, creatures.map((e) => h('option', { value: e.id }, `${e.name} · PL ${e.pl}${e.category ? ` · ${e.category}` : ''}`)));
  find.addEventListener('input', () => { const q = find.value.toLowerCase(); for (const o of creatureSel.options) o.hidden = q && !o.textContent.toLowerCase().includes(q); });
  const rosterSel = h('select', { id: 'comp-roster' }, sortChars(state.roster.filter((c) => c.rosterId !== owner.rosterId), 'name').map((c) => h('option', { value: c.rosterId }, `${c.identity?.codename || 'Unnamed'} · PL ${c.pl}`)));
  const plRow = h('label', { class: 'field' }, h('span', null, 'Power level'), plIn);
  const creatureRow = h('div', { class: 'field', hidden: true }, h('span', null, 'Creature'), find, creatureSel);
  const rosterRow = h('label', { class: 'field', hidden: true }, h('span', null, 'From the roster'), rosterSel);
  const sync = () => {
    const k = kindSel.value;
    kindHint.textContent = COMPANION_KINDS[k].blurb;
    rankRow.hidden = !COMPANION_KINDS[k].advantage;
    plIn.value = suggestedPl(owner, k, Number(rankIn.value) || 1);
    plRow.hidden = !['roll', 'blank'].includes(srcSel.value);
    creatureRow.hidden = srcSel.value !== 'bestiary';
    rosterRow.hidden = srcSel.value !== 'roster';
  };
  kindSel.addEventListener('change', sync); srcSel.addEventListener('change', sync); rankIn.addEventListener('input', sync);
  const ok = await openDialog({
    title: `A companion for ${owner.identity?.codename || 'this character'}`,
    body: [h('label', { class: 'field' }, h('span', null, 'Kind'), kindSel), kindHint, rankRow,
      h('label', { class: 'field' }, h('span', null, 'Start from'), srcSel), plRow, creatureRow, rosterRow,
      h('label', { class: 'field' }, h('span', null, 'Name (optional)'), nameIn)],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Add companion', value: true, primary: true }],
  });
  if (!ok) return;
  const kind = kindSel.value;
  const pl = Math.max(0, Math.min(20, Number(plIn.value) || 1));
  let base;
  try {
    if (srcSel.value === 'roll') base = generateCharacter(F.R, { seed: randomSeed(), pl, alignment: owner.alignment || 'hero', chaos: state.prefs.chaos });
    else if (srcSel.value === 'bestiary') { const e = creatures.find((x) => x.id === creatureSel.value) || creatures[0]; base = catalogToCharacter(e); }
    else if (srcSel.value === 'roster') base = state.roster.find((c) => c.rosterId === rosterSel.value);
    else base = blankCompanion(pl, nameIn.value.trim());
  } catch (e) { toast(e.message); return; }
  if (!base) { toast('Pick someone first.'); return; }
  const comp = asCompanion(base, kind);
  if (nameIn.value.trim()) comp.identity = { ...comp.identity, codename: nameIn.value.trim() };
  const o = JSON.parse(JSON.stringify(state.current));
  o.companions = [...companionsOf(o), comp];
  const adv = COMPANION_KINDS[kind].advantage;
  if (adv) {
    const rank = Math.max(1, Number(rankIn.value) || 1);
    const name = comp.identity?.codename;
    const have = (o.advantages || []).find((a) => a.name === adv && String(a.param || '').toLowerCase() === String(name || '').toLowerCase());
    if (have) have.rank = Math.max(have.rank || 1, rank); else o.advantages = [...(o.advantages || []), { name: adv, rank, param: name }];
  }
  openCompanion.add(comp.id);
  F.commit(o);
  setTimeout(() => document.getElementById('companions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  toast(`${comp.identity?.codename || 'Companion'} joins ${owner.identity?.codename || 'the character'}${adv ? ` (${adv} ${Math.max(1, Number(rankIn.value) || 1)} added to the sheet)` : ''}`);
}

/** A companion opened in its own tab: send the changes back to its hero. */
export function companionBanner(ch) {
  if (!ch.companionOf) return null;
  const back = () => {
    const { ownerId, index } = ch.companionOf;
    const copy = JSON.parse(JSON.stringify(ch)); delete copy.companionOf;
    const ti = state.tabs.findIndex((t) => t.id === ownerId);
    if (ti >= 0) {
      const o = JSON.parse(JSON.stringify(state.tabs[ti]));
      o.companions = companionsOf(o); o.companions[index] = copy;
      state.tabs[ti] = o; state.active = ti; state.current = o; saveTabs(); F.renderCurrent(); emit('current');
      toast(`Saved into ${o.identity?.codename}. Save them to the roster to keep it.`);
      return;
    }
    const r = state.roster.find((x) => x.id === ownerId);
    if (r) { const o = JSON.parse(JSON.stringify(r)); o.companions = companionsOf(o); o.companions[index] = copy; upsert(o); toast(`Saved into ${o.identity?.codename} on your roster.`); return; }
    toast(`Open ${ch.companionOf.ownerName} first, then save back.`);
  };
  return h('div', { class: 'comp-banner no-print' },
    h('span', null, `${ch.identity?.codename || 'This companion'} belongs to ${ch.companionOf.ownerName}. Changes here stay in this tab until you save them back.`),
    h('button', { class: 'btn sm primary', type: 'button', onClick: back }, `Save back to ${ch.companionOf.ownerName}`));
}

/** Print every form and companion, each a full sheet on its own pages. */
