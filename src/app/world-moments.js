// World: record what happened (a new tie, a betrayal, a death, a move), edit it, or undo it.

import { h, clear, toast, openDialog } from './dom.js';
import { state, upsert } from './store.js';
import { ENTITY_TYPES, createEntity, MOMENT_KINDS, MOMENT_GROUPS, momentKindsFor, momentSentence, recordMoment, removeMoment, updateMoment, lastSession } from '../engine/world.js';
import { W, typeMeta, findByName } from './world-common.js';

// ---- moments: what happened -------------------------------------------------------------------------------------------------

/** Keep a roster character's own faction list in step with a faction moment recorded in the World. */
function syncCharacterFactions(m) {
  const A = W.world.entities.get(m.a); const B = m.b ? W.world.entities.get(m.b) : null;
  if (!A?.character?.rosterId || !B || B.type !== 'faction') return;
  const roleOf = { joined: 'Member', founded: 'Founder', tookLeadership: 'Leader', left: 'Former member', expelled: 'Former member', steppedDown: 'Member' };
  const role = roleOf[m.kind];
  if (!role) return;
  const live = state.roster.find((x) => x.rosterId === A.character.rosterId);
  if (!live) return;
  const c = JSON.parse(JSON.stringify(live));
  c.factions = c.factions || [];
  const cur = c.factions.find((f) => f.name.toLowerCase() === B.name.toLowerCase());
  const since = m.session != null ? `session ${m.session}` : m.date || undefined;
  if (cur) {
    if (/Former/.test(role)) { if (!/Former/.test(cur.role || 'Member')) { cur.was = cur.role || 'Member'; cur.untilSession = m.session ?? undefined; cur.until = since; } cur.role = role; }
    else { cur.role = role; cur.since = cur.since || since; delete cur.was; delete cur.until; delete cur.untilSession; }
  }
  else c.factions.push({ name: B.name, role, kind: B.fields?.Kind || undefined, since });
  const savedCopy = upsert(c);
  // the Forge keeps its own copy of an open character: keep it in step
  for (const t of state.tabs || []) if (t.rosterId === savedCopy.rosterId) t.factions = JSON.parse(JSON.stringify(savedCopy.factions));
  if (state.current?.rosterId === savedCopy.rosterId) state.current.factions = JSON.parse(JSON.stringify(savedCopy.factions));
  W.hooks.changed?.(savedCopy);
}

export async function momentDialog({ a = null, b = null, kind = null } = {}) {
  const all = [...W.world.entities.values()].sort((x, y) => x.name.localeCompare(y.name));
  const nameOf = (id) => W.world.entities.get(id)?.name || '';
  const subject = h('input', { type: 'text', list: 'wd-mo-all', placeholder: 'Who (or which faction, place, thing)', 'aria-label': 'Who', value: a ? nameOf(a) : '' });
  const other = h('input', { type: 'text', list: 'wd-mo-all', placeholder: 'With whom / what', 'aria-label': 'Other party', value: b ? nameOf(b) : '' });
  const kindSel = h('select', { 'aria-label': 'What happened', size: 1 });
  const otherType = h('select', { 'aria-label': 'If new, make a' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t }, `new ${m.one.toLowerCase()}`)));
  const subjectType = h('select', { 'aria-label': 'If new, make a' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t }, `new ${m.one.toLowerCase()}`)));
  const latest = lastSession(W.world);
  const session = h('input', { type: 'number', min: 0, value: latest || '', placeholder: 'S#', 'aria-label': 'Session', style: { maxWidth: '90px' } });
  const date = h('input', { type: 'date', 'aria-label': 'Date', style: { maxWidth: '170px' } });
  const note = h('input', { type: 'text', placeholder: 'Why, how, what it cost (optional)', 'aria-label': 'Note' });
  const preview = h('p', { class: 'wd-mo-preview' });
  const otherRow = h('div', { class: 'add-row', id: 'wd-mo-other' }, other, otherType);
  const resolve = (input) => findByName(input.value);
  const fillKinds = () => {
    const A = resolve(subject); const B = resolve(other);
    const ids = momentKindsFor(A ? A.type : (subject.value.trim() ? subjectType.value : null), B ? B.type : null);
    const prev = kindSel.value || kind;
    clear(kindSel);
    kindSel.append(h('option', { value: '' }, 'What happened…'));
    for (const g of MOMENT_GROUPS) {
      const items = ids.filter((id) => MOMENT_KINDS[id].group === g);
      if (items.length) kindSel.append(h('optgroup', { label: g }, items.map((id) => h('option', { value: id, selected: id === prev }, MOMENT_KINDS[id].label))));
    }
    if (prev && !ids.includes(prev)) kindSel.value = '';
    refresh();
  };
  const refresh = () => {
    const k = MOMENT_KINDS[kindSel.value];
    const needsB = !!k?.b; const mayB = !!(k?.b || k?.optB);
    otherRow.hidden = !mayB;
    other.placeholder = needsB ? (k.b.length === 1 ? `Which ${typeMeta(k.b[0]).one.toLowerCase()}` : 'With whom / what') : 'With whom / what (optional)';
    if (k && (k.b || k.optB)) { const t = (k.b || k.optB)[0]; otherType.value = t; }
    const A = resolve(subject); const B = resolve(other);
    const an = A?.name || subject.value.trim() || 'Someone'; const bn = B?.name || other.value.trim() || (needsB ? '…' : '');
    preview.textContent = k ? `${session.value ? `Session ${session.value}: ` : ''}${momentSentence(kindSel.value, an, bn || null, note.value.trim())}${note.value.trim() && kindSel.value !== 'note' ? ` ${note.value.trim()}` : ''}` : 'Pick what happened.';
    subjectType.hidden = !!A || !subject.value.trim();
    otherType.hidden = !!B || !other.value.trim();
  };
  subject.addEventListener('input', fillKinds); other.addEventListener('input', fillKinds); kindSel.addEventListener('change', refresh); session.addEventListener('input', refresh); note.addEventListener('input', refresh); subjectType.addEventListener('change', fillKinds);
  fillKinds();
  const ok = await openDialog({
    title: '⚡ What happened',
    body: [
      h('datalist', { id: 'wd-mo-all' }, all.map((x) => h('option', { value: x.name }, typeMeta(x.type).one))),
      h('div', { class: 'add-row' }, subject, subjectType),
      kindSel,
      otherRow,
      h('div', { class: 'add-row' }, h('label', { class: 'wd-inline' }, 'Session', session), h('label', { class: 'wd-inline' }, 'Date', date)),
      note,
      preview,
      h('p', { class: 'hint', style: { margin: 0 } }, 'This writes a line on both timelines, starts the new tie at that session, ends the tie it replaces (it stays on the pages as "formerly") and, for a fate, marks the page. Undo it from any timeline.'),
    ],
    buttons: [{ label: 'Cancel', value: false }, { label: 'Record', value: true, primary: true }],
  });
  if (!ok) return;
  const k = MOMENT_KINDS[kindSel.value];
  if (!k) { toast('Pick what happened'); return momentDialog({ a, b, kind: kindSel.value }); }
  let A = resolve(subject);
  if (!A && subject.value.trim()) { const made = createEntity(W.saved, { type: subjectType.value, name: subject.value.trim() }); W.rebuild(); A = W.world.entities.get(made.id); }
  if (!A) { toast('Who did it happen to?'); return momentDialog({ a, b, kind: kindSel.value }); }
  let B = resolve(other);
  if (!B && other.value.trim() && (k.b || k.optB)) { const made = createEntity(W.saved, { type: otherType.value, name: other.value.trim() }); W.rebuild(); B = W.world.entities.get(made.id); }
  if (k.b && !B) { toast(`${k.label}: with whom?`); return momentDialog({ a: A.id, kind: kindSel.value }); }
  W.rebuild();
  const m = recordMoment(W.saved, W.world, { kind: kindSel.value, a: A.id, b: B?.id || null, session: session.value === '' ? null : Number(session.value), date: date.value || '', note: note.value.trim() });
  if (!m) { toast('That did not fit (wrong kind of page for this change).'); return; }
  W.save();
  syncCharacterFactions(m);
  W.rebuild();
  toast(`Recorded: ${m.text}`);
  if (W.ui.page === 'home' || W.ui.page === 'graph' || W.ui.page === 'vault') W.go(A.id); else W.renderWorld();
}

export async function editMomentDialog(id) {
  const m = (W.saved.moments || []).find((x) => x.id === id);
  if (!m) return;
  const session = h('input', { type: 'number', min: 0, value: m.session ?? '', style: { maxWidth: '90px' } });
  const date = h('input', { type: 'date', value: m.date || '', style: { maxWidth: '170px' } });
  const note = h('input', { type: 'text', value: m.note || '', placeholder: 'Note' });
  const ok = await openDialog({ title: 'Edit this moment', body: [h('p', { style: { margin: 0 }, class: 'wd-mo-preview' }, W.world.moments.find((x) => x.id === id)?.text || ''), h('div', { class: 'add-row' }, h('label', { class: 'wd-inline' }, 'Session', session), h('label', { class: 'wd-inline' }, 'Date', date)), note], buttons: [{ label: 'Cancel', value: false }, { label: 'Undo this moment', value: 'undo', danger: true }, { label: 'Save', value: true, primary: true }] });
  if (ok === 'undo') return undoMoment(id);
  if (!ok) return;
  updateMoment(W.saved, id, { session: session.value, date: date.value, note: note.value.trim() });
  W.save(); W.renderWorld();
}

export async function undoMoment(id) {
  const m = W.world.moments.find((x) => x.id === id);
  const ok = await openDialog({ title: 'Undo this moment?', body: h('p', { style: { margin: 0 } }, `"${m?.text || ''}" is removed from the timelines, the ties it made go, and the ties it ended come back.`), buttons: [{ label: 'Keep', value: false }, { label: 'Undo', value: true, danger: true }] });
  if (!ok) return;
  removeMoment(W.saved, id); W.save(); W.renderWorld(); toast('Undone');
}

