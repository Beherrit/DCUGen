// The session planner: the campaign's sessions, past and coming, kept in the World (so a world key carries
// the schedule to the players). Each session has a date, the GM's scenes with links to World pages, notes,
// the Session in a Box plan made for it, and its recap once played. Open plot threads run across sessions.
// "Previously on…" is built from the last session played.
//
// saved.sessions = [{ id, number, title, date ('2026-10-24T19:00'), status: 'planned' | 'played',
//                     scenes: [{ id, text, done, links: [entityId] }], notes, plan, recap, created, updated }]
//                     cast: [{ rosterId, name, villain, pl, conds: [], note, xp }]  (who played, from GM Tools' In play)
// saved.threads  = [{ id, text, links: [entityId], opened: session number, closed: session number | null, created, updated }]

const nowIso = () => new Date().toISOString();
const rid = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const touch = (x) => { x.updated = nowIso(); return x; };

/** The sessions in order: by number, then date. */
export function sessionsOf(saved) {
  return [...(saved?.sessions || [])].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || String(a.date || '').localeCompare(String(b.date || '')));
}

/**
 * Plan a new session. Its number follows the highest one the campaign has used anywhere (pass the World's
 * lastSession() as `after`, so moments and journal sessions line up).
 */
export function addSession(saved, { title = '', date = '', after = 0 } = {}) {
  saved.sessions = saved.sessions || [];
  const top = Math.max(after || 0, ...saved.sessions.map((s) => s.number || 0));
  const s = { id: rid('ses'), number: top + 1, title: title || '', date: date || '', status: 'planned', scenes: [], notes: '', created: nowIso(), updated: nowIso() };
  saved.sessions.push(s);
  return s;
}

export function getSession(saved, id) { return (saved.sessions || []).find((s) => s.id === id) || null; }
export function sessionByNumber(saved, n) { return (saved.sessions || []).find((s) => s.number === n) || null; }

export function updateSession(saved, id, patch) {
  const s = getSession(saved, id);
  if (!s) return null;
  Object.assign(s, patch);
  return touch(s);
}

export function removeSession(saved, id) {
  saved.sessions = (saved.sessions || []).filter((s) => s.id !== id);
  saved.gone = saved.gone || {}; saved.gone[id] = nowIso();
}

// ---- scenes ----------------------------------------------------------------------------------------------

export function addScene(saved, id, { text, links = [] }) {
  const s = getSession(saved, id);
  if (!s || !String(text || '').trim()) return null;
  const sc = { id: rid('sc'), text: String(text).trim(), done: false, links: [...new Set(links)] };
  s.scenes = [...(s.scenes || []), sc];
  touch(s);
  return sc;
}

export function updateScene(saved, id, sceneId, patch) {
  const s = getSession(saved, id);
  const sc = s?.scenes?.find((x) => x.id === sceneId);
  if (!sc) return null;
  Object.assign(sc, patch);
  touch(s);
  return sc;
}

export function removeScene(saved, id, sceneId) {
  const s = getSession(saved, id);
  if (!s) return;
  s.scenes = (s.scenes || []).filter((x) => x.id !== sceneId);
  touch(s);
}

/** Move a scene up (-1) or down (+1). */
export function moveScene(saved, id, sceneId, by) {
  const s = getSession(saved, id);
  if (!s) return;
  const i = s.scenes.findIndex((x) => x.id === sceneId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= s.scenes.length) return;
  const list = [...s.scenes];
  [list[i], list[j]] = [list[j], list[i]];
  s.scenes = list;
  touch(s);
}

/**
 * Keep a Session in a Box plan with a session: the gist (villain, minions, scenes, rumor), not whole
 * character sheets. Its scenes join the session's scene list unless they're there already.
 */
export function attachPlan(saved, id, plan) {
  const s = getSession(saved, id);
  if (!s || !plan) return null;
  s.plan = {
    made: plan.made || nowIso(),
    villain: plan.villain?.ch ? { name: plan.villain.ch.identity?.codename || 'Villain', pl: plan.villain.ch.pl, rosterId: plan.villain.ch.rosterId || null, why: plan.villain.why || '' } : null,
    minions: plan.minions ? { name: plan.minions.name, count: plan.minions.count } : null,
    scenes: (plan.scenes || []).map((sc) => ({ title: sc.title, text: sc.text, stakes: sc.stakes || '' })),
    rumor: plan.rumor || '',
  };
  const have = new Set((s.scenes || []).map((x) => x.text));
  for (const sc of s.plan.scenes) {
    const text = `${sc.title}: ${sc.text}`;
    if (!have.has(text)) s.scenes = [...(s.scenes || []), { id: rid('sc'), text, done: false, links: [], fromPlan: true }];
  }
  touch(s);
  return s.plan;
}

/** The session played: its status, and the recap's headline and lines. */
export function markPlayed(saved, number, recap = null, cast = null) {
  let s = sessionByNumber(saved, number);
  if (!s) { s = addSession(saved, { after: number - 1 }); s.number = number; }
  s.status = 'played';
  if (cast?.length && !s.cast?.length) s.cast = cleanCast(cast);
  if (!s.date) s.date = nowIso().slice(0, 16);
  if (recap) s.recap = { headline: recap.headline || '', lines: recap.blurbs || recap.lines || [], text: recap.text || '' };
  touch(s);
  return s;
}

// ---- who played ----------------------------------------------------------------------------------------------

function cleanCast(cast) {
  const seen = new Set();
  return (cast || []).filter((c) => c && (c.rosterId || c.name) && !seen.has(c.rosterId || c.name) && seen.add(c.rosterId || c.name))
    .map((c) => ({ rosterId: c.rosterId || null, name: String(c.name || 'Someone'), villain: !!c.villain, pl: c.pl ?? null,
      conds: Array.isArray(c.conds) ? c.conds.map(String) : [], note: String(c.note || ''), xp: Math.max(0, Number(c.xp) || 0) }));
}

/** Who played in a session (replaces the list). */
export function setCast(saved, id, cast) {
  const s = getSession(saved, id);
  if (!s) return null;
  s.cast = cleanCast(cast);
  touch(s);
  return s.cast;
}

/** Add one person to a session's cast, or change what's kept about them. */
export function updateCast(saved, id, member, patch = {}) {
  const s = getSession(saved, id);
  if (!s) return null;
  const key = member.rosterId || member.name;
  const list = s.cast || [];
  const i = list.findIndex((c) => (c.rosterId || c.name) === key);
  const next = cleanCast([{ ...(i >= 0 ? list[i] : member), ...patch }])[0];
  if (i >= 0) list[i] = next; else list.push(next);
  s.cast = list;
  touch(s);
  return next;
}

export function removeFromCast(saved, id, key) {
  const s = getSession(saved, id);
  if (!s) return;
  s.cast = (s.cast || []).filter((c) => (c.rosterId || c.name) !== key);
  touch(s);
}

/**
 * Who played when, across the campaign: the sessions that have a cast, and for each character the session
 * numbers they were in and the XP they earned. Heroes first, then villains, each by first appearance.
 */
export function attendance(saved) {
  const sessions = sessionsOf(saved).filter((s) => s.cast?.length);
  const people = new Map();
  for (const s of sessions) {
    for (const c of s.cast) {
      const key = c.rosterId || c.name;
      const p = people.get(key) || { key, rosterId: c.rosterId, name: c.name, villain: c.villain, sessions: {}, xp: 0, count: 0 };
      p.name = c.name;
      p.sessions[s.number] = { xp: c.xp || 0, conds: c.conds || [], note: c.note || '' };
      p.xp += c.xp || 0;
      p.count++;
      people.set(key, p);
    }
  }
  const list = [...people.values()];
  return { sessions: sessions.map((s) => ({ id: s.id, number: s.number, title: s.title, date: s.date })), people: [...list.filter((p) => !p.villain), ...list.filter((p) => p.villain)] };
}

/**
 * The next session to play: the earliest planned one dated from `now` on, else the first planned one with no
 * date. Overdue planned sessions (a date in the past) still count if nothing later is planned.
 */
export function nextSession(saved, now = new Date()) {
  const planned = sessionsOf(saved).filter((s) => s.status !== 'played');
  const t = now.getTime();
  const dated = planned.filter((s) => s.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return dated.find((s) => new Date(s.date).getTime() >= t - 6 * 3600e3) || planned.find((s) => !s.date) || dated[dated.length - 1] || null;
}

export function lastPlayed(saved) {
  const played = sessionsOf(saved).filter((s) => s.status === 'played');
  return played[played.length - 1] || null;
}

// ---- plot threads ------------------------------------------------------------------------------------------

export function addThread(saved, { text, links = [], opened = null }) {
  if (!String(text || '').trim()) return null;
  saved.threads = saved.threads || [];
  const t = { id: rid('thr'), text: String(text).trim(), links: [...new Set(links)], opened, closed: null, created: nowIso(), updated: nowIso() };
  saved.threads.push(t);
  return t;
}

export function closeThread(saved, id, session = null) {
  const t = (saved.threads || []).find((x) => x.id === id);
  if (!t) return null;
  t.closed = session ?? true;
  return touch(t);
}

export function reopenThread(saved, id) {
  const t = (saved.threads || []).find((x) => x.id === id);
  if (!t) return null;
  t.closed = null;
  return touch(t);
}

export function removeThread(saved, id) {
  saved.threads = (saved.threads || []).filter((x) => x.id !== id);
  saved.gone = saved.gone || {}; saved.gone[id] = nowIso();
}

export const openThreads = (saved) => (saved.threads || []).filter((t) => t.closed == null);

// ---- previously on… ----------------------------------------------------------------------------------------

/**
 * "Previously on…": what the last session played left behind, for the table at the start of the next one.
 * world: the built World (for moment sentences and page names). Returns { title, lines, text } or null.
 */
export function previouslyOn(saved, world, { campaign = 'Our Campaign', before = null } = {}) {
  const played = sessionsOf(saved).filter((s) => s.status === 'played' && (before == null || s.number < before));
  const last = played[played.length - 1];
  const n = last?.number ?? (before != null && before > 1 ? before - 1 : null);
  const lines = [];
  if (last?.recap?.headline) lines.push(last.recap.headline);
  for (const l of (last?.recap?.lines || []).slice(0, 3)) lines.push(l);
  if (n != null) {
    for (const m of (world?.moments || []).filter((x) => x.session === n).slice(0, 4)) if (m.text && !lines.includes(m.text)) lines.push(m.text);
  }
  const name = (id) => world?.entities?.get?.(id)?.name;
  for (const t of openThreads(saved).slice(0, 3)) {
    const who = (t.links || []).map(name).filter(Boolean);
    lines.push(`Still unresolved: ${t.text}${who.length ? ` (${who.join(', ')})` : ''}`);
  }
  if (!lines.length) return null;
  const title = `Previously on ${campaign}${n != null ? `, session ${n}` : ''}…`;
  return { title, lines, text: `${title}\n${lines.map((l) => `• ${l}`).join('\n')}` };
}

// ---- calendar ----------------------------------------------------------------------------------------------

const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsLocal = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;

/**
 * An iCalendar file for a session, so players can add it to their calendars. Times are the GM's local
 * time ("floating"), which is what a game night means. Returns null without a date.
 */
export function sessionIcs(s, { campaign = 'Our Campaign', hours = 3, now = new Date() } = {}) {
  if (!s?.date) return null;
  const start = new Date(s.date);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + hours * 3600e3);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const summary = `${campaign}: Session ${s.number}${s.title ? ` (${s.title})` : ''}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DCUGen//Session planner//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${s.id}@dcugen`, `DTSTAMP:${stamp}`, `DTSTART:${icsLocal(start)}`, `DTEND:${icsLocal(end)}`,
    `SUMMARY:${icsEsc(summary)}`, `DESCRIPTION:${icsEsc('DC Adventures game night. Bring your character (DCUGen).')}`,
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

/** "Sat 24 Oct, 7:00 PM" (or '' with no date). */
export function whenLabel(date, locale = undefined) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const hasTime = /T\d\d:\d\d/.test(String(date));
  return d.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
}

// ---- merging two copies of a world -------------------------------------------------------------------------

/** Merge sessions and threads by id: the newer edit wins, deleted ones stay deleted. */
export function mergeSessions(current, incoming, gone = {}) {
  const pick = (a = [], b = []) => {
    const by = new Map();
    for (const x of [...a, ...b]) if (!by.has(x.id) || String(x.updated || '') >= String(by.get(x.id).updated || '')) by.set(x.id, x);
    return [...by.values()].filter((x) => !gone[x.id] || String(x.updated || '') > gone[x.id]);
  };
  return { sessions: pick(current?.sessions, incoming?.sessions), threads: pick(current?.threads, incoming?.threads) };
}
