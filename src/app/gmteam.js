// GM Tools, "In play": who is at the table tonight. Click the heroes that are playing and the villains
// you've made, keep their conditions, bonus points and a note on each, and open any of them as a full sheet.

import { h, toast } from './dom.js';
import { state, upsert } from './store.js';
import { awardPoints } from '../engine/advancement.js';

const KEY = 'dcugen.gmteam';
let R;
let hooks = {};

function load() {
  let v;
  try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { v = null; }
  return { heroes: [], villains: [], notes: {}, ...(v && typeof v === 'object' ? v : {}) };
}

function store(team) {
  try { localStorage.setItem(KEY, JSON.stringify(team)); } catch { /* storage unavailable */ }
}

export function setTeamRules(rules, h2 = {}) {
  R = rules;
  hooks = h2;
}

const isVillain = (ch) => ch.alignment === 'villain';
const nameOf = (ch) => ch.identity?.codename || ch.identity?.realName || 'Unnamed';

/**
 * Who is in play right now, for the session planner's "Who played": each character with their conditions,
 * note and the bonus XP of this session (still to give plus already given to the sheet).
 */
export function teamSnapshot() {
  const team = load();
  const out = [];
  for (const kind of ['heroes', 'villains']) {
    for (const id of team[kind]) {
      const ch = state.roster.find((c) => c.rosterId === id);
      if (!ch) continue;
      const n = team.notes[id] || {};
      const conds = Array.isArray(n.conds) ? n.conds : n.cond && n.cond !== 'Normal' ? [n.cond] : [];
      out.push({ rosterId: id, name: nameOf(ch), villain: kind === 'villains', pl: ch.pl, conds, note: n.note || '', xp: (n.xp || 0) + (n.given || 0) });
    }
  }
  return out;
}

/** The "In play" tab: two lists, the players' heroes and the villains. */
export function teamTool(redraw) {
  // Redrawing replaces the control you just used, so keep the scroll and focus where they were.
  const rerender = () => {
    const y = window.scrollY;
    const label = document.activeElement?.getAttribute?.('aria-label');
    redraw();
    window.scrollTo(0, y);
    if (label) [...document.querySelectorAll('#view-gm [aria-label]')].find((el) => el.getAttribute('aria-label') === label)?.focus({ preventScroll: true });
    requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y); });
  };
  const team = load();
  const save = () => store(team);
  const conds = Object.keys(R.raw.gm?.conditions?.conditions || {}).filter((c) => c !== 'Normal');
  const noteOf = (id) => {
    const n = team.notes[id] || (team.notes[id] = {});
    Object.assign(n, { xp: 0, given: 0, note: '', hp: 1, penalty: 0, ...n });
    // Earlier versions kept one condition as n.cond.
    if (!Array.isArray(n.conds)) n.conds = n.cond && n.cond !== 'Normal' ? [n.cond] : [];
    delete n.cond;
    return n;
  };
  const inPlayOf = (kind) => team[kind].map((id) => state.roster.find((c) => c.rosterId === id)).filter(Boolean);
  /** A small − n + counter on a row. */
  const counter = (ch, n, field, label) => {
    const name = ch.identity?.codename || 'Unnamed';
    const step = (d) => { n[field] = Math.max(0, n[field] + d); save(); rerender(); };
    return h('span', { class: 'team-field' }, h('span', null, label),
      h('span', { class: 'team-xp' },
        h('button', { class: 'btn sm', type: 'button', 'aria-label': `Lower ${label.toLowerCase()} for ${name}`, disabled: n[field] <= 0, onClick: () => step(-1) }, '−'),
        h('b', { class: 'num' }, n[field]),
        h('button', { class: 'btn sm', type: 'button', 'aria-label': `Raise ${label.toLowerCase()} for ${name}`, onClick: () => step(1) }, '+')));
  };

  const side = (kind) => {
    const villains = kind === 'villains';
    const ids = team[kind];
    const pool = state.roster.filter((c) => c.rosterId && isVillain(c) === villains);
    const inPlay = inPlayOf(kind);
    const toggle = (id) => {
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.push(id);
      save(); rerender();
    };

    const row = (ch) => {
      const id = ch.rosterId;
      const n = noteOf(id);
      return h('article', { class: 'team-row', style: { '--hero': ch.theme?.color || '#888' }, 'data-id': id },
        h('div', { class: 'team-top' },
          h('b', { class: 'team-name' }, nameOf(ch)),
          h('span', { class: 'chip' }, `PL ${ch.pl}`),
          h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.open?.(ch) }, 'Open sheet'),
          h('button', { class: 'x', type: 'button', 'aria-label': `Take ${nameOf(ch)} out of play`, title: 'Take out of play', onClick: () => toggle(id) }, 'Remove')),
        h('div', { class: 'team-fields' },
          h('label', { class: 'team-field' }, h('span', null, 'Conditions'),
            h('select', { 'aria-label': `Add a condition to ${nameOf(ch)}`, onChange: (e) => { if (e.target.value && !n.conds.includes(e.target.value)) { n.conds.push(e.target.value); save(); } rerender(); } },
              h('option', { value: '' }, n.conds.length ? 'Add another…' : 'Normal · add…'),
              conds.filter((c) => !n.conds.includes(c)).map((c) => h('option', { value: c }, c)))),
          villains ? null : counter(ch, n, 'hp', 'Hero points'),
          counter(ch, n, 'penalty', 'Toughness penalty'),
          villains ? null : h('span', { class: 'team-field' }, h('span', null, 'Bonus points'),
            h('span', { class: 'team-xp' },
              h('button', { class: 'btn sm', type: 'button', 'aria-label': `Lower bonus points for ${nameOf(ch)}`, disabled: n.xp <= 0, onClick: () => { n.xp = Math.max(0, n.xp - 1); save(); rerender(); } }, '−'),
              h('b', { class: 'num' }, n.xp),
              h('button', { class: 'btn sm', type: 'button', 'aria-label': `Raise bonus points for ${nameOf(ch)}`, onClick: () => { n.xp += 1; save(); rerender(); } }, '+'),
              n.xp > 0 ? h('button', { class: 'btn sm', type: 'button', title: 'Add these points to the character\'s advancement and reset the count', onClick: () => {
                const copy = awardPoints(JSON.parse(JSON.stringify(ch)), R, n.xp, 'Bonus points from the GM');
                upsert(copy);
                toast(`${nameOf(ch)} gets ${n.xp} power point${n.xp > 1 ? 's' : ''}`);
                n.given = (n.given || 0) + n.xp; n.xp = 0; save(); rerender();
              } }, 'Give to sheet') : null))),
        n.conds.length ? h('ul', { class: 'team-conds' }, n.conds.map((c) => h('li', { class: 'team-cond' },
          h('b', null, `${c}: `), R.raw.gm?.conditions?.conditions?.[c] || '',
          h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${c} from ${nameOf(ch)}`, title: 'Remove', onClick: () => { n.conds = n.conds.filter((x) => x !== c); save(); rerender(); } }, 'Remove')))) : null,
        h('textarea', { rows: 2, placeholder: 'Notes', 'aria-label': `Notes for ${nameOf(ch)}`, onInput: (e) => { n.note = e.target.value; save(); } }, n.note));
    };

    return h('section', { class: 'panel team', id: `team-${kind}` },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        h('h2', null, villains ? 'Villains' : 'Playing'),
        h('span', { class: 'chip' }, `${inPlay.length} in play`),
        h('span', { style: { flex: 1 } }),
        inPlay.length ? h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { team[kind] = []; save(); rerender(); } }, 'Clear') : null),
      pool.length
        ? h('div', { class: 'team-pick', role: 'group', 'aria-label': villains ? 'Pick the villains' : 'Pick who is playing' },
          pool.map((c) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(ids.includes(c.rosterId)), style: { '--hero': c.theme?.color || '#888' }, onClick: () => toggle(c.rosterId) }, nameOf(c))))
        : h('p', { class: 'hint', style: { margin: 0 } }, villains ? 'Villains you save to the roster show up here.' : 'Heroes you save to the roster show up here.'),
      inPlay.length ? h('div', { class: 'team-list' }, inPlay.map(row))
        : h('p', { class: 'hint', style: { margin: 0 } }, villains ? 'Click a villain above to put them in play.' : 'Click the heroes above who are playing tonight.'));
  };

  const everyone = [...inPlayOf('heroes'), ...inPlayOf('villains')];
  const heroes = inPlayOf('heroes');
  const toBattle = () => {
    for (const ch of everyone) hooks.throwIn?.(ch);
    toast(`${everyone.length} in the Battle Room`);
    hooks.goBattle?.();
  };
  const toInitiative = () => {
    for (const ch of everyone) hooks.addToInitiative?.(ch, { replace: true, cond: noteOf(ch.rosterId).conds.join(', ') || 'Normal' });
    toast(`Initiative rolled for ${everyone.length}`);
    hooks.showGmTab?.('table');
  };
  const awardAll = () => {
    for (const ch of heroes) noteOf(ch.rosterId).xp += 1;
    save(); rerender(); toast(`+1 bonus point for ${heroes.length} hero${heroes.length > 1 ? 'es' : ''}`);
  };
  const newSession = () => {
    for (const ch of everyone) Object.assign(noteOf(ch.rosterId), { hp: 1, penalty: 0, conds: [], given: 0 });
    save(); rerender(); toast('Hero points back to 1, penalties and conditions cleared');
  };
  return h('div', { style: { display: 'grid', gap: '16px' } },
    h('p', { class: 'hint', style: { margin: 0 } }, 'Who is in play this session. Conditions, points and notes are kept in this browser and go into backups.'),
    h('div', { class: 'btn-row', id: 'team-actions' },
      h('button', { class: 'btn sm primary', type: 'button', disabled: !everyone.length, onClick: toBattle }, 'Everyone to the Battle Room'),
      h('button', { class: 'btn sm', type: 'button', disabled: !everyone.length, onClick: toInitiative }, 'Roll initiative for everyone'),
      h('button', { class: 'btn sm', type: 'button', disabled: !heroes.length, onClick: awardAll }, '+1 bonus point to every hero'),
      h('button', { class: 'btn sm ghost', type: 'button', disabled: !everyone.length, title: 'Hero points back to 1, Toughness penalties and conditions cleared', onClick: newSession }, 'Reset for a new session')),
    h('div', { class: 'gm' }, side('heroes'), side('villains')));
}
