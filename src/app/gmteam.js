// GM Tools, "In play": who is at the table tonight. Click the heroes that are playing and the villains
// you've made, keep a condition, bonus points and a note on each, and open any of them as a full sheet.

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

/** The "In play" tab: two lists, the players' heroes and the villains. */
export function teamTool(rerender) {
  const team = load();
  const save = () => store(team);
  const conds = Object.keys(R.raw.gm?.conditions?.conditions || { Normal: '' });
  const noteOf = (id) => {
    const n = team.notes[id] || (team.notes[id] = {});
    return Object.assign(n, { cond: 'Normal', xp: 0, note: '', hp: 1, penalty: 0, ...n });
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
      const desc = n.cond !== 'Normal' ? R.raw.gm?.conditions?.conditions?.[n.cond] : '';
      return h('article', { class: 'team-row', style: { '--hero': ch.theme?.color || '#888' }, 'data-id': id },
        h('div', { class: 'team-top' },
          h('b', { class: 'team-name' }, nameOf(ch)),
          h('span', { class: 'chip' }, `PL ${ch.pl}`),
          h('span', { style: { flex: 1 } }),
          h('button', { class: 'btn sm', type: 'button', onClick: () => hooks.open?.(ch) }, 'Open sheet'),
          h('button', { class: 'x', type: 'button', 'aria-label': `Take ${nameOf(ch)} out of play`, title: 'Take out of play', onClick: () => toggle(id) }, '✕')),
        h('div', { class: 'team-fields' },
          h('label', { class: 'team-field' }, h('span', null, 'Condition'),
            h('select', { 'aria-label': `Condition for ${nameOf(ch)}`, onChange: (e) => { n.cond = e.target.value; save(); rerender(); } },
              conds.map((c) => h('option', { value: c, selected: c === n.cond }, c)))),
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
                n.xp = 0; save(); rerender();
              } }, 'Give to sheet') : null))),
        desc ? h('div', { class: 'team-cond' }, h('b', null, `${n.cond}: `), desc) : null,
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
    for (const ch of everyone) hooks.addToInitiative?.(ch, { replace: true, cond: noteOf(ch.rosterId).cond });
    toast(`Initiative rolled for ${everyone.length}`);
    hooks.showGmTab?.('table');
  };
  const awardAll = () => {
    for (const ch of heroes) noteOf(ch.rosterId).xp += 1;
    save(); rerender(); toast(`+1 bonus point for ${heroes.length} hero${heroes.length > 1 ? 'es' : ''}`);
  };
  const newSession = () => {
    for (const ch of everyone) Object.assign(noteOf(ch.rosterId), { hp: 1, penalty: 0, cond: 'Normal' });
    save(); rerender(); toast('Hero points back to 1, penalties and conditions cleared');
  };
  return h('div', { style: { display: 'grid', gap: '16px' } },
    h('p', { class: 'hint', style: { margin: 0 } }, 'Who is in play this session. Conditions, points and notes are kept in this browser and go into backups.'),
    h('div', { class: 'btn-row', id: 'team-actions' },
      h('button', { class: 'btn sm primary', type: 'button', disabled: !everyone.length, onClick: toBattle }, '⚔ Everyone to the Battle Room'),
      h('button', { class: 'btn sm', type: 'button', disabled: !everyone.length, onClick: toInitiative }, 'Roll initiative for everyone'),
      h('button', { class: 'btn sm', type: 'button', disabled: !heroes.length, onClick: awardAll }, '+1 bonus point to every hero'),
      h('button', { class: 'btn sm ghost', type: 'button', disabled: !everyone.length, title: 'Hero points back to 1, Toughness penalties and conditions cleared', onClick: newSession }, 'Reset for a new session')),
    h('div', { class: 'gm' }, side('heroes'), side('villains')));
}
