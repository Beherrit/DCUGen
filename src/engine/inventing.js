// Inventing and rituals (DC Adventures Hero's Handbook p145-146).
//
// A character with Inventor makes inventions: temporary devices. With Ritualist they perform rituals. Both are
// powers built like any other, whose power point cost (Removable does not apply) sets the checks and the time:
//
//   Invention (Technology; Expertise (Magic) for a magical invention):
//     design        DC 10 + cost, 1 hour per point
//     construction  DC 10 + cost, 4 hours per point
//   Ritual (Expertise (Magic), Ritualist):
//     research      DC 10 + cost, 4 hours per point
//     performance   DC 10 + cost, 10 minutes per point
//
// Either check can be routine (the result is 10 + bonus, no roll). Each -1 to the time rank is a -5 penalty.
// A failed design must start over; with three or more degrees of failure the design seems right but the device
// will not work (the GM should roll it in secret). A failed construction does not work; three or more degrees of
// failure, or a natural 1, may be a mishap. Jury-rigging (a hero point): skip the design, take 1 round per point,
// DC 15 + cost, no routine check and no speeding it up.
//
// A finished invention works for one scene. After that, another scene costs a hero point (no checks), or the
// character buys it as a regular power, where it qualifies for Removable.
//
// Stored on the character: ch.inventions = [{ id, kind, power, status, flawed?, juryRigged?, log: [...] }]
//   kind: 'invention' | 'magical' | 'ritual'
//   status: 'planned' -> 'designed' -> 'ready' -> 'active' -> 'spent' (-> 'active' again for a hero point)
//           'failed' when it can't be used (a failed ritual research, a flawed design that was built)

import { powerCost } from './costs.js';

export const INVENT_KINDS = {
  invention: { label: 'Invention', skill: 'Technology', spec: null, advantage: 'Inventor', design: 'Design', build: 'Construction', designPer: 3600, buildPer: 4 * 3600, source: 'DCA 145' },
  magical: { label: 'Magical invention', skill: 'Expertise', spec: 'Magic', advantage: 'Inventor', design: 'Design', build: 'Construction', designPer: 3600, buildPer: 4 * 3600, source: 'DCA 146' },
  ritual: { label: 'Ritual', skill: 'Expertise', spec: 'Magic', advantage: 'Ritualist', design: 'Research', build: 'Performance', designPer: 4 * 3600, buildPer: 600, source: 'DCA 146' },
};

const ROUND = 6; // seconds
const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (ch, name) => (ch.advantages || []).some((a) => a.name === name);

/** The kinds of inventing this character can do (by advantage). */
export function inventKinds(ch) {
  return Object.entries(INVENT_KINDS).filter(([, k]) => has(ch, k.advantage)).map(([id]) => id);
}

/** An invention's power point cost: the power's full price, without Removable (inventions are temporary). */
export function inventionCost(power, R) {
  const p = clone(power);
  p.flaws = (p.flaws || []).filter((f) => !/Removable/.test(f.name));
  try { return Math.max(1, powerCost(p, R)); } catch { return 1; }
}

const TIME_TABLE = ['6 seconds', '12 seconds', '30 seconds', '1 minute', '2 minutes', '4 minutes', '8 minutes', '15 minutes', '30 minutes', '1 hour', '2 hours', '4 hours', '8 hours', '16 hours', '1 day', '2 days', '4 days', '1 week', '2 weeks', '1 month', '2 months', '4 months', '8 months', '1.5 years', '3 years'];
const DAY = 86400;
const TIME_SECONDS = [6, 12, 30, 60, 120, 240, 480, 900, 1800, 3600, 7200, 14400, 28800, 57600, DAY, 2 * DAY, 4 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY, 120 * DAY, 240 * DAY, 548 * DAY, 1095 * DAY];

/** Time rank of a span of seconds (the measurements table, DCA 18): the first rank at least that long. */
export function timeRank(seconds) {
  if (!(seconds > 0)) return -Infinity;
  const i = TIME_SECONDS.findIndex((t) => t >= seconds - 1e-9);
  return i >= 0 ? i : TIME_SECONDS.length - 1 + Math.ceil(Math.log2(seconds / TIME_SECONDS[TIME_SECONDS.length - 1]));
}

/** A time rank as words ("4 hours"). */
export function timeRankText(rank) {
  if (rank < 0) return rank === -1 ? '3 seconds' : '1 second';
  return TIME_TABLE[rank] || `time rank ${rank}`;
}

/** Seconds as plain words: "5 hours", "1 hour 40 minutes", "3 rounds". */
export function spanText(seconds) {
  if (seconds < 60) { const r = Math.round(seconds / ROUND); return `${r} round${r === 1 ? '' : 's'}`; }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (!h) return `${m} minute${m === 1 ? '' : 's'}`;
  return `${h} hour${h === 1 ? '' : 's'}${m ? ` ${m} minute${m === 1 ? '' : 's'}` : ''}`;
}

/**
 * The numbers for one step. step: 'design' | 'build'. opts: { faster: time ranks cut (each -5), jury: jury-rigging }.
 * Returns { label, dc, penalty, seconds, rank, time, routineOk, fasterOk }.
 */
export function stepPlan(inv, R, step, { faster = 0, jury = false } = {}) {
  const k = INVENT_KINDS[inv.kind] || INVENT_KINDS.invention;
  const cost = inventionCost(inv.power, R);
  if (jury) {
    const seconds = cost * ROUND;
    return { label: k.build, dc: 15 + cost, penalty: 0, seconds, rank: timeRank(seconds), time: `${cost} round${cost === 1 ? '' : 's'}${seconds >= 120 ? ` (about ${spanText(seconds)})` : ''}`, routineOk: false, fasterOk: false, cost };
  }
  const seconds = cost * (step === 'design' ? k.designPer : k.buildPer);
  const base = timeRank(seconds);
  const cut = Math.max(0, Math.floor(faster) || 0);
  return {
    label: step === 'design' ? k.design : k.build,
    dc: 10 + cost,
    penalty: -5 * cut,
    seconds,
    rank: base - cut,
    time: cut ? `${spanText(seconds / 2 ** cut)} (cut from ${spanText(seconds)})` : spanText(seconds),
    routineOk: true,
    fasterOk: true,
    cost,
  };
}

/** Degrees of success (positive) or failure (negative) of a total against a DC, with a natural 20 one degree better. */
export function degreesOf(total, dc, d20 = null) {
  let deg = total >= dc ? 1 + Math.floor((total - dc) / 5) : -(1 + Math.floor((dc - total - 1) / 5));
  if (d20 === 20) deg = deg > 0 ? deg + 1 : deg === -1 ? 1 : deg + 1;
  return deg;
}

/** The skill bonus used for this kind, from derived skills: { bonus, label } or null when the character lacks it. */
export function inventSkill(kind, d) {
  const k = INVENT_KINDS[kind] || INVENT_KINDS.invention;
  const label = k.spec ? `${k.skill} (${k.spec})` : k.skill;
  const s = (d?.skills || []).find((x) => x.name === k.skill && (!k.spec || String(x.spec || '').toLowerCase() === k.spec.toLowerCase()));
  return s ? { bonus: s.bonus, label } : null;
}

let seq = 0;
const newId = () => `inv-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Start a new invention or ritual from a power. Mutates ch, returns the entry. */
export function addInvention(ch, { kind = 'invention', power }) {
  const inv = { id: newId(), kind: INVENT_KINDS[kind] ? kind : 'invention', power: clone(power), status: 'planned', log: [] };
  ch.inventions = [...(ch.inventions || []), inv];
  return inv;
}

export function findInvention(ch, id) {
  return (ch.inventions || []).find((i) => i.id === id) || null;
}

export function removeInvention(ch, id) {
  ch.inventions = (ch.inventions || []).filter((i) => i.id !== id);
  if (!ch.inventions.length) delete ch.inventions;
}

/**
 * Apply a check to an invention. Mutates inv. step: 'design' | 'build'. check: { total, d20 (null for routine) }.
 * opts: { faster, jury }. Returns { deg, text, mishap }.
 */
export function applyCheck(inv, R, step, check, opts = {}) {
  const k = INVENT_KINDS[inv.kind] || INVENT_KINDS.invention;
  const plan = stepPlan(inv, R, step, opts);
  const deg = degreesOf(check.total, plan.dc, check.d20);
  const routine = check.d20 == null;
  const how = `${plan.label}${opts.jury ? ' (jury-rigged)' : ''}: ${routine ? `routine, ${check.total}` : `rolled ${check.total}`} vs DC ${plan.dc}`;
  let text;
  let mishap = false;
  if (step === 'design' && !opts.jury) {
    if (deg > 0) { inv.status = 'designed'; delete inv.flawed; text = `${how}: the ${inv.kind === 'ritual' ? 'research is done' : 'design is ready'}.`; }
    else if (inv.kind === 'ritual') {
      inv.status = 'failed';
      mishap = deg <= -3;
      text = `${how}: the research failed, so this ritual can't be used${mishap ? ', and something goes wrong (a mishap, at the GM\'s call)' : ''}.`;
    } else if (deg <= -3) {
      inv.status = 'designed'; inv.flawed = true;
      text = `${how}: three or more degrees of failure. The design seems correct, but the invention won't work properly (the book has the GM roll this in secret).`;
    } else { inv.status = 'planned'; delete inv.flawed; text = `${how}: the design is flawed. Start over.`; }
  } else {
    mishap = deg <= -3 || check.d20 === 1;
    if (deg > 0 && inv.flawed) {
      inv.status = 'failed';
      text = `${how}: it's finished, but the design was flawed, so it doesn't work.`;
    } else if (deg > 0) {
      if (opts.jury) { inv.status = 'active'; inv.juryRigged = true; text = `${how}: it works for one scene.`; }
      else { inv.status = 'ready'; text = `${how}: ${inv.kind === 'ritual' ? 'the ritual is performed and ready' : 'the invention is built'}. It works for one scene.`; }
    } else {
      text = `${how}: it doesn't work${opts.jury ? ', and the hero point is spent' : ''}.${mishap ? ' A mishap may follow (GM\'s call).' : ''}`;
    }
  }
  inv.log = [...(inv.log || []), { step, jury: !!opts.jury, total: check.total, d20: check.d20 ?? null, dc: plan.dc, deg, at: Date.now() }].slice(-20);
  return { deg, text, mishap, dc: plan.dc, label: plan.label, kind: k.label };
}

/** Put a ready invention to use this scene. Mutates inv. */
export function useInvention(inv) {
  if (inv.status === 'ready') inv.status = 'active';
}

/** Another scene for a spent invention: the caller takes the hero point. Mutates inv. */
export function reuseInvention(inv) {
  if (inv.status === 'spent') inv.status = 'active';
}

/** The scene ends: inventions in use are spent. Mutates ch. Returns how many. */
export function endInventionScene(ch) {
  let n = 0;
  for (const inv of ch.inventions || []) if (inv.status === 'active') { inv.status = 'spent'; n++; }
  return n;
}

/**
 * Buy an invention for good (DCA 145): it becomes a device, which qualifies for Removable. kind: 'removable' |
 * 'easily'. Mutates ch; returns the device.
 */
export function buyInvention(ch, id, kind = 'removable') {
  const inv = findInvention(ch, id);
  if (!inv) return null;
  const device = { name: inv.power.name || 'Invention', kind: kind === 'easily' ? 'easily' : 'removable', powers: [clone(inv.power)], invented: inv.kind };
  ch.devices = [...(ch.devices || []), device];
  removeInvention(ch, id);
  return device;
}

export const STATUS_TEXT = {
  planned: 'Needs a design',
  designed: 'Designed: ready to build',
  ready: 'Built: ready to use',
  active: 'In use this scene',
  spent: 'Used up (a hero point for another scene)',
  failed: "Doesn't work",
  shelved: 'Put away',
};

/** Ritual words for the status. */
export function statusText(inv) {
  if (inv.kind !== 'ritual') return STATUS_TEXT[inv.status] || inv.status;
  return { planned: 'Needs research', designed: 'Researched: ready to perform', ready: 'Performed: ready', active: 'In effect this scene', spent: 'Spent (a hero point for another scene)', failed: "Can't be used" }[inv.status] || inv.status;
}
