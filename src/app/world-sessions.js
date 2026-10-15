// World: the session planner. The next game night (with a calendar file for the players), every session with
// its scenes linked to World pages, notes and the Session in a Box plan made for it, the open plot threads, and
// "Previously on…" to send to the table when the next session starts.

import { h, toast, copyText, download, openDialog } from './dom.js';
import { lastSession, slug } from '../engine/world.js';
import { sessionsOf, addSession, getSession, updateSession, removeSession, addScene, updateScene, removeScene, moveScene, markPlayed, nextSession, attachPlan, addThread, closeThread, reopenThread, removeThread, openThreads, previouslyOn, sessionIcs, whenLabel } from '../engine/sessions.js';
import { W, pageLink, findByName } from './world-common.js';

const campaign = () => (W.saved?.name && W.saved.name !== 'My World' ? W.saved.name : 'Our Campaign');
const commit = () => { W.save(); W.renderWorld(); };

/** Page links from names typed in a box, comma-separated: known pages only. */
function linksFrom(text) {
  const ids = []; const unknown = [];
  for (const n of String(text || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const e = findByName(n);
    if (e) ids.push(e.id); else unknown.push(n);
  }
  return { ids, unknown };
}
const chipsFor = (ids) => (ids || []).map((id) => W.world.entities.get(id)).filter(Boolean).map((e) => pageLink(e, { chip: true }));
const namesList = () => h('datalist', { id: 'ses-names' }, [...W.world.entities.values()].sort((a, b) => a.name.localeCompare(b.name)).map((e) => h('option', { value: e.name })));

function invite(s) {
  return `${campaign()}: Session ${s.number}${s.title ? ` (${s.title})` : ''}${s.date ? `, ${whenLabel(s.date)}` : ''}. Bring your character!`;
}

function downloadIcs(s) {
  const ics = sessionIcs(s, { campaign: campaign() });
  if (!ics) { toast('Give the session a date first'); return; }
  download(`${slug(campaign())}-session-${s.number}.ics`, ics, 'text/calendar');
  toast('Calendar file saved: send it to your players, or open it to add it to yours');
}

// ---- the next session ----------------------------------------------------------------------------------------

function nextPanel() {
  const s = nextSession(W.saved);
  const plan = () => { const n = addSession(W.saved, { after: lastSession(W.world) }); W.ui.sessionId = n.id; commit(); };
  if (!s) {
    return h('section', { class: 'panel ses-next empty-next' },
      h('h2', null, '🗓 Next session'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing planned yet. Plan the next game night: a date for the calendar, the scenes you have in mind, and the threads to pick up.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', id: 'ses-new', onClick: plan }, '+ Plan the next session')));
  }
  return h('section', { class: 'panel ses-next' },
    h('div', { class: 'eyebrow' }, 'Next session'),
    h('h2', null, `Session ${s.number}${s.title ? `: ${s.title}` : ''}`),
    h('p', { class: 'ses-when' }, s.date ? whenLabel(s.date) : 'No date yet'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onClick: () => { W.ui.sessionId = s.id; commit(); } }, 'Open'),
      h('button', { class: 'btn', type: 'button', id: 'ses-ics', disabled: !s.date, onClick: () => downloadIcs(s) }, '📅 Add to calendar'),
      h('button', { class: 'btn', type: 'button', onClick: async () => toast((await copyText(invite(s))) ? 'Invite copied: paste it in the group chat' : 'Copy failed') }, 'Copy the invite'),
      h('button', { class: 'btn ghost', type: 'button', onClick: plan }, '+ Plan another')));
}

// ---- one session -----------------------------------------------------------------------------------------------

function sceneRow(s, sc, i) {
  return h('li', { class: `ses-scene ${sc.done ? 'done' : ''}` },
    h('input', { type: 'checkbox', checked: !!sc.done, 'aria-label': 'Played', onChange: (e) => { updateScene(W.saved, s.id, sc.id, { done: e.target.checked }); commit(); } }),
    h('div', { class: 'ses-scene-body' },
      h('span', { class: 'ses-scene-text' }, sc.text),
      sc.links?.length ? h('div', { class: 'wd-chips' }, chipsFor(sc.links)) : null),
    h('span', { class: 'ses-scene-tools' },
      h('button', { class: 'x', type: 'button', 'aria-label': 'Move up', disabled: i === 0, onClick: () => { moveScene(W.saved, s.id, sc.id, -1); commit(); } }, '↑'),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Move down', disabled: i === s.scenes.length - 1, onClick: () => { moveScene(W.saved, s.id, sc.id, 1); commit(); } }, '↓'),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Remove scene', onClick: () => { removeScene(W.saved, s.id, sc.id); commit(); } }, '✕')));
}

function sessionEditor(s) {
  const title = h('input', { type: 'text', id: 'ses-title', value: s.title || '', placeholder: 'A title (optional): The Heist, Aftermath…', 'aria-label': 'Session title', onChange: (e) => { updateSession(W.saved, s.id, { title: e.target.value.trim() }); commit(); } });
  const date = h('input', { type: 'datetime-local', id: 'ses-date', value: s.date ? String(s.date).slice(0, 16) : '', 'aria-label': 'When', onChange: (e) => { updateSession(W.saved, s.id, { date: e.target.value }); commit(); } });
  const sceneIn = h('input', { type: 'text', id: 'ses-scene', placeholder: 'A scene: "Ambush at the docks", "Interrogate Doctor Null"…', 'aria-label': 'New scene' });
  const linkIn = h('input', { type: 'text', id: 'ses-scene-links', list: 'ses-names', placeholder: 'Who or where (pages, comma-separated)', 'aria-label': 'Linked pages' });
  const addIt = () => {
    const { ids, unknown } = linksFrom(linkIn.value);
    if (!addScene(W.saved, s.id, { text: sceneIn.value, links: ids })) { toast('Write the scene first'); return; }
    if (unknown.length) toast(`No page called ${unknown.join(', ')}: make one in the World to link it`);
    commit();
    setTimeout(() => W.root?.querySelector('#ses-scene')?.focus(), 0);
  };
  sceneIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') addIt(); });
  const notes = h('textarea', { id: 'ses-notes', placeholder: 'Notes: what the villain wants, clues to plant, who owes whom a favour…', 'aria-label': 'Notes', onChange: (e) => { updateSession(W.saved, s.id, { notes: e.target.value }); commit(); } }, s.notes || '');
  const gmPlan = W.hooks.gmPlan?.();
  const p = s.plan;
  return h('section', { class: 'panel ses-edit', id: 'ses-edit' },
    h('div', { class: 'gm-head' },
      h('h2', null, `Session ${s.number}`),
      h('span', { class: `chip ${s.status === 'played' ? '' : 'warn'}` }, s.status === 'played' ? 'Played' : 'Planned'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { W.ui.sessionId = null; commit(); } }, 'Close')),
    h('div', { class: 'add-row' }, title, date),
    h('h3', null, 'Scenes'),
    s.scenes?.length ? h('ol', { class: 'ses-scenes' }, s.scenes.map((sc, i) => sceneRow(s, sc, i))) : h('p', { class: 'hint', style: { margin: 0 } }, 'No scenes yet. Add the ones you have in mind, or prep the session on the GM Screen and its scenes land here.'),
    h('div', { class: 'add-row' }, sceneIn, linkIn, h('button', { class: 'btn sm', type: 'button', id: 'ses-scene-add', onClick: addIt }, 'Add scene')),
    p ? h('div', { class: 'ses-plan' },
      h('b', null, '🧰 Session in a Box'),
      p.villain ? h('div', null, `Villain: ${p.villain.name} (PL ${p.villain.pl})${p.villain.why ? `. ${p.villain.why}` : ''}`) : null,
      p.minions ? h('div', null, `Minions: ${p.minions.count} × ${p.minions.name}`) : null,
      p.rumor ? h('div', null, `📰 Rumor: ${p.rumor}`) : null) : null,
    !p && gmPlan && s.status !== 'played' ? h('button', { class: 'btn sm', type: 'button', id: 'ses-attach', onClick: () => { attachPlan(W.saved, s.id, gmPlan); commit(); toast('The GM Screen\'s plan is kept with this session'); } }, '🧰 Keep the GM Screen\'s plan with this session') : null,
    h('h3', null, 'Notes'), notes,
    s.recap ? h('div', { class: 'ses-recap' }, h('b', null, `🎬 ${s.recap.headline}`), (s.recap.lines || []).map((l) => h('div', null, l))) : null,
    h('div', { class: 'btn-row' },
      s.status !== 'played' ? h('button', { class: 'btn primary', type: 'button', id: 'ses-start', title: 'Starts the session on the GM Screen and sends "Previously on…" to the table', onClick: () => startHere(s) }, '▶ Start this session') : null,
      s.status !== 'played' ? h('button', { class: 'btn', type: 'button', onClick: () => { markPlayed(W.saved, s.number); commit(); } }, 'Mark played') : h('button', { class: 'btn', type: 'button', onClick: () => { updateSession(W.saved, s.id, { status: 'planned' }); commit(); } }, 'Mark not played'),
      h('button', { class: 'btn', type: 'button', disabled: !s.date, onClick: () => downloadIcs(s) }, '📅 Calendar file'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { const ok = await openDialog({ title: `Delete session ${s.number}?`, body: h('p', { style: { margin: 0 } }, 'Its scenes, notes and plan go. The World\'s timeline keeps what happened.'), buttons: [{ label: 'Keep', value: false }, { label: 'Delete', value: true, danger: true }] }); if (ok) { removeSession(W.saved, s.id); W.ui.sessionId = null; commit(); } } }, 'Delete')));
}

function startHere(s) {
  const prev = previouslyOn(W.saved, W.world, { campaign: campaign(), before: s.number });
  W.hooks.startSession?.({ number: s.number, previously: prev?.text || '' });
}

// ---- threads and "previously on" ---------------------------------------------------------------------------------

function threadsPanel() {
  const textIn = h('input', { type: 'text', id: 'thr-text', placeholder: 'A loose end: "Who sent the letter?"', 'aria-label': 'New plot thread' });
  const linkIn = h('input', { type: 'text', list: 'ses-names', placeholder: 'Who or what (optional)', 'aria-label': 'Thread pages' });
  const add = () => {
    const { ids } = linksFrom(linkIn.value);
    if (!addThread(W.saved, { text: textIn.value, links: ids, opened: lastSession(W.world) || null })) { toast('Write the thread first'); return; }
    commit();
  };
  textIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const open = openThreads(W.saved);
  const closed = (W.saved.threads || []).filter((t) => t.closed != null);
  const row = (t) => h('li', { class: `ses-thread ${t.closed != null ? 'closed' : ''}` },
    h('div', null, h('span', null, t.text), t.opened ? h('small', { class: 'hint' }, ` · since S${t.opened}`) : null, t.links?.length ? h('div', { class: 'wd-chips' }, chipsFor(t.links)) : null),
    h('span', { class: 'ses-scene-tools' },
      t.closed == null
        ? h('button', { class: 'btn sm ghost', type: 'button', title: 'Resolved', onClick: () => { closeThread(W.saved, t.id, lastSession(W.world) || true); commit(); } }, '✓ Tied up')
        : h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { reopenThread(W.saved, t.id); commit(); } }, 'Reopen'),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Delete thread', onClick: () => { removeThread(W.saved, t.id); commit(); } }, '✕')));
  return h('section', { class: 'panel ses-threads' },
    h('h2', null, '🧵 Plot threads'),
    open.length ? h('ul', { class: 'ses-thread-list' }, open.map(row)) : h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing left hanging. Note the loose ends here so the next session can pick them up.'),
    h('div', { class: 'add-row' }, textIn, linkIn, h('button', { class: 'btn sm', type: 'button', id: 'thr-add', onClick: add }, 'Add')),
    closed.length ? h('details', null, h('summary', null, `Tied up (${closed.length})`), h('ul', { class: 'ses-thread-list' }, closed.map(row))) : null);
}

function previouslyPanel() {
  const n = nextSession(W.saved)?.number ?? null;
  const p = previouslyOn(W.saved, W.world, { campaign: campaign(), before: n });
  return h('section', { class: 'panel ses-prev' },
    h('h2', null, '📺 Previously on…'),
    p ? [h('p', { class: 'ses-prev-title' }, p.title), h('ul', null, p.lines.map((l) => h('li', null, l))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn sm', type: 'button', id: 'ses-prev-send', onClick: () => { W.hooks.postToTable?.(p.text); toast('Sent to the table'); } }, 'Send to the table'),
        h('button', { class: 'btn sm ghost', type: 'button', onClick: async () => toast((await copyText(p.text)) ? 'Copied' : 'Copy failed') }, 'Copy'))]
      : h('p', { class: 'hint', style: { margin: 0 } }, 'Once a session is played (End session on the GM Screen marks it), its recap, what changed in the World and the open threads make the "previously on" for the next one.'));
}

// ---- the page ----------------------------------------------------------------------------------------------------

export function sessionsPage() {
  const list = sessionsOf(W.saved);
  const sel = W.ui.sessionId ? getSession(W.saved, W.ui.sessionId) : null;
  const card = (s) => h('button', { type: 'button', class: `ses-card ${s.status} ${sel?.id === s.id ? 'active' : ''}`, onClick: () => { W.ui.sessionId = s.id; commit(); } },
    h('b', { class: 'num' }, `S${s.number}`),
    h('span', { class: 'ses-card-title' }, s.title || (s.status === 'played' ? 'Played' : 'Planned')),
    h('small', null, s.date ? whenLabel(s.date) : 'no date'),
    h('small', { class: 'hint' }, `${(s.scenes || []).length} scene${(s.scenes || []).length === 1 ? '' : 's'}${s.status === 'played' ? ' · played' : ''}`));
  const upcoming = list.filter((s) => s.status !== 'played');
  const played = list.filter((s) => s.status === 'played').reverse();
  return h('div', { class: 'wd-page' },
    namesList(),
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Campaign'), h('h1', null, 'Sessions'), h('p', { class: 'wd-tagline' }, 'Plan game night: the date (with a calendar file for your players), the scenes linked to the World, your notes and the Session in a Box plan. Keep the plot threads in view, and open each session with "Previously on…".'))),
    h('div', { class: 'ses-layout' },
      h('div', { class: 'ses-main' },
        nextPanel(),
        sel ? sessionEditor(sel) : null,
        upcoming.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Coming up'), h('div', { class: 'ses-cards' }, upcoming.map(card))) : null,
        played.length ? h('section', { class: 'wd-block' }, h('h2', null, 'Played'), h('div', { class: 'ses-cards' }, played.map(card))) : null),
      h('div', { class: 'ses-side' }, previouslyPanel(), threadsPanel())));
}

// ---- for the GM Screen ------------------------------------------------------------------------------------------

/** Plan the next session and open it in the planner (from the jump-anywhere search). */
export function planNextSession() {
  W.rebuild();
  const n = addSession(W.saved, { after: lastSession(W.world) });
  W.ui.sessionId = n.id;
  W.save();
  return n;
}

/** The number the next session should have: the planned one, if the planner has it. */
export function plannedNumber() { return W.saved ? nextSession(W.saved)?.number ?? null : null; }

/** "Previously on…" for a session about to start. */
export function previouslyText(number) {
  if (!W.saved) return '';
  W.rebuild();
  return previouslyOn(W.saved, W.world, { campaign: campaign(), before: number })?.text || '';
}

/** Session in a Box made a plan: keep it with the next planned session (making one if there's none). */
export function keepPlan(plan) {
  if (!W.saved) return null;
  W.rebuild();
  let s = nextSession(W.saved);
  if (!s) s = addSession(W.saved, { after: lastSession(W.world) });
  attachPlan(W.saved, s.id, plan);
  W.save();
  return s.number;
}

/** The GM ended a session: the planner marks it played and keeps the recap. */
export function sessionPlayed(number, recap) {
  if (!W.saved) return;
  markPlayed(W.saved, number, recap);
  W.save();
}
