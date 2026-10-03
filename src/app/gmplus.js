// GM Tools, part 2: combat calculator, GM screen and GM notes.

import { h, clear, toast, download, openDialog } from './dom.js';
import { state } from './store.js';
import { deriveAll } from '../engine/derive.js';
let R;
export function setRules(rules) { R = rules; }

function readLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const pct = (x) => `${Math.round(x * 100)}%`;
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------------------------------------
// Probability math (d20 checks with natural 20s)

/** Chance an attack hits: d20 + bonus >= 10 + defense; natural 20 always hits (and crits), natural 1 always misses. */
export function hitOdds(bonus, defense) {
  let hit = 0;
  let crit = 0;
  for (let r = 1; r <= 20; r++) {
    if (r === 20) { hit++; crit++; continue; }
    if (r === 1) continue;
    if (r + bonus >= 10 + defense) hit++;
  }
  return { hit: hit / 20, crit: crit / 20 };
}

/** Distribution of a resistance check's degrees of failure (0 = resisted .. 4 = four or more). */
export function resistOdds(resist, dc) {
  const out = [0, 0, 0, 0, 0];
  for (let r = 1; r <= 20; r++) {
    const total = r + resist;
    let fails = 0;
    if (total < dc) fails = 1 + Math.floor((dc - total - 1) / 5);
    if (r === 20) fails = Math.max(0, fails - 1); // a natural 20 improves the result by a degree
    out[Math.min(4, fails)] += 1 / 20;
  }
  return out;
}

const DAMAGE_RESULTS = ['No effect', 'Bruised (−1 Toughness)', 'Dazed and bruised', 'Staggered and bruised', 'Incapacitated'];
const AFFLICTION_RESULTS = ['No effect', '1st degree condition', '2nd degree condition', '3rd degree condition', '3rd degree condition'];

// ---------------------------------------------------------------------------------------------
// Combat calculator

function people() {
  const list = [];
  if (state.current) list.push(state.current);
  for (const c of state.roster) if (!list.some((x) => x.rosterId && x.rosterId === c.rosterId)) list.push(c);
  return list;
}

export function combatCalculator() {
  const s = readLS('dcugen.calc', { bonus: 10, rank: 10, effect: 'Damage', roll: true, defense: 10, resist: 10, penalty: 0 });
  const save = () => writeLS('dcugen.calc', s);
  const out = h('div', { style: { display: 'grid', gap: '10px' } });
  const roster = people();
  const attackOptions = [];
  for (const ch of roster) {
    let d;
    try { d = deriveAll(ch, R); } catch { continue; }
    for (const a of d.attacks) attackOptions.push({ label: `${ch.identity?.codename || 'Character'}: ${a.name}`, a });
  }
  const defenderOptions = roster.map((ch) => { try { return { ch, d: deriveAll(ch, R) }; } catch { return null; } }).filter(Boolean);

  const inputs = {};
  const numIn = (key, label) => {
    inputs[key] = h('input', { type: 'number', id: `calc-${key}`, value: s[key], onInput: (e) => { s[key] = Number(e.target.value) || 0; save(); draw(); } });
    return h('label', { class: 'field' }, h('span', null, label), inputs[key]);
  };
  const effectSel = h('select', { id: 'calc-effect', onChange: (e) => { s.effect = e.target.value; save(); draw(); } },
    ['Damage', 'Affliction', 'Weaken', 'Nullify'].map((x) => h('option', { value: x, selected: s.effect === x }, x)));
  const rollSel = h('select', { id: 'calc-roll', onChange: (e) => { s.roll = e.target.value === 'roll'; save(); draw(); } },
    [['roll', 'Attack roll (close/ranged)'], ['area', 'Area (Dodge for half)'], ['perception', 'Perception (no roll)']].map(([v, t]) => h('option', { value: v, selected: (s.roll ? 'roll' : s.kind || 'area') === v }, t)));
  rollSel.addEventListener('change', (e) => { s.kind = e.target.value; save(); });

  const pickAttack = h('select', { id: 'calc-pick-atk', 'aria-label': 'Fill attacker from a character' },
    h('option', { value: '' }, attackOptions.length ? 'Fill from a character attack…' : 'Save characters to pick their attacks'),
    attackOptions.map((o, i) => h('option', { value: i }, o.label)));
  pickAttack.addEventListener('change', () => {
    const o = attackOptions[Number(pickAttack.value)];
    if (!o) return;
    s.bonus = o.a.bonus ?? 0; s.rank = o.a.rank; s.effect = ['Damage', 'Affliction', 'Weaken', 'Nullify'].includes(o.a.effect) ? o.a.effect : 'Affliction';
    s.roll = o.a.roll; s.kind = o.a.roll ? 'roll' : o.a.kind; save(); render();
  });
  const pickDef = h('select', { id: 'calc-pick-def', 'aria-label': 'Fill defender from a character' },
    h('option', { value: '' }, defenderOptions.length ? 'Fill defender from a character…' : 'Save characters to pick defenders'),
    defenderOptions.map((o, i) => h('option', { value: i }, o.ch.identity?.codename || 'Character')));
  const defWhich = h('select', { id: 'calc-defwhich', 'aria-label': 'Which defense' }, ['Parry', 'Dodge'].map((x) => h('option', { value: x }, x)));
  pickDef.addEventListener('change', () => {
    const o = defenderOptions[Number(pickDef.value)];
    if (!o) return;
    s.defense = o.d.defenses[defWhich.value];
    const res = s.effect === 'Damage' ? 'Toughness' : 'Fortitude';
    s.resist = typeof o.d.defenses[res] === 'number' ? o.d.defenses[res] : 0;
    save(); render();
  });

  function draw() {
    clear(out);
    const dc = (s.effect === 'Damage' ? 15 : 10) + s.rank;
    const results = s.effect === 'Damage' ? DAMAGE_RESULTS : AFFLICTION_RESULTS;
    let hit = 1; let crit = 0;
    if (s.roll) ({ hit, crit } = hitOdds(s.bonus, s.defense));
    const normal = resistOdds(s.resist - s.penalty, dc);
    const critDist = resistOdds(s.resist - s.penalty, dc + 5);
    const total = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) total[i] = (hit - crit) * normal[i] + crit * critDist[i];
    total[0] += 1 - hit;
    const kind = s.roll ? `Attack ${sign(s.bonus)} vs. ${s.defense + 10} (10 + defense ${s.defense})` : s.kind === 'perception' ? 'No attack roll (perception range)' : `Area: no attack roll; a Dodge check DC ${10 + s.rank} halves the effect`;
    out.append(
      h('div', { class: 'result' }, h('b', null, kind), s.roll ? h('div', null, `Hit chance ${pct(hit)}, critical ${pct(crit)} (a crit adds +5 to the resistance DC).`) : null,
        h('div', null, `Resistance: d20 ${sign(s.resist)}${s.penalty ? ` − ${s.penalty} penalty` : ''} vs. DC ${dc} (${s.effect === 'Damage' ? '15' : '10'} + rank ${s.rank}).`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'skills' }, h('tbody', null, results.map((label, i) => h('tr', null,
        h('td', null, label), h('td', { style: { width: '50%' } }, h('div', { class: 'meter' }, h('i', { class: i >= 3 ? 'over' : '', style: { width: pct(total[i]) } }))),
        h('td', { class: 'b num' }, pct(total[i]))))))));
  }

  function rollIt() {
    const d20 = () => 1 + Math.floor(Math.random() * 20);
    const dc = (s.effect === 'Damage' ? 15 : 10) + s.rank;
    const lines = [];
    let crit = false;
    if (s.roll) {
      const r = d20();
      const total = r + s.bonus;
      const hit = r === 20 || (r !== 1 && total >= 10 + s.defense);
      crit = r === 20;
      lines.push(`Attack: d20 ${r} ${sign(s.bonus)} = ${total} vs. ${10 + s.defense} → ${r === 1 ? 'natural 1, miss' : hit ? (crit ? 'CRITICAL HIT' : 'hit') : 'miss'}`);
      if (!hit) { show(lines); return; }
    }
    const r2 = d20();
    const t2 = r2 + s.resist - s.penalty;
    const eff = dc + (crit ? 5 : 0);
    let fails = t2 >= eff ? 0 : 1 + Math.floor((eff - t2 - 1) / 5);
    if (r2 === 20) fails = Math.max(0, fails - 1);
    const results = s.effect === 'Damage' ? DAMAGE_RESULTS : AFFLICTION_RESULTS;
    lines.push(`Resistance: d20 ${r2} ${sign(s.resist - s.penalty)} = ${t2} vs. DC ${eff} → ${fails ? `${fails} degree${fails > 1 ? 's' : ''} of failure` : 'resisted'}`);
    lines.push(`Result: ${results[Math.min(4, fails)]}`);
    show(lines);
  }
  const rollOut = h('div', { class: 'result', 'aria-live': 'polite', hidden: true });
  function show(lines) { clear(rollOut).append(...lines.map((l) => h('div', null, l))); rollOut.hidden = false; }

  function render() {
    for (const [k, el] of Object.entries(inputs)) el.value = s[k];
    effectSel.value = s.effect;
    rollSel.value = s.roll ? 'roll' : s.kind || 'area';
    draw();
  }

  const panel = h('section', { class: 'panel' },
    h('h2', null, 'Combat calculator'),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Odds of each outcome for one attack, using DC 10 + defense to hit and DC 15 + rank (Damage) or 10 + rank to resist.'),
    pickAttack,
    h('div', { class: 'grid3' }, numIn('bonus', 'Attack bonus'), numIn('rank', 'Effect rank'), h('label', { class: 'field' }, h('span', null, 'Effect'), effectSel)),
    h('label', { class: 'field' }, h('span', null, 'Delivery'), rollSel),
    h('div', { class: 'add-row' }, pickDef, defWhich),
    h('div', { class: 'grid3' }, numIn('defense', 'Dodge or Parry'), numIn('resist', 'Resistance (Tough/Fort/Will)'), numIn('penalty', 'Toughness penalty')),
    out,
    h('button', { class: 'btn primary', type: 'button', onClick: rollIt }, 'Roll it'),
    rollOut);
  draw();
  return panel;
}

// ---------------------------------------------------------------------------------------------
// GM screen: pinned characters with live trackers

export function gmScreen(rerender) {
  const screen = readLS('dcugen.screen', { pinned: [], track: {} });
  const save = () => writeLS('dcugen.screen', screen);
  const all = people();
  const keyOf = (ch) => ch.rosterId || ch.seed || ch.identity?.codename;
  const pinned = screen.pinned.map((k) => all.find((c) => keyOf(c) === k)).filter(Boolean);
  const conds = Object.keys(R.raw.gm?.conditions?.conditions || {});

  const picker = h('select', { id: 'screen-add', 'aria-label': 'Pin a character' },
    h('option', { value: '' }, all.length ? 'Pin a character…' : 'Save characters to your roster to pin them'),
    all.filter((c) => !screen.pinned.includes(keyOf(c))).map((c) => h('option', { value: keyOf(c) }, `${c.identity?.codename || 'Character'} (PL ${c.pl})`)));
  picker.addEventListener('change', () => { if (picker.value) { screen.pinned.push(picker.value); save(); rerender(); } });

  const card = (ch) => {
    const k = keyOf(ch);
    const t = screen.track[k] || (screen.track[k] = { hp: 1, penalty: 0, cond: 'Normal', note: '' });
    let d;
    try { d = deriveAll(ch, R); } catch { return null; }
    const counter = (label, field, min = 0) => h('span', { class: 'chip' }, `${label} `, h('b', { class: 'num' }, t[field]),
      h('span', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': `Lower ${label}`, onClick: () => { t[field] = Math.max(min, t[field] - 1); save(); rerender(); } }, '−'),
        h('button', { type: 'button', 'aria-label': `Raise ${label}`, onClick: () => { t[field] += 1; save(); rerender(); } }, '+')));
    const def = d.defenses;
    const powers = [...(ch.powers || []), ...(ch.devices || []).flatMap((x) => x.powers)].slice(0, 6);
    return h('article', { class: 'panel screen-card', style: { '--hero': ch.theme?.color || '#888' } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } },
        h('h3', { class: 'rule-title' }, ch.identity?.codename || 'Character'), h('span', { class: 'chip' }, `PL ${ch.pl}`), h('span', { class: 'chip' }, `Init ${sign(d.initiative)}`),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'x', type: 'button', 'aria-label': 'Unpin', onClick: () => { screen.pinned = screen.pinned.filter((x) => x !== k); save(); rerender(); } }, '✕')),
      h('div', { class: 'card-stats', style: { gridTemplateColumns: 'repeat(5, 1fr)' } },
        [['Dodge', def.Dodge], ['Parry', def.Parry], ['Fort', def.immune?.Fortitude ? '—' : def.Fortitude], ['Tough', def.Toughness - t.penalty], ['Will', def.immune?.Will ? '—' : def.Will]].map(([n, v]) =>
          h('div', null, h('b', { class: 'num' }, v), h('span', null, n.toUpperCase())))),
      h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } }, `To hit: close DC ${Math.ceil((t.cond === 'Vulnerable' ? def.Parry / 2 : t.cond === 'Defenseless' ? 0 : def.Parry)) + 10} · ranged DC ${Math.ceil((t.cond === 'Vulnerable' ? def.Dodge / 2 : t.cond === 'Defenseless' ? 0 : def.Dodge)) + 10}${def.immune?.Will ? '' : ` · mental DC ${def.Will + 10}`}`),
      h('div', { style: { fontSize: '13.5px' } }, d.attacks.slice(0, 5).map((a) => h('div', null, h('b', null, a.name), ` ${a.roll ? sign(a.bonus) : a.kind}, ${a.effect} ${a.rank}`))),
      powers.length ? h('div', { style: { fontSize: '12.5px', color: 'var(--ink-2)' } }, powers.map((p) => p.name).join(' · ')) : null,
      h('div', { class: 'btn-row' }, counter('Hero points', 'hp'), counter('Toughness penalty', 'penalty'),
        h('select', { 'aria-label': `Condition for ${ch.identity?.codename}`, style: { maxWidth: '150px', padding: '4px' }, onChange: (e) => { t.cond = e.target.value; save(); rerender(); } },
          conds.map((c) => h('option', { value: c, selected: c === t.cond }, c)))),
      t.cond !== 'Normal' ? h('div', { class: 'result', style: { fontSize: '13px' } }, h('b', null, `${t.cond}: `), R.raw.gm?.conditions?.conditions?.[t.cond] || '') : null,
      h('input', { type: 'text', value: t.note, placeholder: 'Quick note', 'aria-label': 'Quick note', onChange: (e) => { t.note = e.target.value; save(); } }));
  };

  const ref = R.raw.reference || {};
  return h('div', { style: { display: 'grid', gap: '16px' } },
    h('section', { class: 'panel' },
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h2', null, 'GM screen'), picker,
        h('button', { class: 'btn sm', type: 'button', onClick: () => { for (const k of screen.pinned) screen.track[k] = { hp: 1, penalty: 0, cond: 'Normal', note: screen.track[k]?.note || '' }; save(); rerender(); } }, 'Reset trackers')),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Pin heroes, villains and monsters you\'ve saved. Trackers are kept in this browser.')),
    pinned.length ? h('div', { class: 'gm' }, pinned.map(card)) : h('div', { class: 'empty' }, h('h2', null, 'Nothing pinned yet'), h('p', null, 'Save characters or creatures to your roster, then pin them here.')),
    h('div', { class: 'gm' },
      ref.difficulty ? h('section', { class: 'panel' }, h('h2', null, 'Difficulty'), h('table', { class: 'skills' }, h('tbody', null, ref.difficulty.map((x) => h('tr', null, h('td', { class: 'b' }, x.dc), h('td', null, x.label), h('td', { style: { color: 'var(--ink-3)', fontSize: '13px' } }, x.example || '')))))) : null,
      ref.damage ? h('section', { class: 'panel' }, h('h2', null, 'Damage'), h('p', { class: 'hint', style: { margin: 0 } }, `Toughness vs. DC ${ref.damage.toughness_dc}`), h('table', { class: 'skills' }, h('tbody', null, ref.damage.results.map((x) => h('tr', null, h('td', null, h('b', null, x.degree)), h('td', null, x.result)))))) : null,
      h('section', { class: 'panel' }, h('h2', null, 'Conditions'), h('div', { class: 'scroll' }, Object.entries(R.raw.gm?.conditions?.conditions || {}).map(([k, v]) => h('div', { class: 'beast' }, h('b', null, k), ` ${v}`))))));
}

// ---------------------------------------------------------------------------------------------
// GM notes

export function notesTool(rerender) {
  const notes = readLS('dcugen.notes', []);
  const ui = readLS('dcugen.notes.ui', { selected: null, q: '' });
  const save = () => writeLS('dcugen.notes', notes);
  const saveUi = () => writeLS('dcugen.notes.ui', ui);
  const current = notes.find((n) => n.id === ui.selected) || notes[0] || null;
  const q = ui.q.toLowerCase();
  const list = notes.filter((n) => !q || `${n.title} ${n.tags} ${n.body}`.toLowerCase().includes(q))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || '').localeCompare(a.updated || ''));
  const newNote = () => {
    const n = { id: `n-${Date.now().toString(36)}`, title: 'New note', tags: '', body: '', updated: new Date().toISOString() };
    notes.unshift(n); ui.selected = n.id; save(); saveUi(); rerender();
  };
  const fileIn = h('input', { type: 'file', accept: '.json', id: 'notes-import', hidden: true, onChange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const incoming = Array.isArray(data) ? data : data.notes || [];
      for (const n of incoming) if (n && n.title !== undefined && !notes.some((x) => x.id === n.id)) notes.push(n);
      save(); toast(`Imported ${incoming.length} notes`); rerender();
    } catch (err) { toast(`Import failed: ${err.message}`); }
  } });
  const editor = current ? h('div', { style: { display: 'grid', gap: '10px', minWidth: 0 } },
    h('input', { type: 'text', id: 'note-title', value: current.title, 'aria-label': 'Note title', style: { font: '800 22px/1.1 var(--font-display)', textTransform: 'uppercase' },
      onInput: (e) => { current.title = e.target.value; current.updated = new Date().toISOString(); save(); } }),
    h('input', { type: 'text', id: 'note-tags', value: current.tags, placeholder: 'Tags: session 3, villains, Gotham', 'aria-label': 'Tags', onInput: (e) => { current.tags = e.target.value; save(); } }),
    h('textarea', { id: 'note-body', style: { minHeight: '320px' }, 'aria-label': 'Note', onInput: (e) => { current.body = e.target.value; current.updated = new Date().toISOString(); save(); } }, current.body),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn sm', type: 'button', onClick: () => { current.pinned = !current.pinned; save(); rerender(); } }, current.pinned ? 'Unpin' : 'Pin to top'),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn sm ghost danger', type: 'button', onClick: async () => {
        const ok = await openDialog({ title: 'Delete this note?', body: h('p', { style: { margin: 0 } }, `"${current.title}" will be removed from this browser.`), buttons: [{ label: 'Keep', value: false }, { label: 'Delete', value: true, danger: true }] });
        if (ok) { notes.splice(notes.indexOf(current), 1); ui.selected = null; save(); saveUi(); rerender(); }
      } }, 'Delete')),
    h('p', { class: 'hint', style: { margin: 0 } }, `Saved automatically in this browser · ${current.updated ? new Date(current.updated).toLocaleString() : ''}`))
    : h('div', { class: 'empty' }, h('h2', null, 'No notes yet'), h('p', null, 'Keep session plans, villain schemes, NPC names and loot here.'), h('button', { class: 'btn primary', type: 'button', onClick: newNote }, 'Write the first note'));
  return h('section', { class: 'panel' },
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h('h2', null, 'GM notes'), h('span', { style: { flex: 1 } }),
      h('button', { class: 'btn primary sm', type: 'button', onClick: newNote }, '+ New note'),
      h('button', { class: 'btn sm', type: 'button', onClick: () => fileIn.click() }, 'Import'),
      h('button', { class: 'btn sm', type: 'button', disabled: !notes.length, onClick: () => download('dcugen-notes.json', JSON.stringify({ app: 'DCUGen', notes }, null, 2), 'application/json') }, 'Export'),
      fileIn),
    h('div', { class: 'notes-layout' },
      h('div', { style: { display: 'grid', gap: '6px', alignContent: 'start', minWidth: 0 } },
        h('input', { type: 'search', id: 'notes-q', placeholder: 'Search notes', value: ui.q, 'aria-label': 'Search notes', onInput: (e) => { ui.q = e.target.value; saveUi(); rerender(); setTimeout(() => { const el = document.getElementById('notes-q'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); } }),
        list.map((n) => h('button', { type: 'button', class: `note-item ${current && n.id === current.id ? 'active' : ''}`, onClick: () => { ui.selected = n.id; saveUi(); rerender(); } },
          h('b', null, `${n.pinned ? '★ ' : ''}${n.title || 'Untitled'}`), h('small', null, n.tags || (n.body || '').slice(0, 60))))),
      editor));
}

// ---------------------------------------------------------------------------------------------
// Damage Resistance Matrix (DC Adventures Hero's Handbook, p. 273): Toughness check result vs. damage rank.

const MATRIX_KEYS = [['none', 'No effect'], ['pen', '−1 penalty'], ['dazed', 'Dazed'], ['stag', 'Staggered'], ['inc', 'Incapacitated']];

/** Degrees of failure (0-4) for a Toughness check result against Damage rank (DC 15 + rank). */
export function damageOutcome(save, rank) {
  const dc = 15 + rank;
  if (save >= dc) return 0;
  return Math.min(4, 1 + Math.floor((dc - save - 1) / 5));
}

export function damageMatrix({ maxSave = 35, maxRank = 20, highlight } = {}) {
  const ranks = Array.from({ length: maxRank }, (_, i) => i + 1);
  return h('div', { class: 'matrix-wrap' },
    h('div', { class: 'table-wrap' }, h('table', { class: 'dmg-matrix', 'aria-label': 'Damage resistance matrix' },
      h('thead', null,
        h('tr', null, h('th', { rowspan: 2, class: 'corner' }, 'Save result'), h('th', { colspan: maxRank, class: 'top' }, 'Damage bonus')),
        h('tr', null, ranks.map((r) => h('th', { class: 'num' }, r)))),
      h('tbody', null, Array.from({ length: maxSave }, (_, i) => i + 1).map((save) => h('tr', null,
        h('th', { class: 'num' }, save),
        ranks.map((rank) => {
          const o = damageOutcome(save, rank);
          const hit = highlight && highlight.save === save && highlight.rank === rank;
          return h('td', { title: `Save ${save} vs Damage ${rank} (DC ${15 + rank}): ${MATRIX_KEYS[o][1]}` },
            h('span', { class: `pill ${MATRIX_KEYS[o][0]} ${hit ? 'hit' : ''}` }));
        })))))),
    h('div', { class: 'matrix-legend' }, MATRIX_KEYS.map(([k, label]) => h('span', null, h('span', { class: `pill ${k}` }), label))),
    h('div', { class: 'rule-src' }, "DC Adventures Hero's Handbook, p. 273"));
}

export function damageMatrixTool() {
  const save = h('input', { type: 'number', id: 'matrix-save', min: 1, max: 60, placeholder: 'e.g. 18', 'aria-label': 'Toughness check result' });
  const rank = h('input', { type: 'number', id: 'matrix-rank', min: 1, max: 30, placeholder: 'e.g. 10', 'aria-label': 'Damage rank' });
  const host = h('div');
  const out = h('div', { class: 'result', 'aria-live': 'polite' }, 'Enter a Toughness check result and a damage rank to look it up, or just read the chart.');
  const draw = () => {
    const s = Number(save.value); const r = Number(rank.value);
    clear(host);
    const ok = s > 0 && r > 0;
    host.append(damageMatrix({ maxSave: Math.max(35, ok ? s : 0), maxRank: Math.max(20, ok ? r : 0), highlight: ok ? { save: s, rank: r } : null }));
    if (ok) { const o = damageOutcome(s, r); clear(out).append(h('b', null, `Save ${s} vs. Damage ${r} (DC ${15 + r}): `), MATRIX_KEYS[o][1]); }
  };
  save.addEventListener('input', draw);
  rank.addEventListener('input', draw);
  draw();
  return h('section', { class: 'panel' },
    h('h2', null, 'Damage resistance matrix'),
    h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'Toughness check result'), save), h('label', { class: 'field' }, h('span', null, 'Damage rank'), rank)),
    out, host);
}
