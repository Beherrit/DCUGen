// Advancement: power points the GM awards between adventures (DCA 190, "Awarding Power Points").
//
// ch.advancement = {
//   startPoints: 150,          // the character's starting budget (starting PL x 15)
//   startPl: 10,
//   snapshot: {...},           // the character as of the last recorded entry (traits only)
//   log: [{ id, date, type: 'award'|'spend'|'refund'|'pl', points, note, changes: [string] }],
// }
// With advancement on, the budget is startPoints + earned points. Raising the power level does not
// add points by itself (it only raises the limits), as in the book.

import { ABILITIES, BUYABLE_DEFENSES, PP_PER_PL } from './rules.js';
import { costBreakdown, powerCost, deviceCost } from './costs.js';

const TRAIT_KEYS = ['pl', 'abilities', 'defenses', 'skills', 'advantages', 'powers', 'devices', 'equipment'];

/** The parts of a character that cost points (what a snapshot keeps). */
export function traitSnapshot(ch) {
  const out = {};
  for (const k of TRAIT_KEYS) if (ch[k] !== undefined) out[k] = JSON.parse(JSON.stringify(ch[k]));
  return out;
}

export function earnedPoints(ch) {
  return (ch.advancement?.log || []).filter((e) => e.type === 'award').reduce((s, e) => s + (e.points || 0), 0);
}

/** Starting points + earned points, or PL x 15 for a character without advancement. */
export function pointBudget(ch) {
  if (!ch.advancement) return (ch.pl || 0) * PP_PER_PL;
  return (ch.advancement.startPoints ?? (ch.advancement.startPl ?? ch.pl) * PP_PER_PL) + earnedPoints(ch);
}

/** Turn advancement on: the current build becomes the starting point. */
export function startAdvancement(ch, R) {
  if (ch.advancement) return ch;
  const total = costBreakdown(ch, R).total;
  ch.advancement = {
    startPl: ch.pl,
    startPoints: Math.max(total, (ch.pl || 0) * PP_PER_PL),
    snapshot: traitSnapshot(ch),
    log: [],
  };
  return ch;
}

const newId = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** The GM awards points (usually 1 per adventure, 2 for a hard one; DCA 190). */
export function awardPoints(ch, R, points, note = '') {
  startAdvancement(ch, R);
  ch.advancement.log.push({ id: newId(), date: today(), type: 'award', points: Number(points) || 0, note: note || 'Adventure award' });
  return ch;
}

export function removeEntry(ch, id) {
  if (!ch.advancement) return ch;
  ch.advancement.log = ch.advancement.log.filter((e) => e.id !== id);
  return ch;
}

// ---- what changed since the snapshot ------------------------------------------------------------

const keyOf = (x) => `${x.name}|${x.spec || x.param || ''}`;
const label = (x) => `${x.name}${x.spec ? ` (${x.spec})` : ''}${x.param ? ` (${x.param})` : ''}`;
const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

function safe(fn) { try { return fn(); } catch { return 0; } }

/**
 * Plain-English list of changes between two characters, with the point change of each.
 * Returns [{ text, points }].
 */
export function diffTraits(before, after, R) {
  const out = [];
  const push = (text, points) => out.push({ text, points });
  if ((before.pl || 0) !== (after.pl || 0)) push(`Power level ${before.pl} → ${after.pl}`, 0);

  for (const a of ABILITIES) {
    const x = before.abilities?.[a];
    const y = after.abilities?.[a];
    if (x === y) continue;
    const cost = (v) => (v === null ? -10 : 2 * (v || 0));
    push(`${a} ${x ?? '—'} → ${y ?? '—'}`, cost(y) - cost(x));
  }
  for (const d of BUYABLE_DEFENSES) {
    const x = before.defenses?.[d] || 0;
    const y = after.defenses?.[d] || 0;
    if (x !== y) push(`${d} ${sign(y - x)} rank${Math.abs(y - x) === 1 ? '' : 's'} (bought ${x} → ${y})`, y - x);
  }

  // Skills cost 1 point per 2 ranks across all skills, so the per-skill point change is approximate;
  // the overall total is exact.
  const skillMap = (c) => new Map((c.skills || []).map((s) => [keyOf(s), s]));
  const bs = skillMap(before);
  const as = skillMap(after);
  const skillPts = Math.ceil((after.skills || []).reduce((s, k) => s + (k.ranks || 0), 0) / 2) - Math.ceil((before.skills || []).reduce((s, k) => s + (k.ranks || 0), 0) / 2);
  const skillLines = [];
  for (const [k, s] of as) {
    const old = bs.get(k)?.ranks || 0;
    if (s.ranks !== old) skillLines.push(`${label(s)} ${old} → ${s.ranks} ranks`);
  }
  for (const [k, s] of bs) if (!as.has(k)) skillLines.push(`${label(s)} removed (${s.ranks} ranks)`);
  if (skillLines.length) push(`Skills: ${skillLines.join(', ')}`, skillPts);

  const advMap = (c) => new Map((c.advantages || []).map((s) => [keyOf(s), s]));
  const ba = advMap(before);
  const aa = advMap(after);
  for (const [k, a] of aa) {
    const old = ba.get(k)?.rank || 0;
    const now = a.rank || 1;
    if (!ba.has(k)) push(`New advantage: ${label(a)}${now > 1 ? ` ${now}` : ''}`, now);
    else if (now !== old) push(`${label(a)} ${old} → ${now}`, now - old);
  }
  for (const [k, a] of ba) if (!aa.has(k)) push(`Removed advantage: ${label(a)}`, -(a.rank || 1));

  const pcost = (p) => safe(() => powerCost(p, R));
  const powMap = (c) => new Map((c.powers || []).map((p, i) => [p.name || `power ${i + 1}`, p]));
  const bp = powMap(before);
  const ap = powMap(after);
  for (const [name, p] of ap) {
    const old = bp.get(name);
    if (!old) { push(`New power: ${name} (${p.effect} ${p.rank})`, pcost(p)); continue; }
    if (JSON.stringify(old) === JSON.stringify(p)) continue;
    const bits = [];
    if (old.rank !== p.rank) bits.push(`rank ${old.rank} → ${p.rank}`);
    if (JSON.stringify(old.extras || []) !== JSON.stringify(p.extras || [])) bits.push('extras changed');
    if (JSON.stringify(old.flaws || []) !== JSON.stringify(p.flaws || [])) bits.push('flaws changed');
    if ((old.alternates || []).length !== (p.alternates || []).length) bits.push(`alternate effects ${(old.alternates || []).length} → ${(p.alternates || []).length}`);
    if (!bits.length) bits.push('changed');
    push(`${name}: ${bits.join(', ')}`, pcost(p) - pcost(old));
  }
  for (const [name, p] of bp) if (!ap.has(name)) push(`Removed power: ${name}`, -pcost(p));

  const dcost = (d) => safe(() => deviceCost(d, R).total);
  const devMap = (c) => new Map((c.devices || []).map((d, i) => [d.name || `device ${i + 1}`, d]));
  const bd = devMap(before);
  const ad = devMap(after);
  for (const [name, d] of ad) {
    const old = bd.get(name);
    if (!old) push(`New device: ${name}`, dcost(d));
    else if (JSON.stringify(old) !== JSON.stringify(d)) push(`${name} (device) changed`, dcost(d) - dcost(old));
  }
  for (const [name, d] of bd) if (!ad.has(name)) push(`Removed device: ${name}`, -dcost(d));

  const eq = (c) => (c.equipment || []).map((e) => e.name).sort().join('|');
  if (eq(before) !== eq(after)) {
    const bn = (before.equipment || []).map((e) => e.name);
    const an = (after.equipment || []).map((e) => e.name);
    const added = an.filter((n) => !bn.includes(n));
    const removed = bn.filter((n) => !an.includes(n));
    push(`Equipment${added.length ? `: added ${added.join(', ')}` : ''}${removed.length ? `${added.length ? ';' : ':'} removed ${removed.join(', ')}` : ''} (paid with the Equipment advantage)`, 0);
  }
  return out;
}

/** Changes made since the last recorded entry, and their total point cost. */
export function pendingChanges(ch, R) {
  if (!ch.advancement?.snapshot) return { changes: [], points: 0 };
  const before = ch.advancement.snapshot;
  const changes = diffTraits(before, ch, R);
  const points = costBreakdown(ch, R).total - costBreakdown({ ...before, advancement: ch.advancement }, R).total;
  return { changes, points };
}

/** Record the pending changes in the log and move the snapshot forward. */
export function recordChanges(ch, R, note = '') {
  if (!ch.advancement) return ch;
  const { changes, points } = pendingChanges(ch, R);
  if (!changes.length && !points) return ch;
  const plOnly = changes.length && changes.every((c) => /^Power level/.test(c.text));
  ch.advancement.log.push({
    id: newId(),
    date: today(),
    type: plOnly ? 'pl' : points < 0 ? 'refund' : 'spend',
    points,
    note: note || (plOnly ? 'Power level raised (GM)' : points < 0 ? 'Retrained (points back)' : 'Spent points'),
    changes: changes.map((c) => (c.points ? `${c.text} (${sign(c.points)} pp)` : c.text)),
  });
  ch.advancement.snapshot = traitSnapshot(ch);
  return ch;
}

/** Throw away changes since the last recorded entry. */
export function revertChanges(ch) {
  if (!ch.advancement?.snapshot) return ch;
  const snap = JSON.parse(JSON.stringify(ch.advancement.snapshot));
  for (const k of TRAIT_KEYS) if (snap[k] !== undefined) ch[k] = snap[k];
  return ch;
}

/** Totals for the advancement panel. */
export function advancementSummary(ch, R) {
  const cost = costBreakdown(ch, R);
  const adv = ch.advancement;
  const earned = earnedPoints(ch);
  const startPoints = adv ? (adv.startPoints ?? (adv.startPl ?? ch.pl) * PP_PER_PL) : cost.budget;
  const spent = adv ? (adv.log || []).filter((e) => e.type === 'spend' || e.type === 'refund').reduce((s, e) => s + (e.points || 0), 0) : 0;
  // GM guideline (DCA 190): raise the series PL by 1 for every 15 points earned.
  const startPl = adv?.startPl ?? ch.pl;
  const suggestedPl = startPl + Math.floor(earned / PP_PER_PL);
  return {
    on: !!adv,
    startPoints,
    startPl,
    earned,
    spent,
    budget: cost.budget,
    total: cost.total,
    unspent: cost.budget - cost.total,
    toNextPl: PP_PER_PL - (earned % PP_PER_PL),
    suggestedPl,
    pending: pendingChanges(ch, R),
  };
}
