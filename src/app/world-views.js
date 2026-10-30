// World: the campaign timeline, the relationship graph, and the vault (share, import, export).

import { h, toast, copyText, download, openDialog, inkFor } from './dom.js';
import { state, upsert } from './store.js';
import { emptyWorld, ENTITY_TYPES, RELATIONS, RELATION_GROUPS, campaignTimeline, mergeWorldSaved, layoutComponents, vaultMarkdown, slug, MOMENT_KINDS, linksAsOf, lastSession } from '../engine/world.js';
import { zip } from '../engine/xlsx.js';
import { isWorldKey, isPaperKey, isHandoutKey, keySize, worldLink } from './share.js';
import { W, svg, typeMeta, whenText, pageLink, initialsOf } from './world-common.js';
import { momentDialog, editMomentDialog, undoMoment } from './world-moments.js';
import { newPageDialog } from './world-page.js';

// ---- campaign timeline & graph & vault -------------------------------------------------------------------------------------

export function timelineItem(it) {
  if (it.kind === 'change') {
    const m = it.m;
    const A = W.world.entities.get(m.a); const B = m.b ? W.world.entities.get(m.b) : null;
    const k = MOMENT_KINDS[m.kind];
    return h('div', { class: 'wd-tl-ev change', style: { '--c': k?.group === 'Fate' ? '#8e1b1b' : k?.group === 'Factions' ? '#8a5cd6' : k?.group === 'Places' ? '#1a7f4b' : k?.group === 'Things' ? '#a8670b' : '#2f6fde' } },
      h('div', { class: 'wd-tl-ev-when' }, h('b', { class: 'num' }, m.session != null ? `S${m.session}` : '•'), h('span', null, m.date || '')),
      h('div', { class: 'wd-tl-ev-body' },
        h('div', { class: 'wd-tl-change' }, h('span', { class: 'wd-tl-kind' }, k?.group || 'Change'), h('span', { class: 'wd-tl-ev-text' }, m.text)),
        m.note ? h('p', null, m.note) : null,
        h('div', { class: 'wd-chips' }, A ? pageLink(A, { chip: true }) : null, B ? pageLink(B, { chip: true }) : null, h('button', { type: 'button', class: 'linkish', onClick: () => editMomentDialog(m.id) }, 'edit'), h('button', { type: 'button', class: 'linkish danger', onClick: () => undoMoment(m.id) }, 'undo'))));
  }
  const ev = it.ev;
  const people = ev.connections.filter((c) => c.other.type === 'person').map((c) => c.other);
  return h('div', { class: `wd-tl-ev ${it.kind}`, style: { '--c': ev.color || typeMeta(it.kind === 'paper' ? 'paper' : it.kind === 'handout' ? 'handout' : 'event').color } },
    h('div', { class: 'wd-tl-ev-when' }, h('b', { class: 'num' }, ev.session ? `S${ev.session}` : '•'), h('span', null, ev.date || ev.fields?.Date || '')),
    h('div', { class: 'wd-tl-ev-body' },
      h('div', { class: 'wd-tl-change' }, h('span', { class: 'wd-tl-kind' }, it.kind === 'session' ? 'Session' : it.kind === 'battle' ? 'Battle' : it.kind === 'paper' ? 'Front page' : it.kind === 'handout' ? (ev.fields?.Kind || 'Handout') : ev.fields?.Kind || 'Event'), h('button', { type: 'button', class: 'wd-tl-ev-title', onClick: () => W.go(ev.id) }, ev.name)),
      ev.summary ? h('p', null, ev.summary) : null,
      people.length ? h('div', { class: 'wd-chips' }, people.map((p) => pageLink(p, { chip: true }))) : null,
      ev.fields?.Points ? h('div', { class: 'wd-points-line' }, ev.fields.Points) : null));
}

export function timelinePage() {
  const FILTERS = [['all', 'Everything'], ['session', 'Sessions'], ['battle', 'Battles'], ['event', 'Events'], ['change', 'What changed'], ['paper', 'Front pages'], ['handout', 'Handouts']];
  const items = campaignTimeline(W.world, { kinds: W.ui.tlFilter === 'all' ? null : [W.ui.tlFilter] });
  // group by session
  const groups = [];
  for (const it of items) {
    const key = it.session != null ? `S${it.session}` : it.date || 'undated';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, session: it.session, date: it.date, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Campaign'), h('h1', null, 'Timeline'), h('p', { class: 'wd-tagline' }, 'Every session from every journal, every recorded battle and event, and every change you recorded: who turned on whom, who joined what, who fell. In order, by session.')),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: () => momentDialog({}) }, 'What happened'), h('button', { class: 'btn', type: 'button', onClick: () => newPageDialog('event') }, '+ Event'))),
    h('div', { class: 'wd-filter-row' }, FILTERS.map(([k, label]) => h('button', { type: 'button', class: `wd-pill ${W.ui.tlFilter === k ? 'active' : ''}`, onClick: () => { W.ui.tlFilter = k; W.renderWorld(); } }, label))),
    items.length ? h('div', { class: 'wd-tl-groups' }, groups.map((g) => h('section', { class: 'wd-tl-group' },
      h('h2', { class: 'wd-tl-session' }, g.session != null ? `Session ${g.session}` : g.date || 'Undated', h('span', { class: 'pts' }, `${g.items.length}`)),
      h('div', { class: 'wd-tl' }, g.items.map(timelineItem))))) : h('div', { class: 'empty' }, h('h2', null, 'Nothing has happened yet'), h('p', null, 'Add a session to a character\'s campaign journal (Bio page), record a Battle Room fight, add an event page, or record what happened with the What happened button.')));
}

export function graphPage() {
  const last = lastSession(W.world);
  const asOf = W.ui.asOf == null || W.ui.asOf > last ? null : W.ui.asOf;
  const nodes = [...W.world.entities.values()].filter((e) => W.ui.graphTypes.has(e.type));
  const ids = new Set(nodes.map((n) => n.id));
  const base = asOf == null ? W.world.links.filter((l) => !l.until || W.ui.showPast) : linksAsOf(W.world, asOf);
  const edges = base.filter((l) => ids.has(l.from) && ids.has(l.to) && W.ui.graphGroups.has(RELATIONS[l.rel]?.group));
  const linked = new Set(edges.flatMap((l) => [l.from, l.to]));
  const shown = nodes.filter((n) => linked.has(n.id) || n.character);
  // Each family, team or circle gets its own patch, so they don't push each other into the edges.
  const lay = layoutComponents(shown.map((n) => ({ id: n.id })), edges, { width: 1100, seed: shown.length * 7 + edges.length });
  const pos = lay.pos;
  const PAD = 40; const GW = lay.width + PAD * 2; const GH = lay.height + PAD * 2;
  for (const p of pos.values()) { p.x += PAD; p.y += PAD; }
  // Names on the busy nodes; the rest show theirs on hover, so the picture stays readable.
  const named = (n) => n.character || n.degree >= 4 || n.type === 'faction' || shown.length <= 40;
  const zoom = W.ui.graphZoom || 1;
  const setZoom = (z) => { W.ui.graphZoom = Math.max(1, Math.min(4, z)); W.renderWorld(); };
  const typeToggle = (t) => h('label', { class: 'wd-toggle', style: { '--c': typeMeta(t).color } }, h('input', { type: 'checkbox', checked: W.ui.graphTypes.has(t), onChange: (e) => { if (e.target.checked) W.ui.graphTypes.add(t); else W.ui.graphTypes.delete(t); W.renderWorld(); } }), `${typeMeta(t).glyph} ${typeMeta(t).label}`);
  const groupToggle = (g) => h('label', { class: 'wd-toggle', style: { '--c': RELATIONS[Object.keys(RELATIONS).find((k) => RELATIONS[k].group === g)]?.color } }, h('input', { type: 'checkbox', checked: W.ui.graphGroups.has(g), onChange: (e) => { if (e.target.checked) W.ui.graphGroups.add(g); else W.ui.graphGroups.delete(g); W.renderWorld(); } }), g);
  const slider = last > 0 ? h('div', { class: 'wd-asof' },
    h('span', { class: 'label' }, 'As of'),
    h('input', { type: 'range', min: 0, max: last + 1, step: 1, value: asOf == null ? last + 1 : asOf, 'aria-label': 'As of session', onInput: (e) => { const v = Number(e.target.value); W.ui.asOf = v > last ? null : v; W.renderWorld(); } }),
    h('b', { class: 'num' }, asOf == null ? 'Now' : asOf === 0 ? 'Before play' : `Session ${asOf}`),
    asOf == null ? h('label', { class: 'wd-toggle', style: { '--c': '#9a8fb5' } }, h('input', { type: 'checkbox', checked: W.ui.showPast, onChange: (e) => { W.ui.showPast = e.target.checked; W.renderWorld(); } }), 'Show past ties (dashed)') : null) : null;
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Everyone'), h('h1', null, 'Relationship graph'), h('p', { class: 'wd-tagline' }, `${shown.length} pages, ${edges.length} ties${asOf != null ? ` as they stood at session ${asOf}` : ''}. Lines are coloured by the kind of tie; click a node to open its page. Wind the slider back to see the world before a betrayal, a death or a move.`))),
    h('div', { class: 'wd-filters' }, slider,
      h('details', { class: 'wd-graph-filters' }, h('summary', null, 'Show which pages and ties'),
        h('div', { class: 'wd-filter-row' }, Object.keys(ENTITY_TYPES).map(typeToggle)), h('div', { class: 'wd-filter-row' }, RELATION_GROUPS.map(groupToggle)))),
    shown.length ? h('div', { class: 'wd-graph-wrap big' },
      h('div', { class: 'wd-graph-tools' }, h('span', { class: 'hint' }, 'Click a node to open its page. Hover for a name.'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Zoom out', disabled: zoom <= 1, onClick: () => setZoom(zoom / 1.5) }, '−'),
        h('span', { class: 'num', style: { minWidth: '44px', textAlign: 'center' } }, `${Math.round(zoom * 100)}%`),
        h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Zoom in', disabled: zoom >= 4, onClick: () => setZoom(zoom * 1.5) }, '+')),
      h('div', { class: 'wd-graph-scroll' }, svg('svg', { viewBox: `0 0 ${GW} ${GH}`, class: 'wd-graph', role: 'img', 'aria-label': 'Relationship graph', style: `width:${zoom * 100}%` },
        edges.map((l) => { const a = pos.get(l.from); const b = pos.get(l.to); return svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: RELATIONS[l.rel]?.color || '#999', 'stroke-width': 1.6, 'stroke-opacity': l.until ? 0.35 : 0.7, 'stroke-dasharray': l.until ? '5 4' : null }, svg('title', null, `${W.world.entities.get(l.to).name} is ${W.world.entities.get(l.from).name}'s ${RELATIONS[l.rel]?.label.toLowerCase()}${l.since?.session != null ? ` since S${l.since.session}` : ''}${l.until ? ` (ended ${whenText(l.until)})` : ''}`)); }),
        shown.map((n) => { const p = pos.get(n.id); const color = n.color || typeMeta(n.type).color; const r = Math.min(22, 8 + Math.sqrt(n.degree) * 3 + (n.character ? 4 : 0)); return svg('g', { class: 'wd-node', transform: `translate(${p.x},${p.y})`, style: 'cursor:pointer', onClick: () => W.go(n.id) },
          svg('title', null, `${n.name} (${typeMeta(n.type).one}, ${n.degree} ties${n.status ? `, ${n.status}` : ''})`),
          svg('circle', { r, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, 'stroke-dasharray': n.status === 'Dead' || n.status === 'Destroyed' || n.status === 'Disbanded' ? '3 2' : null }),
          svg('text', { 'text-anchor': 'middle', dy: 4, fill: inkFor(color), 'font-size': Math.max(8, r * 0.7), 'font-weight': 700 }, n.type === 'person' ? initialsOf(n.name) : typeMeta(n.type).glyph),
          svg('text', { class: named(n) ? 'lbl' : 'lbl minor', 'text-anchor': 'middle', dy: r + 12, fill: 'var(--ink)', 'font-size': 10.5, 'font-weight': n.character ? 800 : 500 }, n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name)); })))) : h('div', { class: 'empty' }, h('h2', null, 'No one to draw yet'), h('p', null, 'Save characters to the roster; their families, mentors, rivals and enemies fill the graph.')));
}

async function copyWorldKey() {
  const k = await W.worldKey();
  toast((await copyText(k)) ? `World key copied (${keySize(k)}). Paste it to your players; they open it on the World's Vault page or the Forge's "Open a key" box.` : 'Copy failed: use "Save key as a file"');
}

export function vaultPage() {
  const fileIn = h('input', { type: 'file', accept: '.json', hidden: true, onChange: async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const w = data.world || data;
      if (!w?.v) throw new Error('Not a DCUGen vault file');
      const n = Object.keys(w.entities || {}).length;
      W.saved = mergeWorldSaved(W.saved, w);
      let chars = 0;
      for (const ch of data.characters || []) { if (ch?.abilities && ch.pl != null) { const c = { ...ch }; delete c.savedAt; upsert(c); chars++; } }
      W.save(); W.renderWorld();
      toast(`Imported ${n} page${n === 1 ? '' : 's'}, ${(w.links || []).length} links, ${(w.moments || []).length} moments${chars ? ` and ${chars} characters` : ''}`);
    } catch (err) { toast(`Import failed: ${err.message}`); }
  } });
  const exportJson = () => {
    download(`${slug(W.world.name || 'world')}-vault.json`, JSON.stringify({ app: 'DCUGen', kind: 'vault', version: 1, world: W.saved, characters: state.roster }, null, 2), 'application/json');
    toast('Vault saved (world + roster)');
  };
  const exportMd = () => {
    const files = vaultMarkdown(W.world);
    const bytes = zip(files);
    download(`${slug(W.world.name || 'world')}-obsidian.zip`, new Blob([bytes], { type: 'application/zip' }));
    toast(`${Object.keys(files).length} Markdown pages zipped. Unzip into an Obsidian vault.`);
  };
  const manual = Object.keys(W.saved.entities).length;
  const moments = (W.saved.moments || []).length;
  const keyIn = h('textarea', { placeholder: 'Paste a world key (DCUW1…) or a front-page key (DCUN1…) from your GM or a player', 'aria-label': 'World key', style: { minHeight: '64px', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' } });
  const openIt = async () => { if (isHandoutKey(keyIn.value)) { if (await W.openHandoutKey(keyIn.value)) keyIn.value = ''; return; } if (isPaperKey(keyIn.value)) { if (await W.openPaperKey(keyIn.value)) keyIn.value = ''; return; } if (!isWorldKey(keyIn.value)) { toast('That is not a world key (they start with DCUW1.) or a front-page key (DCUN1.)'); return; } if (await W.openWorldKey(keyIn.value)) keyIn.value = ''; };
  return h('div', { class: 'wd-page' },
    h('header', { class: 'wd-hero small' }, h('div', { class: 'wd-hero-text' }, h('div', { class: 'eyebrow' }, 'Vault'), h('h1', null, 'Share, import and export'), h('p', { class: 'wd-tagline' }, 'The world lives in this browser (and in the desktop app\'s data folder). Share it as one key, save it to a file, or hand it to your players.'))),
    h('div', { class: 'gm' },
      h('section', { class: 'panel wd-share' }, h('h2', null, 'World key'), h('p', { style: { margin: 0 } }, `One key holds the whole world: every hand-made page, tie and moment, and all ${state.roster.length} character${state.roster.length === 1 ? '' : 's'} on the roster (portrait paintings are left out and repaint on arrival). Paste it anywhere: chat, email, the "Open a key" box on the Forge.`),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', id: 'world-link', onClick: async () => { const k = await W.worldKey(); toast((await copyText(worldLink(k))) ? `World link copied (${keySize(k)}): anyone who opens it gets the whole world and roster` : 'Copy failed'); } }, 'Copy world link'), h('button', { class: 'btn', type: 'button', onClick: copyWorldKey }, 'Copy world key'), h('button', { class: 'btn', type: 'button', onClick: async () => { const k = await W.worldKey(); download(`${slug(W.world.name || 'world')}-key.txt`, k, 'text/plain'); toast(`World key saved (${keySize(k)})`); } }, 'Save key as a file')),
        h('div', { class: 'label', style: { marginTop: '8px' } }, 'Open a world key'), keyIn, h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onClick: openIt }, 'Open key'))),
      h('section', { class: 'panel' }, h('h2', null, 'Obsidian vault (Markdown)'), h('p', { style: { margin: 0 } }, 'One .md page per person, faction, location, event and item, with [[wikilinks]] between them, YAML front matter, infobox tables, current and former ties, and timelines. Unzip the folder into any Obsidian vault and the graph view lights up.'), h('button', { class: 'btn primary', type: 'button', onClick: exportMd }, `Download ${W.world.entities.size} pages as Markdown (.zip)`)),
      h('section', { class: 'panel' }, h('h2', null, 'DCUGen vault (.json)'), h('p', { style: { margin: 0 } }, `Everything: ${manual} hand-made page${manual === 1 ? '' : 's'}, ${W.saved.links.length} hand-made tie${W.saved.links.length === 1 ? '' : 's'}, ${moments} recorded moment${moments === 1 ? '' : 's'}, your edits to automatic pages, and the ${state.roster.length} character${state.roster.length === 1 ? '' : 's'} on your roster. Import merges into this world.`), h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onClick: exportJson }, 'Save vault'), h('button', { class: 'btn', type: 'button', onClick: () => fileIn.click() }, 'Import vault'), fileIn)),
      h('section', { class: 'panel' }, h('h2', null, 'Reset'), h('p', { style: { margin: 0 } }, 'Removes hand-made pages, ties, moments and edits. Roster characters and their bios stay, so their pages come straight back.'), h('button', { class: 'btn ghost danger', type: 'button', onClick: async () => { const ok = await openDialog({ title: 'Reset the world?', body: h('p', { style: { margin: 0 } }, 'Hand-made pages, ties, moments and edits are deleted. Export the vault first if you want a copy.'), buttons: [{ label: 'Keep', value: false }, { label: 'Reset', value: true, danger: true }] }); if (ok) { W.saved = emptyWorld(); W.save(); W.go('home'); } } }, 'Reset the world'))));
}

