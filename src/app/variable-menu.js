// A Variable's menu of configurations (DCA 121): the editor in the Power Lab, and the switcher on the sheet,
// in Play view and on the GM's copy. The rules are in engine/variable-config.js.

import { h, toast } from './dom.js';
import { addConfig, removeConfig, duplicateConfig, configCost, configCapacity, configSummary, switchAction, activeConfigOf } from '../engine/variable-config.js';
import { powerCost } from '../engine/costs.js';

const meter = (cost, cap) => h('span', { class: `var-cost num${cost > cap ? ' over' : ''}`, title: cost > cap ? 'More than the Variable can hold' : 'Power points used of the Variable\'s rank x 5' }, `${cost}/${cap} pp`);

/**
 * The menu editor for the Power Lab, on a Variable power p (edited in place).
 * opts: { changed(), editPower(cfg, index|null), saveToCharacter() | null }
 */
export function variableMenuEditor(p, R, opts) {
  const cap = configCapacity(p);
  const cfgs = p.configs || [];
  const change = (fn) => { fn(); opts.changed?.(); };
  return h('div', { class: 'field var-menu-edit', id: 'lab-variable-menu' },
    h('span', null, `Configurations: a menu of what ${p.name || 'the Variable'} turns into`),
    h('p', { class: 'hint', style: { margin: '0 0 6px' } }, `${p.name || 'This Variable'} ${p.rank} has ${cap} power points to allocate (5 per rank). Write the options you use most down ahead of time, as the book suggests (DCA 121): each is checked against the power level limits as if it were on, and switching takes a ${switchAction(p)} action in play.`),
    cfgs.length ? h('div', { class: 'var-cfgs' }, cfgs.map((cfg) => {
      const cost = configCost(cfg, R);
      return h('div', { class: 'var-cfg' },
        h('div', { class: 'var-cfg-head' },
          h('input', { type: 'text', value: cfg.name, 'aria-label': 'Configuration name', class: 'var-cfg-name', onChange: (e) => change(() => { cfg.name = e.target.value.trim() || cfg.name; }) }),
          meter(cost, cap),
          h('button', { class: 'btn sm', type: 'button', title: 'A copy to make a variant', onClick: () => change(() => duplicateConfig(p, cfg.id)) }, 'Copy'),
          h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${cfg.name}`, onClick: () => change(() => removeConfig(p, cfg.id)) }, 'Remove')),
        cfg.powers.length ? h('ul', { class: 'var-cfg-powers' }, cfg.powers.map((pw, i) => {
          let c = 0;
          try { c = powerCost(pw, R); } catch { /* unknown */ }
          return h('li', null,
            h('span', null, `${pw.name}${pw.name !== pw.effect ? ` (${pw.effect} ${pw.rank})` : ` ${pw.rank}`}`),
            h('span', { class: 'num' }, `${c} pp`),
            h('button', { class: 'btn sm', type: 'button', onClick: () => opts.editPower?.(cfg, i) }, 'Edit'),
            h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${pw.name} from ${cfg.name}`, onClick: () => change(() => { cfg.powers.splice(i, 1); }) }, 'Remove'));
        })) : h('p', { class: 'hint', style: { margin: '2px 0' } }, 'No powers yet.'),
        h('button', { class: 'btn sm', type: 'button', onClick: () => opts.editPower?.(cfg, null) }, '+ Add a power'),
        cost > cap ? h('p', { class: 'hint bad' }, `Over by ${cost - cap}: lower a rank or raise ${p.name}.`) : null);
    })) : h('p', { class: 'hint', style: { margin: '2px 0' } }, 'No configurations yet. Without a menu, the Variable is a pool you place point by point, and in the Battle Room it improvises.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', id: 'lab-add-config', onClick: () => change(() => addConfig(p)) }, '+ New configuration'),
      opts.saveToCharacter && cfgs.length ? h('button', { class: 'btn', type: 'button', onClick: () => { opts.saveToCharacter(); toast('Menu saved to the character'); } }, 'Save the menu to the character') : null));
}

function findAt(ch, path) {
  const list = path.device == null ? ch.powers : ch.devices?.[path.device]?.powers;
  return list?.[path.index] || null;
}

/**
 * The switcher on a sheet or in Play: one button per configuration, and Off.
 * change(fn) applies fn to a copy of the character. opts: { compact, onSwitched(cfg) }
 */
export function configSwitcher(ch, p, path, change, R, opts = {}) {
  const cfgs = p.configs || [];
  if (!cfgs.length) return null;
  const cap = configCapacity(p);
  const active = activeConfigOf(p);
  const set = (id) => change((c) => {
    const q = findAt(c, path);
    if (!q) return;
    if (id) q.activeConfig = id; else delete q.activeConfig;
  });
  const pick = (cfg) => {
    set(cfg?.id || null);
    toast(cfg ? `${p.name}: now ${cfg.name} (a ${switchAction(p)} action)` : `${p.name}: off`);
    opts.onSwitched?.(cfg);
  };
  return h('div', { class: 'var-menu', role: 'group', 'aria-label': `${p.name} configurations` },
    h('div', { class: 'var-menu-head' }, h('b', null, 'Configurations'), h('span', { class: 'hint' }, ` ${cap} pp · switching is a ${switchAction(p)} action`)),
    h('div', { class: 'var-menu-list' },
      cfgs.map((cfg) => {
        const cost = configCost(cfg, R);
        return h('button', { type: 'button', class: 'var-pick', 'aria-pressed': String(active?.id === cfg.id), title: configSummary(cfg), onClick: () => pick(active?.id === cfg.id ? null : cfg) },
          h('b', null, cfg.name), h('small', null, `${configSummary(cfg)} · ${cost}/${cap} pp`));
      }),
      h('button', { type: 'button', class: 'var-pick off', 'aria-pressed': String(!active), onClick: () => pick(null) }, h('b', null, 'Off'), h('small', null, 'nothing allocated'))),
    active && !opts.compact ? h('p', { class: 'hint', style: { margin: '4px 0 0' } }, `${active.name} is on: its powers are in the attacks, defenses and skills above.`) : null);
}
