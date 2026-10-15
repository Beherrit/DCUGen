// World: one page (a person, faction, place, event or thing): its infobox, ties, timeline and edit form.

import { h, clear, toast, copyText, openDialog, inkFor, menu } from './dom.js';
import { ENTITY_TYPES, RELATIONS, RELATION_GROUPS, groupedConnections, entityTimeline, createEntity, updateEntity, deleteEntity, addLink, removeLink, layoutGraph, vaultMarkdown } from '../engine/world.js';
import { sheet as makeSheet } from '../engine/render.js';
import { fromKeySync } from '../engine/keys.js';
import { portraitImg } from './portrait.js';
import { startHandout } from './handouts.js';
import { pinToBoard } from './board.js';
import { draftHandout } from '../engine/handouts.js';
import { W, svg, typeMeta, whenText, statusBadge, pageLink, initialsOf, findByName } from './world-common.js';
import { momentDialog, editMomentDialog, undoMoment } from './world-moments.js';

// ---- entity page ------------------------------------------------------------------------------------------------------------

function infobox(e) {
  const rows = Object.entries(e.fields || {}).filter(([, v]) => v != null && v !== '');
  const ch = e.character;
  let s = null;
  try { s = ch ? makeSheet(ch, W.R) : null; } catch { s = null; }
  return h('aside', { class: 'wd-infobox', style: { '--c': e.color || typeMeta(e.type).color } },
    h('div', { class: 'wd-infobox-head' }, h('span', { class: 'wd-glyph' }, typeMeta(e.type).glyph), typeMeta(e.type).one, statusBadge(e)),
    s ? h('div', { class: 'card-stats', style: { gridTemplateColumns: 'repeat(5, 1fr)', margin: '8px 0' } }, [['DOD', s.d.defenses.Dodge], ['PAR', s.d.defenses.Parry], ['TOU', s.d.defenses.Toughness], ['FOR', s.d.defenses.Fortitude], ['WIL', s.d.defenses.Will]].map(([k, v]) => h('div', null, h('b', { class: 'num' }, v), h('span', null, k)))) : null,
    rows.length ? h('dl', { class: 'wd-fields' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, String(v))])) : null,
    e.source === 'bio' && e.knownBy?.length ? h('div', { class: 'wd-known' }, h('div', { class: 'label' }, 'Known through'), e.knownBy.map((k) => h('div', { class: 'wd-known-row' }, h('button', { type: 'button', class: 'wd-link', onClick: () => W.go(k.id) }, k.name), h('small', null, ` · their ${(k.relation || k.role || 'contact').toLowerCase()}`)))) : null,
    e.tags?.length ? h('div', { class: 'wd-tags' }, e.tags.map((t) => h('span', { class: 'wd-tag' }, `#${t}`))) : null,
    h('div', { class: 'wd-source' }, e.source === 'roster' ? 'From your roster: edits on the Forge show here.' : e.source === 'open' ? 'Open on the Forge but not saved to the roster yet.' : e.source === 'bio' ? 'Named in someone\'s life story or journal.' : e.source === 'journal' ? 'A session from a campaign journal.' : e.source === 'auto' ? 'Built from the roster.' : 'Written by hand.'));
}

function egoGraph(e) {
  const nodes = [e, ...e.connections.map((c) => c.other)];
  const seen = new Set(nodes.map((n) => n.id));
  const edges = e.connections.map((c) => ({ from: e.id, to: c.other.id, rel: c.rel }));
  for (const n of e.connections.map((c) => c.other)) for (const c of n.connections || []) if (seen.has(c.other.id) && c.other.id !== e.id && !edges.some((x) => (x.from === n.id && x.to === c.other.id) || (x.from === c.other.id && x.to === n.id))) edges.push({ from: n.id, to: c.other.id, rel: c.rel, faint: true });
  if (nodes.length < 2) return null;
  const GW = 520; const GH = Math.max(260, Math.min(460, 120 + nodes.length * 18));
  const pos = layoutGraph(nodes.map((n) => ({ id: n.id })), edges, { width: GW, height: GH, iterations: 160, seed: nodes.length, center: e.id, margin: 70 });
  return h('div', { class: 'wd-graph-wrap' },
    svg('svg', { viewBox: `0 0 ${GW} ${GH}`, class: 'wd-graph', role: 'img', 'aria-label': `${e.name} and their connections` },
      edges.map((ed) => { const a = pos.get(ed.from); const b = pos.get(ed.to); return svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: RELATIONS[ed.rel]?.color || '#999', 'stroke-width': ed.faint ? 1 : 2, 'stroke-opacity': ed.faint ? 0.35 : 0.8 }); }),
      nodes.map((n) => { const p = pos.get(n.id); const me = n.id === e.id; const color = n.color || typeMeta(n.type).color; return svg('g', { class: 'wd-node', transform: `translate(${p.x},${p.y})`, onClick: () => (me ? null : W.go(n.id)), style: me ? '' : 'cursor:pointer' },
        svg('title', null, `${n.name}${n.status ? ` (${n.status})` : ''}`),
        svg('circle', { r: me ? 20 : 13, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, 'stroke-dasharray': n.status === 'Dead' ? '3 2' : null }),
        svg('text', { 'text-anchor': 'middle', dy: me ? 5 : 4, fill: inkFor(color), 'font-size': me ? 12 : 9, 'font-weight': 700 }, n.type === 'person' ? initialsOf(n.name) : typeMeta(n.type).glyph),
        svg('text', { 'text-anchor': 'middle', dy: me ? 34 : 26, fill: 'var(--ink)', 'font-size': 11, 'font-weight': me ? 800 : 600 }, n.name.length > 20 ? `${n.name.slice(0, 19)}…` : n.name)); })),
    h('div', { class: 'wd-legend' }, [...new Set(edges.map((x) => RELATIONS[x.rel]?.group).filter(Boolean))].map((g) => h('span', null, h('i', { style: { background: RELATIONS[Object.keys(RELATIONS).find((k) => RELATIONS[k].group === g)]?.color } }), g))));
}

function timelineRow(t, e) {
  const other = t.other ? W.world.entities.get(t.other) : null;
  return h('li', { class: `wd-tl-row ${t.kind}` },
    h('span', { class: 'wd-tl-when num' }, t.when || '·'),
    h('div', { class: 'wd-tl-body' },
      h('span', { class: 'bio-stage' }, [t.stage, t.date].filter(Boolean).join(' · ')),
      h('span', null, t.text),
      t.people?.length ? h('div', { class: 'wd-chips', style: { marginTop: '4px' } }, t.people.map((p) => { const pe = findByName(p.name, 'person'); return pe ? pageLink(pe, { chip: true, note: p.relation || null }) : h('span', { class: 'wd-chip' }, p.name); })) : null,
      t.points?.length ? h('ul', { class: 'wd-points' }, t.points.map((x) => h('li', null, h('b', null, x.type === 'award' ? `+${x.points} pp` : `${x.points > 0 ? `−${x.points}` : `+${-x.points}`} pp`), ' ', x.type === 'award' ? 'earned' : (x.changes || []).join('; ') || x.note))) : null,
      t.downtime ? h('div', { class: 'wd-downtime' }, h('b', null, 'Between adventures: '), t.downtime) : null,
      h('div', { class: 'wd-tl-tools' },
        t.by ? h('button', { type: 'button', class: 'linkish', onClick: () => W.go(t.by) }, 'open their page') : null,
        other ? h('button', { type: 'button', class: 'linkish', onClick: () => W.go(other.id) }, other.name) : null,
        t.eventId && W.world.entities.has(t.eventId) ? h('button', { type: 'button', class: 'linkish', onClick: () => W.go(t.eventId) }, 'event page') : null,
        t.momentId ? h('button', { type: 'button', class: 'linkish', onClick: () => editMomentDialog(t.momentId) }, 'edit') : null,
        t.momentId ? h('button', { type: 'button', class: 'linkish danger', onClick: () => undoMoment(t.momentId) }, 'undo') : null)));
}

// Quick ways to add a tie, by page type: [label, rel, type of a new page made from a typed name]
const QUICK_LINKS = {
  person: [['+ Friend', 'friend', 'person'], ['+ Ally', 'ally', 'person'], ['+ Enemy', 'enemy', 'person'], ['+ Rival', 'rival', 'person'], ['+ Love', 'love', 'person'], ['+ Family', 'family', 'person'], ['+ Mentor', 'mentor', 'person'], ['+ Faction', 'member', 'faction'], ['+ Lives in', 'livesIn', 'location'], ['+ Base', 'basedIn', 'location'], ['+ Owns', 'owns', 'item']],
  faction: [['+ Member', 'hasMember', 'person'], ['+ Leader', 'ledBy', 'person'], ['+ Founder', 'foundedBy', 'person'], ['+ Allied faction', 'allied', 'faction'], ['+ At war with', 'atWar', 'faction'], ['+ Enemy', 'enemy', 'person'], ['+ Headquarters', 'basedIn', 'location'], ['+ Owns', 'owns', 'item']],
  location: [['+ Lives here', 'homeOf', 'person'], ['+ Based here', 'baseOf', 'faction'], ['+ Works here', 'workplaceOf', 'person'], ['+ Inside', 'contains', 'location'], ['+ Part of', 'locatedIn', 'location'], ['+ Scene of', 'sceneOf', 'event'], ['+ Owner', 'ownedBy', 'person']],
  item: [['+ Owner', 'ownedBy', 'person'], ['+ Maker', 'createdBy', 'person'], ['+ Kept at', 'locatedIn', 'location'], ['+ Tied to', 'related', 'person']],
  event: [['+ Involved', 'involves', 'person'], ['+ Faction involved', 'involves', 'faction'], ['+ Where', 'happenedAt', 'location'], ['+ Item involved', 'involves', 'item']],
};

function addLinkForm(e) {
  const all = [...W.world.entities.values()].filter((x) => x.id !== e.id).sort((a, b) => a.name.localeCompare(b.name));
  const preset = W.ui.linkPreset || {};
  const target = h('input', { type: 'text', id: 'wd-link-target', list: 'wd-all', placeholder: 'Who or what (type to search, or a new name)', 'aria-label': 'Link to' });
  const rel = h('select', { 'aria-label': 'Relationship' }, RELATION_GROUPS.map((g) => h('optgroup', { label: g }, Object.entries(RELATIONS).filter(([, r]) => r.group === g).map(([k, r]) => h('option', { value: k, selected: k === preset.rel }, r.label)))));
  const newType = h('select', { 'aria-label': 'If new, make a', title: 'What kind of page a new name becomes' }, Object.entries(ENTITY_TYPES).map(([t, m]) => h('option', { value: t, selected: t === (preset.newType || 'person') }, `new ${m.one.toLowerCase()}`)));
  const since = h('input', { type: 'number', min: 0, placeholder: 'Since S#', title: 'Since which session (optional)', 'aria-label': 'Since session', style: { maxWidth: '92px' } });
  const note = h('input', { type: 'text', placeholder: 'Note (optional): why, how, since when', 'aria-label': 'Note' });
  const submit = () => {
    const name = target.value.trim();
    let other = all.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!other && name) { other = createEntity(W.saved, { type: newType.value, name }); toast(`Made a ${typeMeta(newType.value).one.toLowerCase()} page for ${name}`); }
    if (!other) { target.setCustomValidity('Pick someone, or type a new name'); target.reportValidity(); return; }
    addLink(W.saved, { from: e.id, to: other.id, rel: rel.value, note: note.value.trim(), since: since.value ? { session: Number(since.value) } : null });
    W.ui.linkPreset = null; W.ui.addTie = true;
    W.save(); W.renderWorld();
    toast(`${other.name}: ${RELATIONS[rel.value].label.toLowerCase()} of ${e.name}`);
  };
  target.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
  const quick = (QUICK_LINKS[e.type] || []).map(([label, r, t]) => h('button', { type: 'button', class: `wd-quicklink ${preset.rel === r ? 'active' : ''}`, style: { '--rc': RELATIONS[r]?.color }, onClick: () => { W.ui.linkPreset = { rel: r, newType: t }; W.renderWorld(); setTimeout(() => W.root.querySelector('#wd-link-target')?.focus(), 0); } }, label));
  const el = h('details', { class: 'wd-addlink', open: W.ui.addTie || !!W.ui.linkPreset },
    h('summary', null, '＋ Add a tie'),
    h('datalist', { id: 'wd-all' }, all.map((x) => h('option', { value: x.name }, typeMeta(x.type).one))),
    h('div', { class: 'wd-quicklinks' }, quick),
    h('div', { class: 'add-row' }, target, rel, newType, since, h('button', { class: 'btn primary', type: 'button', onClick: submit }, 'Link')),
    h('div', { class: 'add-row' }, note),
    h('p', { class: 'hint', style: { margin: '4px 0 0' } }, `Reads as "<name> is ${e.name}'s <relationship>". The other page gets the inverse. Prefer "⚡ What happened" when the tie starts in play: it also ends what it replaces and lands on the timeline.`));
  el.addEventListener('toggle', () => { W.ui.addTie = el.open; });
  return el;
}

function membersTable(e) {
  const ROLE_OF = { ledBy: 'Leader', foundedBy: 'Founder', hasMember: 'Member', formerHasMember: 'Former member', employee: 'Employee', informant: 'Informant', ally: 'Ally', contact: 'Contact', enemy: 'Enemy', captive: 'Captive' };
  const RANK = { Founder: 0, Leader: 1, Member: 2, Employee: 3, Informant: 4, Ally: 5, Contact: 6, Captive: 7, Enemy: 8, 'Former member': 9 };
  const people = new Map();
  for (const c of [...e.connections, ...e.past]) {
    if (c.other.type !== 'person' || !ROLE_OF[c.rel]) continue;
    const cur = people.get(c.other.id) || { e: c.other, roles: [], since: null, until: null, note: '' };
    if (c.ended) { if (c.rel === 'hasMember' || c.rel === 'ledBy') { cur.until = c.until; if (!cur.roles.length) cur.roles.push('Former member'); } }
    else { cur.roles.push(ROLE_OF[c.rel]); if (c.since) cur.since = c.since; if (c.note) cur.note = c.note; }
    people.set(c.other.id, cur);
  }
  const rows = [...people.values()].map((p) => ({ ...p, roles: [...new Set(p.roles)].sort((a, b) => RANK[a] - RANK[b]) })).sort((a, b) => RANK[a.roles[0]] - RANK[b.roles[0]] || a.e.name.localeCompare(b.e.name));
  if (!rows.length) return null;
  return h('section', { class: 'sec' },
    h('h3', null, 'Members and people', h('span', { class: 'pts' }, `${rows.filter((r) => RANK[r.roles[0]] <= 2).length} in`)),
    h('table', { class: 'wd-members' }, h('thead', null, h('tr', null, h('th', null, 'Role'), h('th', null, 'Who'), h('th', null, 'Since'), h('th', null, 'Note'))),
      h('tbody', null, rows.map((r) => h('tr', { class: r.roles[0] === 'Former member' ? 'former' : '' }, h('td', null, r.roles.join(', ')), h('td', null, pageLink(r.e)), h('td', { class: 'num' }, r.until ? `until ${whenText(r.until)}` : whenText(r.since) || ''), h('td', { class: 'wd-note-cell' }, r.note))))));
}

function hereList(e) {
  const GROUPS = [['Lives here', 'homeOf'], ['Based here', 'baseOf'], ['Works here', 'workplaceOf'], ['Inside', 'contains'], ['Part of', 'locatedIn'], ['Happened here', 'sceneOf'], ['Owned by', 'ownedBy']];
  const blocks = GROUPS.map(([label, rel]) => { const items = e.connections.filter((c) => c.rel === rel); return items.length ? h('div', { class: 'wd-here' }, h('div', { class: 'label' }, label), h('div', { class: 'wd-chips' }, items.map((c) => pageLink(c.other, { chip: true, rel: c.rel, note: c.note || null })))) : null; }).filter(Boolean);
  return blocks.length ? h('section', { class: 'sec' }, h('h3', null, 'Who and what is here'), blocks) : null;
}

function glance(e) {
  const chip = (label, items, rel) => (items.length ? h('div', { class: 'wd-glance-row' }, h('span', { class: 'wd-glance-label' }, label), h('div', { class: 'wd-chips' }, items.map((c) => pageLink(c.other, { chip: true, rel: rel || c.rel, note: c.note && c.note.length < 40 ? c.note : null })))) : null);
  const by = (rels) => e.connections.filter((c) => rels.includes(c.rel));
  const rows = e.type === 'person' ? [
    chip('Factions', by(['member', 'leader', 'founder'])),
    chip('Home & base', by(['livesIn', 'basedIn', 'from', 'worksAt'])),
    chip('Closest', by(['love', 'spouse', 'partner', 'friend', 'teammate', 'ally']).slice(0, 8)),
    chip('Against', by(['enemy', 'nemesis', 'rival', 'betrayed', 'betrayedBy', 'atWar']).slice(0, 8)),
  ] : e.type === 'faction' ? [
    chip('Led by', by(['ledBy', 'foundedBy'])), chip('Headquarters', by(['basedIn'])), chip('Allies', by(['allied', 'ally'])), chip('Enemies', by(['atWar', 'enemy', 'nemesis'])),
  ] : e.type === 'location' ? [chip('Part of', by(['locatedIn'])), chip('Controlled by', by(['ownedBy', 'baseOf']))]
    : e.type === 'item' ? [chip('Owner', by(['ownedBy'])), chip('Made by', by(['createdBy'])), chip('Kept at', by(['locatedIn']))]
      : [chip('Where', by(['happenedAt'])), chip('Involved', by(['involves']))];
  const live = rows.filter(Boolean);
  return live.length ? h('div', { class: 'wd-glance' }, live) : null;
}

export function entityPage(e) {
  const meta = typeMeta(e.type);
  const color = e.color || meta.color;
  const ch = e.character;
  const groups = groupedConnections(e);
  const past = groupedConnections(e, { past: true });
  const tl = entityTimeline(W.world, e);
  const canOpenAsCharacter = !ch && e.source === 'bio' && Object.values(e.keys || {}).some(Boolean);
  const openAsCharacter = () => {
    const key = Object.values(e.keys || {}).find(Boolean);
    try { const person = fromKeySync(W.R, key).character; W.hooks.open?.(person); toast(`Opened ${person.identity?.realName || e.name}. Save to roster to give them a full page.`); } catch (err) { toast(`Couldn't build ${e.name}: ${err.message}`); }
  };
  const removePage = async () => {
    const ok = await openDialog({ title: `Remove ${e.name}?`, body: h('p', { style: { margin: 0 } }, e.source === 'manual' ? 'This page and its links are deleted from the vault.' : 'This page is hidden from the world. The character or bio it came from is not touched.'), buttons: [{ label: 'Keep', value: false }, { label: 'Remove', value: true, danger: true }] });
    if (ok) { deleteEntity(W.saved, e.id); W.save(); W.go('home'); }
  };
  const copyMd = async () => toast((await copyText(vaultMarkdown(W.world)[Object.keys(vaultMarkdown(W.world)).find((k) => k.endsWith(`/${e.name.replace(/[\\/:*?"<>|#^[\]]/g, '')}.md`)) || ''] || '')) ? 'Page copied as Markdown' : 'Copy failed');
  // The few things you do on a page are buttons; the rest is one menu.
  const actions = h('div', { class: 'toolbar wd-actions' },
    W.ui.history.length ? h('button', { class: 'btn ghost', type: 'button', title: 'Back to the previous page', onClick: W.back }, '← Back') : null,
    h('button', { class: 'btn primary', type: 'button', title: 'Record something that happened to them', onClick: () => momentDialog({ a: e.id }) }, '⚡ What happened'),
    h('button', { class: 'btn', type: 'button', title: 'Add a friend, enemy, faction, home…', onClick: () => { W.ui.addTie = true; W.renderWorld(); setTimeout(() => { const f = W.root.querySelector('#wd-link-target'); f?.scrollIntoView({ block: 'center' }); f?.focus(); }, 0); } }, '＋ Tie'),
    h('button', { class: 'btn', type: 'button', 'aria-pressed': String(W.ui.edit), onClick: () => { W.ui.edit = !W.ui.edit; W.renderWorld(); } }, W.ui.edit ? '✓ Done editing' : '✎ Edit'),
    ch ? h('button', { class: 'btn', type: 'button', onClick: () => W.hooks.open?.(ch) }, 'Open on the Forge') : null,
    canOpenAsCharacter ? h('button', { class: 'btn', type: 'button', title: 'Rebuild this person as a full character from their key', onClick: openAsCharacter }, 'Open as a character') : null,
    h('span', { class: 'spacer' }),
    menu('More', [
      ch ? { label: '⚔ Battle Room', hint: 'Throw them into a fight', run: () => W.hooks.throwIn?.(ch) } : null,
      e.type === 'person' ? { label: '📜 Wanted poster', hint: 'Drafted from their ties and what happened', run: () => startHandout(W.ctx(), draftHandout(W.world, 'wanted', { a: e })) } : null,
      e.type === 'person' ? { label: '🗂 Case file', hint: 'An agency case file, drafted from this page', run: () => startHandout(W.ctx(), draftHandout(W.world, 'casefile', { a: e })) } : null,
      { label: '📌 Pin to the evidence board', run: () => { pinToBoard(W.saved, e.id); W.save(); W.go('board'); } },
      { label: 'Copy as Markdown', hint: 'For notes, Obsidian or a chat', run: copyMd },
      { label: e.source === 'manual' ? 'Delete this page' : 'Hide this page', hint: e.source === 'manual' ? 'Removes it and its ties' : 'The character or bio it came from is not touched', danger: true, run: removePage },
    ], { cls: 'btn' }));

  const por = ch ? portraitImg(ch) : null;
  const head = h('header', { class: `wd-head ${e.status === 'Dead' || e.status === 'Destroyed' ? 'gone' : ''}`, style: { '--c': color, '--c-ink': inkFor(color) } },
    por ? h('div', { class: 'wd-head-glyph has-img' }, por, h('span', null, initialsOf(e.name))) : h('div', { class: 'wd-head-glyph' }, e.type === 'person' ? initialsOf(e.name) : meta.glyph),
    h('div', { class: 'wd-head-text' },
      h('div', { class: 'eyebrow' }, `${meta.one}${ch ? ` · PL ${ch.pl} ${ch.archetype?.name || ''}` : ''}${e.fields?.Side ? ` · ${e.fields.Side}` : ''}${e.fields?.Kind && e.type !== 'person' ? ` · ${e.fields.Kind}` : ''}`),
      h('h1', null, e.name, ' ', statusBadge(e, { big: true })),
      e.aliases?.length ? h('div', { class: 'wd-aliases' }, `Also: ${e.aliases.join(', ')}`) : null),
    h('div', { class: 'wd-head-stats' }, h('b', { class: 'num' }, e.degree), h('span', null, 'ties')));

  const connRow = (c) => h('li', { style: { '--rc': RELATIONS[c.rel]?.color || '#888' }, class: c.ended ? 'ended' : '' },
    h('span', { class: 'wd-rel' }, c.label),
    pageLink(c.other),
    c.since || c.until ? h('span', { class: 'wd-when num', title: c.until ? 'Ended' : 'Since' }, c.until ? `until ${whenText(c.until)}` : `since ${whenText(c.since)}`) : null,
    c.note ? h('span', { class: 'wd-note' }, c.note) : null,
    (c.source === 'manual' || W.ui.edit) && !c.ended ? h('button', { class: 'x', type: 'button', 'aria-label': 'Remove link', title: c.source === 'manual' ? 'Delete this link' : 'Hide this automatic link', onClick: () => { removeLink(W.saved, W.world, c.id); W.save(); W.renderWorld(); } }, '✕') : null);
  const connections = h('section', { class: 'sec' },
    h('h3', null, 'Ties', h('span', { class: 'pts' }, `${e.connections.length}${e.past.length ? ` · ${e.past.length} past` : ''}`)),
    groups.length ? groups.map((g) => h('div', { class: 'wd-group' },
      h('div', { class: 'wd-group-name', style: { '--rc': RELATIONS[g.items[0].rel]?.color } }, g.group),
      h('ul', { class: 'wd-conns' }, g.items.map(connRow)))) : h('p', { class: 'hint', style: { margin: 0 } }, 'No ties yet. Add one, or record what happened.'),
    past.length ? h('details', { class: 'wd-past' }, h('summary', null, `Formerly (${e.past.length})`), past.map((g) => h('div', { class: 'wd-group' }, h('div', { class: 'wd-group-name', style: { '--rc': RELATIONS[g.items[0].rel]?.color } }, g.group), h('ul', { class: 'wd-conns' }, g.items.map(connRow))))) : null,
    addLinkForm(e));

  const timeline = tl.length ? h('section', { class: 'sec' }, h('h3', null, 'Timeline', h('span', { class: 'pts' }, ch ? 'life, then play' : 'as others tell it')), h('ol', { class: 'wd-tl-list' }, tl.map((t) => timelineRow(t, e)))) : null;
  const notes = (e.body || W.ui.edit) ? h('section', { class: 'sec' }, h('h3', null, 'Notes'), W.ui.edit ? null : h('div', { class: 'wd-body' }, ...String(e.body).split(/\n{2,}/).map((p) => h('p', null, p)))) : null;
  const summary = h('section', { class: 'sec' }, h('h3', null, e.type === 'event' ? 'What happened' : 'Summary'), e.summary ? h('p', { class: 'wd-summary' }, e.summary) : h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing written yet. ', h('button', { type: 'button', class: 'linkish', onClick: () => { W.ui.edit = true; W.renderWorld(); } }, 'Write something')));
  const journalEvent = e.type === 'event' && e.journal ? h('section', { class: 'sec' }, h('h3', null, 'From the journal'),
    h('dl', { class: 'bio-dl' }, e.journal.people?.length ? [h('dt', null, 'People'), h('dd', null, h('div', { class: 'wd-chips' }, e.journal.people.map((p) => { const pe = findByName(p.name, 'person'); return pe ? pageLink(pe, { chip: true, note: [p.relation, p.status].filter(Boolean).join(' · ') || null }) : h('span', { class: 'wd-chip' }, p.name); })))] : null,
      e.fields?.Points ? [h('dt', null, 'Points'), h('dd', null, e.fields.Points)] : null,
      e.journal.downtime ? [h('dt', null, 'Between adventures'), h('dd', null, e.journal.downtime)] : null)) : null;

  const editor = W.ui.edit ? editForm(e) : null;
  return h('div', { class: 'wd-page' }, head, actions, glance(e),
    h('div', { class: 'wd-body-grid' },
      h('div', { class: 'wd-main' }, editor, summary, journalEvent, e.type === 'faction' ? membersTable(e) : null, e.type === 'location' ? hereList(e) : null, connections, timeline, notes),
      h('div', { class: 'wd-aside' }, egoGraph(e), infobox(e))));
}

function editForm(e) {
  const manual = e.source === 'manual';
  const name = h('input', { type: 'text', value: e.name, disabled: !manual, 'aria-label': 'Name' });
  const type = h('select', { 'aria-label': 'Type' }, Object.entries(ENTITY_TYPES).filter(([t]) => !['paper', 'handout'].includes(t)).map(([t, m]) => h('option', { value: t, selected: t === e.type }, m.one)));
  const summary = h('textarea', { style: { minHeight: '70px' }, 'aria-label': 'Summary' }, e.summary || '');
  const body = h('textarea', { style: { minHeight: '140px' }, 'aria-label': 'Notes', placeholder: 'Longer notes. Blank lines make paragraphs.' }, e.body || '');
  const tags = h('input', { type: 'text', value: (e.tags || []).join(', '), placeholder: 'tags, comma separated', 'aria-label': 'Tags' });
  const aliases = h('input', { type: 'text', value: (e.aliases || []).join(', '), placeholder: 'other names, comma separated', 'aria-label': 'Aliases' });
  const color = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : typeMeta(e.type).color, 'aria-label': 'Colour', style: { width: '48px', padding: '2px' } });
  const fieldRows = h('div', { class: 'wd-field-rows' });
  const fields = Object.entries(e.fields || {}).map(([k, v]) => ({ k, v: v == null ? '' : String(v) }));
  const presets = { faction: ['Kind', 'Motto', 'Leader', 'Headquarters', 'Goals', 'Size', 'Reputation', 'Status', 'Founded', 'Resources', 'Methods'], location: ['Kind', 'Region', 'Population', 'Notable for', 'Danger', 'Status', 'Ruled by', 'Atmosphere'], item: ['Owner', 'Powers', 'Origin', 'Value', 'Status', 'Last seen'], event: ['Date', 'Session', 'Kind', 'Outcome', 'Casualties'], person: ['Occupation', 'Age', 'Status', 'Base', 'Species', 'Goal', 'Secret', 'Voice'] };
  const drawFields = () => {
    clear(fieldRows);
    fields.forEach((f, i) => fieldRows.append(h('div', { class: 'wd-field-row' },
      h('input', { type: 'text', value: f.k, placeholder: 'Field', list: 'wd-field-presets', onInput: (ev) => { f.k = ev.target.value; } }),
      h('input', { type: 'text', value: f.v, placeholder: 'Value', onInput: (ev) => { f.v = ev.target.value; } }),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Remove field', onClick: () => { fields.splice(i, 1); drawFields(); } }, '✕'))));
    fieldRows.append(h('datalist', { id: 'wd-field-presets' }, (presets[type.value] || []).map((p) => h('option', { value: p }))));
    fieldRows.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => { fields.push({ k: '', v: '' }); drawFields(); } }, '+ Field'), (presets[type.value] || []).filter((p) => !fields.some((f) => f.k === p)).slice(0, 6).map((p) => h('button', { class: 'btn sm ghost', type: 'button', onClick: () => { fields.push({ k: p, v: '' }); drawFields(); } }, `+ ${p}`))));
  };
  drawFields();
  const saveIt = () => {
    const patch = { summary: summary.value.trim(), body: body.value.trim(), tags: tags.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean), aliases: aliases.value.split(',').map((x) => x.trim()).filter(Boolean), color: color.value, type: type.value, fields: Object.fromEntries(fields.filter((f) => f.k.trim()).map((f) => [f.k.trim(), f.v])) };
    if (manual) patch.name = name.value.trim() || e.name;
    updateEntity(W.saved, W.world, e.id, patch);
    W.save(); W.ui.edit = false; W.renderWorld(); toast('Page saved');
  };
  return h('section', { class: 'sec wd-edit' },
    h('h3', null, 'Edit this page'),
    h('div', { class: 'jr-row' }, h('label', { class: 'field', style: { flex: 2 } }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Type'), type), h('label', { class: 'field' }, h('span', null, 'Colour'), color)),
    h('label', { class: 'field' }, h('span', null, 'Summary'), summary),
    h('div', { class: 'label' }, 'Fields (the infobox)'), fieldRows,
    h('div', { class: 'jr-row' }, h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Tags'), tags), h('label', { class: 'field', style: { flex: 1 } }, h('span', null, 'Also known as'), aliases)),
    h('label', { class: 'field' }, h('span', null, 'Notes'), body),
    !manual ? h('p', { class: 'hint', style: { margin: 0 } }, 'This page comes from the roster or a bio, so the name follows the character. Everything else you write here is kept in the vault.') : null,
    h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost', type: 'button', onClick: () => { W.ui.edit = false; W.renderWorld(); } }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onClick: saveIt }, 'Save page')));
}

export async function newPageDialog(presetType = 'faction', presetName = '') {
  const type = h('select', { 'aria-label': 'Type' }, Object.entries(ENTITY_TYPES).filter(([t]) => !['paper', 'handout'].includes(t)).map(([t, m]) => h('option', { value: t, selected: t === presetType }, `${m.glyph} ${m.one}`)));
  const name = h('input', { type: 'text', placeholder: 'Name', 'aria-label': 'Name', value: presetName });
  const kind = h('input', { type: 'text', list: 'wd-kind-presets', placeholder: 'Kind (optional): team, gang, city, bar, artefact…', 'aria-label': 'Kind' });
  const summary = h('textarea', { placeholder: 'A line or two', style: { minHeight: '70px' } });
  const KINDS = { faction: ['Team', 'Agency', 'Gang', 'Corporation', 'Cult', 'Court', 'Family', 'Guild', 'Government', 'Military', 'Rebels', 'Secret society', 'Syndicate'], location: ['City', 'District', 'Base', 'Bar', 'Building', 'Country', 'Planet', 'Dimension', 'Prison', 'Ruin', 'Ship', 'Wilderness'], item: ['Artefact', 'Weapon', 'Vehicle', 'Armour', 'Device', 'Document', 'Relic', 'Treasure'], event: ['Battle', 'Heist', 'Wedding', 'Funeral', 'Trial', 'Disaster', 'Festival', 'Discovery', 'Betrayal'], person: ['Civilian', 'Hero', 'Villain', 'Official', 'Criminal', 'Scientist', 'Reporter', 'Cop', 'Soldier'] };
  const list = h('datalist', { id: 'wd-kind-presets' });
  const refill = () => { clear(list); for (const k of KINDS[type.value] || []) list.append(h('option', { value: k })); };
  refill(); type.addEventListener('change', refill);
  const ok = await openDialog({ title: 'New page', body: [h('label', { class: 'field' }, h('span', null, 'Type'), type), h('label', { class: 'field' }, h('span', null, 'Name'), name), h('label', { class: 'field' }, h('span', null, 'Kind'), kind, list), h('label', { class: 'field' }, h('span', null, 'Summary'), summary), h('p', { class: 'hint', style: { margin: 0 } }, 'Factions, organisations, cities, bases, artefacts, battles, weddings, funerals: anything the campaign needs a page for. Add ties from the page itself, or record what happened.')], buttons: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, primary: true }] });
  if (!ok || !name.value.trim()) return;
  const e = createEntity(W.saved, { type: type.value, name: name.value.trim(), summary: summary.value.trim(), fields: kind.value.trim() ? { Kind: kind.value.trim() } : {} });
  W.save(); W.go(e.id);
}

