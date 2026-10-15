// Jump-anywhere search (Ctrl+K): ranks everything the app can open against what was typed. Pure, so tested.
//
// items: [{ id, label, kind, hint?, words?, weight? }]. kind groups results (Go to, Do, Character, Page,
// Rule, Creature); words are extra text that matches (a real name, a category); weight nudges a kind up.

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

/**
 * How well a label matches the query: 0 (no match) to ~100. Whole label > starts with > a word starts with >
 * somewhere inside > the letters in order ("ssd" finds "Session in a Box"? no: "sib" does, by word starts).
 */
export function matchScore(label, query) {
  const l = norm(label); const q = norm(query);
  if (!q) return 1;
  if (!l) return 0;
  if (l === q) return 100;
  if (l.startsWith(q)) return 90 - Math.min(20, l.length - q.length) / 4;
  const words = l.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 75;
  // Every word of the query starts a word of the label ("doc nul" -> "Doctor Null").
  const qw = q.split(/\s+/).filter(Boolean);
  if (qw.length > 1 && qw.every((x) => words.some((w) => w.startsWith(x)))) return 70;
  if (l.includes(q)) return 55;
  // Initials: "sib" -> "Session in a Box".
  const initials = words.map((w) => w[0]).join('');
  if (q.length >= 2 && initials.startsWith(q)) return 50;
  // The letters in order, close together.
  let i = 0; let gaps = 0; let last = -1;
  for (let j = 0; j < l.length && i < q.length; j++) {
    if (l[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
  }
  if (i === q.length && q.length >= 3) return Math.max(5, 30 - gaps);
  return 0;
}

/** The best matches, best first: { ...item, score }. Ties keep the kind's weight, then shorter labels. */
export function rankItems(items, query, { limit = 30 } = {}) {
  const q = norm(query);
  const out = [];
  for (const it of items) {
    let s = matchScore(it.label, q);
    if (it.words && q) s = Math.max(s, matchScore(it.words, q) * 0.8);
    if (!s) continue;
    out.push({ ...it, score: s + (it.weight || 0) });
  }
  out.sort((a, b) => b.score - a.score || String(a.label).length - String(b.label).length || String(a.label).localeCompare(String(b.label)));
  return out.slice(0, limit);
}

/** Results grouped by kind (so each heading shows once), the group with the best match first. */
export function groupByKind(ranked) {
  const groups = new Map();
  for (const it of ranked) { if (!groups.has(it.kind)) groups.set(it.kind, []); groups.get(it.kind).push(it); }
  return [...groups.values()].sort((a, b) => b[0].score - a[0].score).flat();
}

/** With nothing typed: a few of each kind, in a sensible order, so the box is useful at once. */
export function starterItems(items, { perKind = 4, kinds = ['Do', 'Go to', 'Character', 'Page'] } = {}) {
  const out = [];
  for (const k of kinds) out.push(...items.filter((it) => it.kind === k).slice(0, perKind));
  return out;
}
