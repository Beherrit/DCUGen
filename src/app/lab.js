// Power Lab: build custom powers with live point math, or roll random ones that follow the rules.

import { h, clear, toast, copyText } from './dom.js';
import { state } from './store.js';
import { getPower, setPower, whatItDoes } from './sheetview.js';
import { costMath, availableModifiers, randomPower } from '../engine/powersmith.js';
import { powerCost, alternateOwnCost, primaryOwnCost } from '../engine/costs.js';
import { describeEffect } from '../engine/render.js';
import { RANGE_STEPS, ABILITIES, BUYABLE_DEFENSES } from '../engine/rules.js';
let R;
let root;
let hooks = {};
let selected = -1; // -1 = primary, otherwise index of the alternate effect
let target = null; // {path} when editing a character's power, or null
let lockEffect = false;

const clone = (x) => JSON.parse(JSON.stringify(x));
const blank = () => ({ name: 'New Power', effect: 'Damage', rank: 8, range: 'Ranged', extras: [], flaws: [], descriptors: [], alternates: [] });

export function initLab(rules, el, h2) {
  R = rules;
  root = el;
  hooks = h2;
  if (!state.lab) state.lab = randomPower(R, { seed: 'welcome', pl: 10, effect: 'Damage' });
  render();
}

/** Open the lab on a character's power (path) or empty for adding a new one. */
export function openInLab(ch, path) {
  if (path) {
    const p = clone(getPower(ch, path));
    p.alternates = p.alternates || [];
    state.lab = p;
    target = { path };
  } else {
    state.lab = state.lab || blank();
    target = null;
  }
  selected = -1;
  render();
}

function current() {
  return selected < 0 ? state.lab : state.lab.alternates[selected];
}

function update(fn) {
  fn(current());
  render();
}

function effectOptions() {
  const groups = {};
  for (const e of R.raw.effects) {
    if (e.cost == null && !e.cost_options && !e.fixed_cost) continue;
    (groups[e.type] = groups[e.type] || []).push(e);
  }
  return Object.entries(groups).sort().map(([type, list]) => h('optgroup', { label: type },
    list.sort((a, b) => a.name.localeCompare(b.name)).map((e) => h('option', { value: e.name }, `${e.name} (${e.fixed_cost ? 'fixed' : e.cost_options ? 'varies' : `${e.cost}/rank`})`))));
}

function modEditor(kind) {
  const p = current();
  const list = kind === 'extra' ? p.extras : p.flaws;
  const avail = availableModifiers(p, R, kind);
  const added = list.map((m, i) => {
    let def;
    try { def = R.modifier(kind, m.name, p.effect); } catch { def = {}; }
    return h('div', { class: 'mod' },
      h('div', { class: 'mname' }, m.name, h('small', null, def.summary || '')),
      h('div', { class: 'btn-row' },
        def.options ? h('select', { 'aria-label': `${m.name} option`, onChange: (e) => update((q) => { (kind === 'extra' ? q.extras : q.flaws)[i].option = e.target.value; }) },
          Object.entries(def.options).map(([k, v]) => h('option', { value: k, selected: k === m.option }, `${k} (${kind === 'flaw' ? '−' : '+'}${v})`))) : null,
        (def.max_steps ?? 1) > 1 || def.max_steps === null || def.cost_type === 'flat_per_rank'
          ? h('input', { type: 'number', min: 1, max: def.max_steps ?? 20, value: m.steps ?? 1, 'aria-label': `${m.name} ranks`, style: { width: '64px' },
            onChange: (e) => update((q) => { (kind === 'extra' ? q.extras : q.flaws)[i].steps = Math.max(1, Number(e.target.value) || 1); }) }) : null,
        ['Limited', 'Quirk', 'Side Effect', 'Sense-Dependent', 'Check Required', 'Activation'].includes(m.name) || m.detail
          ? h('input', { type: 'text', value: m.detail || '', placeholder: 'detail', 'aria-label': `${m.name} detail`,
            onChange: (e) => update((q) => { (kind === 'extra' ? q.extras : q.flaws)[i].detail = e.target.value; }) }) : null),
      h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${m.name}`, onClick: () => update((q) => { (kind === 'extra' ? q.extras : q.flaws).splice(i, 1); }) }, '✕'));
  });
  return h('div', { class: 'field' },
    h('span', null, kind === 'extra' ? 'Extras (raise cost)' : 'Flaws (lower cost)'),
    h('div', { class: 'modlist' }, added.length ? added : h('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, 'None yet.')),
    h('div', { class: 'pickers', 'aria-label': `Add ${kind}` }, avail.map((m) => h('button', { type: 'button', title: m.summary || '', onClick: () => update((q) => {
      const mod = { name: m.name };
      if (m.options) mod.option = Object.keys(m.options)[0];
      (kind === 'extra' ? q.extras : q.flaws).push(mod);
    }) }, m.name, h('span', { class: 'v' }, `${kind === 'flaw' ? '−' : '+'}${m.options ? [...new Set(Object.values(m.options))].join('/') : m.value}${m.cost_type === 'per_rank' ? '/r' : ''}`)))));
}

function traitOptions() {
  const skills = R.raw.skills.map((s) => s.name);
  const advs = (R.raw.advantages || []).filter((a) => !a.book).map((a) => a.name);
  return [
    h('optgroup', { label: 'Abilities (2/rank)' }, ABILITIES.map((a) => h('option', { value: a }, a))),
    h('optgroup', { label: 'Defenses (1/rank)' }, BUYABLE_DEFENSES.map((a) => h('option', { value: a }, a))),
    h('optgroup', { label: 'Skills (1 per 2 ranks)' }, skills.map((a) => h('option', { value: a }, a))),
    h('optgroup', { label: 'Advantages (1/rank)' }, advs.map((a) => h('option', { value: a }, a))),
  ];
}

function render() {
  if (!root) return;
  clear(root);
  const arr = state.lab;
  const p = current();
  const eff = R.effect(p.effect);
  const ch = state.current;
  const pl = ch?.pl || state.prefs.pl || 10;

  // AE tabs
  const tabs = h('div', { class: 'ae-tabs', role: 'group', 'aria-label': 'Effects in this power' },
    h('button', { type: 'button', 'aria-pressed': String(selected < 0), onClick: () => { selected = -1; render(); } }, `Primary: ${arr.name}`),
    arr.alternates.map((a, i) => h('button', { type: 'button', 'aria-pressed': String(selected === i), onClick: () => { selected = i; render(); } }, `AE: ${a.name}`)),
    h('button', { type: 'button', onClick: () => {
      const primary = primaryOwnCost(arr, R);
      let alt = null;
      for (let i = 0; i < 30 && !alt; i++) {
        const cand = randomPower(R, { seed: Math.random(), pl, descriptor: arr.descriptors?.[0] });
        delete cand.alternates;
        while (cand.rank > 1 && alternateOwnCost(cand, R) > primary) cand.rank--;
        if (alternateOwnCost(cand, R) <= primary) alt = cand;
      }
      if (!alt) { toast('No Alternate Effect fits under the primary cost. Raise the primary first.'); return; }
      arr.alternates.push(alt); selected = arr.alternates.length - 1; render();
    } }, '+ Random AE'),
    h('button', { type: 'button', onClick: () => {
      const copy = clone(p); delete copy.alternates; copy.name = `${p.name} (variant)`;
      arr.alternates.push(copy); selected = arr.alternates.length - 1; render();
    } }, '+ Copy as AE'),
    selected >= 0 ? h('button', { type: 'button', onClick: () => { arr.alternates.splice(selected, 1); selected = -1; render(); } }, 'Remove this AE') : null);

  const rangeable = eff.range in RANGE_STEPS;
  const builder = h('div', { class: 'panel' },
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' } },
      h('h2', null, target ? `Editing ${ch?.identity?.codename || 'character'}'s power` : 'Build a power'),
      h('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, eff.summary || '')),
    tabs,
    h('div', { class: 'grid2' },
      h('label', { class: 'field' }, h('span', null, 'Name'), h('input', { type: 'text', id: 'lab-name', value: p.name, onChange: (e) => update((q) => { q.name = e.target.value; }) })),
      h('label', { class: 'field' }, h('span', null, 'Effect'), h('select', { id: 'lab-effect', onChange: (e) => update((q) => {
        q.effect = e.target.value; delete q.option; delete q.range; q.extras = []; q.flaws = [];
        const ne = R.effect(q.effect);
        if (ne.cost_options) q.option = Object.keys(ne.cost_options)[0];
        if (q.effect === 'Enhanced Trait') q.option = 'Strength';
        if (ne.max_rank) q.rank = Math.min(q.rank, ne.max_rank);
      }) }, effectOptions())),
    ),
    h('div', { class: 'grid3' },
      h('label', { class: 'field' }, h('span', null, eff.fixed_cost ? 'Ranks (fixed cost)' : `Rank${eff.max_rank ? ` (max ${eff.max_rank})` : ''}`),
        h('input', { type: 'number', id: 'lab-rank', min: 1, max: eff.max_rank || 40, value: p.rank, onChange: (e) => update((q) => { q.rank = Math.max(1, Number(e.target.value) || 1); }) })),
      h('label', { class: 'field' }, h('span', null, `Range (default ${eff.range})`),
        h('select', { id: 'lab-range', disabled: !rangeable, onChange: (e) => update((q) => { if (e.target.value === eff.range) delete q.range; else q.range = e.target.value; }) },
          (rangeable ? ['Close', 'Ranged', 'Perception'] : [eff.range]).map((r) => h('option', { value: r, selected: (p.range || eff.range) === r }, r)))),
      eff.cost_options || p.effect === 'Enhanced Trait'
        ? h('label', { class: 'field' }, h('span', null, p.effect === 'Enhanced Trait' ? 'Trait' : 'Version'),
          h('select', { id: 'lab-option', onChange: (e) => update((q) => { q.option = e.target.value; }) },
            p.effect === 'Enhanced Trait' ? traitOptions() : Object.entries(eff.cost_options).map(([k, v]) => h('option', { value: k }, `${k} (${v}/rank)`))))
        : h('label', { class: 'field' }, h('span', null, 'Descriptor'), h('input', { type: 'text', id: 'lab-desc', value: (p.descriptors || []).join(', '), placeholder: 'fire, magic, tech...',
          onChange: (e) => update((q) => { q.descriptors = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); }) }))),
    h('label', { class: 'field' }, h('span', null, 'Details (resistance, conditions, what it covers)'),
      h('input', { type: 'text', id: 'lab-detail', value: p.detail || '', placeholder: 'e.g. Resisted by Will; Dazed, Stunned, Incapacitated', onChange: (e) => update((q) => { q.detail = e.target.value || undefined; }) })),
    p.effect === 'Damage' ? h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' } },
      h('input', { type: 'checkbox', checked: !!p.strengthBased, onChange: (e) => update((q) => { q.strengthBased = e.target.checked || undefined; }) }), 'Strength-based (adds Strength to the damage rank)') : null,
    modEditor('extra'),
    modEditor('flaw'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: () => {
        const np = randomPower(R, { seed: Math.random(), pl, effect: lockEffect ? p.effect : undefined });
        if (selected < 0) { np.alternates = arr.alternates; state.lab = np; } else { delete np.alternates; arr.alternates[selected] = np; }
        render();
      } }, 'Random power'),
      h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px' } },
        h('input', { type: 'checkbox', checked: lockEffect, onChange: (e) => { lockEffect = e.target.checked; } }), 'keep this effect'),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => { state.lab = blank(); selected = -1; target = null; render(); } }, 'Start over')));

  // Cost side
  let math = null;
  let err = null;
  try { math = costMath(p, R); } catch (e) { err = e.message; }
  const total = (() => { try { return powerCost(arr, R); } catch { return 0; } })();
  const primaryCost = (() => { try { return primaryOwnCost(arr, R); } catch { return 0; } })();
  const aeWarnings = arr.alternates.map((a) => {
    try { const c = alternateOwnCost(a, R); return c > primaryCost ? `${a.name} costs ${c}, more than the primary's ${primaryCost}. Lower its rank.` : null; } catch (e) { return e.message; }
  }).filter(Boolean);
  const fmt = (v) => (v > 0 ? `+${v}` : `${v}`);
  const costPanel = h('div', { class: 'panel' },
    h('div', { class: 'big-cost' }, h('b', { class: 'num' }, total), h('span', null, `power points${arr.alternates.length ? ` for the whole array (${primaryCost} + ${arr.alternates.length} AE)` : ''}`)),
    err ? h('ul', { class: 'issues' }, h('li', { class: 'error' }, err)) : null,
    math ? h('div', { class: 'math' },
      h('div', { class: 'label', style: { marginBottom: '4px' } }, `Math for ${p.name} · ratio ${math.ratio}`),
      h('table', null, h('tbody', null, math.lines.map((l) => h('tr', { class: l.final ? 'final' : l.subtotal ? 'sub' : '' },
        h('td', null, l.label),
        h('td', { class: 'v' }, l.perRank !== undefined ? `${fmt(l.perRank)}/rank` : l.flat !== undefined ? `${fmt(l.flat)} flat` : ''),
        h('td', { class: 'v' }, l.total !== undefined ? `${l.total} pp` : '')))))) : null,
    h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--ink-3)' } },
      'Cost per rank = base + range change + per-rank extras − per-rank flaws. Below 1, each point buys more ranks (0 = 1 point per 2 ranks, −1 = per 3). Flat modifiers are added last. Each Alternate Effect adds 1 point and may not cost more than the primary.'),
    aeWarnings.length ? h('ul', { class: 'issues' }, aeWarnings.map((w) => h('li', { class: 'error' }, w))) : null,
    h('div', { class: 'field' }, h('span', null, `What ${p.name || 'it'} does`), whatItDoes(p, R)),
    h('div', { class: 'field' }, h('span', null, 'Stat block line'),
      h('div', { class: 'statblock-text', id: 'lab-text' }, statLine(arr))),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(statLine(arr))) ? 'Power copied' : 'Select the text to copy it') }, 'Copy'),
      ch && target ? h('button', { class: 'btn primary', type: 'button', onClick: () => {
        const c = clone(ch); setPower(c, target.path, clone(arr)); hooks.applyToCurrent?.(c); toast('Power saved to the character');
      } }, `Save to ${ch.identity?.codename || 'character'}`) : null,
      ch ? h('button', { class: target ? 'btn' : 'btn primary', type: 'button', onClick: () => {
        const c = clone(ch); const np = clone(arr); np.role = np.role || 'utility'; c.powers = [...(c.powers || []), np];
        hooks.applyToCurrent?.(c); target = { path: { device: null, index: c.powers.length - 1 } }; toast(`Added to ${c.identity?.codename || 'character'}`);
      } }, `Add as new power to ${ch.identity?.codename || 'character'}`) : h('span', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, 'Roll or open a character to add this power to them.')));

  root.append(h('div', { class: 'page-head' },
    h('div', null, h('h1', null, 'Power Lab'),
      h('p', null, 'Build any power from the DC Adventures effects and modifiers and watch the point math as you go. Only modifiers that fit the effect are offered, so random powers stay legal too.'))));
  root.append(h('div', { class: 'lab' }, builder, costPanel));
  const sel = root.querySelector('#lab-effect');
  if (sel) sel.value = p.effect;
  const opt = root.querySelector('#lab-option');
  if (opt && p.option) opt.value = p.option;
}

function statLine(arr) {
  try {
    const lines = [`${arr.name}: ${describeEffect(arr, R)} • ${powerCost({ ...arr, alternates: [] }, R)} points`];
    for (const a of arr.alternates) lines.push(`${arr.dynamic ? 'DAE' : 'AE'}: ${a.name}: ${describeEffect(a, R)} • ${arr.dynamic ? 2 : 1} point${arr.dynamic ? 's' : ''}`);
    return lines.join('\n');
  } catch (e) {
    return e.message;
  }
}

export function renderLab() {
  render();
}

export function labTargetCleared() {
  target = null;
}
