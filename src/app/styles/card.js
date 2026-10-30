// One fighting style on the sheet: tier, stances, weapons, extras and flaws, and maneuvers, with their costs.
// Read view and print show what the character knows; editing adds the controls.

import { h } from '../dom.js';
import { TIERS, TIER_LABEL, styleDef } from '../../engine/martial/lookup.js';
import { styleParts, maneuverPoints } from '../../engine/martial/price.js';
import { setTier, setStances, toggleWeaponElement, removeStyle } from '../../engine/martial/styles.js';
import { buyWholeStyle } from '../../engine/martial/template.js';
import { tierSummary, tierCost, knownStances, stanceLine } from '../../engine/martial/describe.js';
import { maneuverList, maneuverAdder } from './maneuvers.js';

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

function costLine(ch, R, style) {
  const p = styleParts(style, R);
  const man = maneuverPoints(ch, R, style.name);
  const bits = [`tier ${p.tiers}`, p.stances ? 'stances 1' : null, p.elements ? `weapons ${p.elements}` : null, p.externals ? `other advantages ${p.externals}` : null,
    p.extras ? `style extras ${sign(p.extras)}` : null, p.flaws ? `style flaws ${sign(p.flaws)}` : null, man ? `maneuvers ${man}` : null].filter(Boolean);
  return { total: p.total + man, text: bits.join(' · ') };
}

function tierControls(ch, style, { change }) {
  const sel = h('select', { id: `fs-tier-${style.name}`, 'aria-label': `${style.name} tier`, onChange: (e) => change((c) => { setTier(c, style.name, e.target.value); }) },
    TIERS.map((t) => h('option', { value: t, selected: t === style.tier }, `${TIER_LABEL[t]} (${tierCost(t)} pp)`)));
  const stances = h('label', { class: 'fs-check' },
    h('input', { type: 'checkbox', checked: !!style.stances, 'aria-label': `${style.name} stances`, onChange: (e) => change((c) => { setStances(c, style.name, e.target.checked); }) }),
    ` ${style.name} Stances advantage (1 pp)`);
  return h('div', { class: 'fs-row no-print' }, h('label', null, 'Tier ', sel), stances);
}

function weaponControls(style, def, { change }) {
  const names = [...new Set([...(def.weapon_elements || []), ...style.weaponElements])];
  const custom = h('input', { type: 'text', placeholder: 'Another weapon', 'aria-label': `Another weapon for ${style.name}`, id: `fs-weapon-${style.name}` });
  return h('div', { class: 'fs-weapons no-print' },
    h('div', { class: 'label' }, 'Weapon elements (1 pp each; the style\'s own kind is free)'),
    h('div', { class: 'fs-checks' }, names.map((w) => h('label', { class: 'fs-check' },
      h('input', { type: 'checkbox', checked: style.weaponElements.includes(w), onChange: (e) => change((c) => { toggleWeaponElement(c, style.name, w, e.target.checked); }) }), ` ${w}`))),
    h('div', { class: 'add-row' }, custom, h('button', { class: 'btn', type: 'button', onClick: () => { if (custom.value.trim()) change((c) => { toggleWeaponElement(c, style.name, custom.value.trim(), true); }); } }, 'Add weapon')));
}

function stanceList(R, style, def) {
  const list = knownStances(R, style, def);
  if (!list.length) return h('p', { class: 'fs-none' }, style.stances ? 'No stances listed.' : 'No stances yet: only Neutral until you buy the Stances advantage.');
  return h('ul', { class: 'fs-stances' }, list.map((st) => h('li', null, stanceLine(st))));
}

function extrasFlaws(def, style) {
  const e = TIERS.indexOf(style.tier) >= 1 ? (def.style_extras || []) : [];
  const f = def.style_flaws || [];
  if (!e.length && !f.length && !style.externals.length) return null;
  const one = (x) => `${x.name}${x.rank ? ` ${x.rank}` : ''}${x.detail ? ` (${x.detail})` : ''}${x.cost ? ` ${sign(x.cost)}` : ''}`;
  return h('p', { class: 'fs-ef' },
    e.length ? [h('b', null, 'Style extras: '), e.map(one).join(', '), '. '] : null,
    f.length ? [h('b', null, 'Style flaws: '), f.map(one).join(', '), '. '] : null,
    style.externals.length ? [h('b', null, 'Other advantages (Better Mousetrap 3e): '), style.externals.map((x) => `${x.name}${x.rank ? ` ${x.rank}` : ''}${x.detail ? ` (${x.detail})` : ''}`).join(', '), '.'] : null);
}

/** ctx: { editing, change(fn), stepper } */
export function styleCard(ch, R, style, ctx) {
  const def = styleDef(R, style.name);
  const cost = costLine(ch, R, style);
  const { editing, change } = ctx;
  if (!def) return h('div', { class: 'fs-card' }, h('b', null, style.name), ' is not in the rules data.');
  return h('div', { class: 'fs-card', 'data-style': style.name },
    h('div', { class: 'fs-head' },
      h('b', { class: 'fs-name' }, style.name),
      h('span', { class: 'chip' }, TIER_LABEL[style.tier] || style.tier),
      h('span', { class: 'chip' }, def.category),
      h('span', { class: 'fs-pts num', title: cost.text }, `${cost.total} pp`),
      editing ? h('button', { class: 'btn sm no-print', type: 'button', 'aria-label': `Remove ${style.name}`, onClick: () => change((c) => { removeStyle(c, style.name); }) }, 'Remove') : null),
    h('p', { class: 'fs-sum' }, `${def.summary} (${def.type}; Mutants & Masterminds: Martial Arts 3e, ${def.source}.)`),
    h('p', { class: 'fs-costs' }, h('b', null, 'Cost: '), `${cost.text}.`),
    editing ? tierControls(ch, style, ctx) : null,
    editing ? h('ul', { class: 'fs-tier-text no-print' }, tierSummary(style.tier).map((t) => h('li', null, t))) : null,
    h('div', { class: 'label' }, 'Stances'),
    stanceList(R, style, def),
    style.weaponElements.length && !editing ? h('p', { class: 'fs-ef' }, h('b', null, 'Weapons: '), style.weaponElements.join(', '), '.') : null,
    editing ? weaponControls(style, def, ctx) : null,
    extrasFlaws(def, style),
    h('div', { class: 'label' }, 'Maneuvers'),
    maneuverList(ch, R, style, ctx),
    editing ? maneuverAdder(ch, R, style, def, change) : null,
    editing ? h('div', { class: 'btn-row no-print' },
      h('button', { class: 'btn sm', type: 'button', title: 'Add every skill, advantage, weapon and maneuver the book lists for this style, at the listed ranks (Master).', onClick: () => change((c) => { buyWholeStyle(c, R, style.name); }) }, 'Buy the whole style as listed')) : null);
}
