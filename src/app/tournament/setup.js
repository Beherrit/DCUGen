// The setup page: format, games per match, seeding, match settings, the entrant list, Quick fill, the seed and Start.
// cx is { state, R, ui, save, render }; the setup being built lives in state.draft.

import { h, toast } from '../dom.js';
import { randomSeed } from '../../engine/rng.js';
import { createTournament, quickEntrants, FORMATS, FORMAT_LABELS } from '../../engine/tournament.js';
import { drawRoster } from './roster.js';
import { pickerPanel } from './picker.js';

const BEST_OF = [1, 3, 5, 7];

function formatButtons(draft, redo) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Format' },
    FORMATS.map((f) => h('button', { type: 'button', id: `tn-format-${f}`, 'aria-pressed': String(draft.format === f), onClick: () => { draft.format = f; redo(); } }, FORMAT_LABELS[f])));
}

const labelled = (text, control) => h('label', { class: 'tn-field' }, h('span', null, text), control);
const option = (value, text, current) => h('option', { value, selected: String(value) === String(current) }, text);

function optionFields(draft, redo) {
  const s = draft.settings;
  const check = (key, text, id) => h('label', { class: 'bt-copies' }, h('input', { type: 'checkbox', id, checked: !!s[key], onChange: (e) => { s[key] = e.target.checked; redo(); } }), ` ${text}`);
  const rr = draft.format === 'round-robin';
  return [
    labelled('Games per match', h('select', { id: 'tn-bestof', disabled: rr, 'aria-label': 'Games per match', onChange: (e) => { draft.bestOf = Number(e.target.value); redo(); } },
      BEST_OF.map((n) => option(n, n === 1 ? 'One game' : `Best of ${n}`, rr ? 1 : draft.bestOf)))),
    rr ? h('p', { class: 'hint', style: { margin: 0 } }, 'A round robin plays one game per match, and a stalemate is a draw.') : null,
    labelled('Seeding', h('select', { id: 'tn-seeding', 'aria-label': 'Seeding', onChange: (e) => { draft.seeding = e.target.value; redo(); } },
      option('given', 'As listed (top is seed 1)', draft.seeding), option('random', 'Random (from the seed)', draft.seeding))),
    h('div', { class: 'label' }, 'Every match'),
    h('div', { class: 'tn-checks' }, check('enclosed', 'Enclosed space (a walled room)', 'tn-enclosed'), check('knockback', 'Knockback', 'tn-knockback'), check('shootThrough', 'Shoot through cover', 'tn-shootthrough'), check('lethal', 'Lethal damage (dying and death)', 'tn-lethal')),
    labelled('Scenery', h('select', { id: 'tn-scenery', disabled: !!s.enclosed, 'aria-label': 'Scenery', onChange: (e) => { s.scenery = e.target.value; redo(); } },
      option('none', 'None', s.scenery), option('street', 'Street (cars, walls, storefronts)', s.scenery), option('park', 'Park (fences and trees)', s.scenery))),
    labelled('Ambush', h('select', { id: 'tn-ambush', 'aria-label': 'Ambush', onChange: (e) => { s.ambush = e.target.value; redo(); } },
      option('none', 'None', s.ambush), option('alternate', 'The lower seed ambushes every match', s.ambush))),
  ];
}

/** Draw the whole setup into a section. */
export function setupPanel(cx) {
  const { state, R, ui, save, render } = cx;
  const { draft } = state;
  const rosterHost = h('div', { class: 'tn-roster' });
  const start = h('button', { type: 'button', class: 'btn primary', id: 'tn-start', onClick: () => begin() }, 'Start tournament');
  const sync = () => { start.disabled = draft.entrants.length < 2; };
  const rc = { draft, ui, R, changed: (redraw = true) => { save(); if (redraw) drawRoster(rosterHost, rc); sync(); } };
  const redo = () => { save(); render(); };
  const begin = () => {
    try {
      state.t = createTournament({ seed: draft.seed, format: draft.format, bestOf: draft.bestOf, seeding: draft.seeding, settings: draft.settings, entrants: draft.entrants.map((e) => ({ name: e.name, tactic: e.tactic, members: e.members.map((m) => m.ch) })) });
      ui.sel = null; ui.odds = null;
      save(); render();
    } catch (err) { toast(err.message); }
  };
  const fill = () => {
    draft.entrants = quickEntrants(R, { seed: draft.seed, count: 8 }).map((e) => ({ uid: draft.nextUid++, name: e.name, tactic: 'none', members: [{ ch: e.members[0], label: e.name }] }));
    ui.checked.clear();
    rc.changed(); toast('8 random heroes entered');
  };
  drawRoster(rosterHost, rc); sync();
  const seedIn = h('input', { type: 'text', id: 'tn-seed', value: draft.seed, 'aria-label': 'Seed', onChange: (e) => { draft.seed = e.target.value.trim() || randomSeed(); save(); } });
  return h('section', { class: 'panel bt-panel tn-setup', id: 'tn-setup-panel' }, h('h2', null, 'Set up a tournament'),
    formatButtons(draft, redo),
    h('div', { class: 'tn-options' }, optionFields(draft, redo)),
    h('div', { class: 'label' }, 'Entrants'),
    h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', id: 'tn-quickfill', onClick: fill }, 'Quick fill: 8 random heroes'),
      h('button', { type: 'button', class: 'btn ghost', id: 'tn-clear', onClick: () => { draft.entrants = []; ui.checked.clear(); rc.changed(); } }, 'Clear')),
    rosterHost, pickerPanel(rc),
    h('div', { class: 'label' }, 'Seed'),
    h('div', { class: 'add-row' }, seedIn, h('button', { type: 'button', class: 'btn', id: 'tn-draftseed', onClick: () => { draft.seed = randomSeed(); redo(); } }, 'New seed')),
    h('p', { class: 'hint', style: { margin: 0 } }, 'The seed picks the dice (and the shuffle when seeding is random). The same seed and entrants play the same tournament.'),
    start);
}
