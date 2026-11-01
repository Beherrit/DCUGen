// The Inventing and Rituals bench (DCA 145-146): plan an invention or a ritual from a Power Lab power, see its DCs
// and times, make the design and construction checks (routine or rolled, faster for a penalty), jury-rig it for a
// hero point, use it for a scene, buy another scene with a hero point, or buy it for good as a Removable device.
// The rules are in engine/inventing.js. Rolls go to the Table like any other check.

import { h, toast, openDialog } from './dom.js';
import { rollCheck } from './dice.js';
import { postRoll } from './table.js';
import { deriveAll } from '../engine/derive.js';
import { playState } from '../engine/play.js';
import { checkLimits } from '../engine/limits.js';
import {
  INVENT_KINDS, inventKinds, inventionCost, stepPlan, inventSkill, addInvention, findInvention, removeInvention,
  applyCheck, useInvention, reuseInvention, buyInvention, statusText,
} from '../engine/inventing.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const blankPower = () => ({ name: 'New Invention', effect: 'Damage', rank: 6, range: 'Ranged', extras: [], flaws: [], descriptors: [], alternates: [] });

const faster = {}; // invention id -> time ranks cut, while the bench is open

/**
 * Open the bench as a dialog. io: { get() -> the open character, apply(c) -> keep a changed copy,
 * editInLab(power, title, done(power)) -> edit a power in the Power Lab and come back, labPower() -> the Power Lab's power }
 */
export async function openInventingBench(R, io) {
  const body = h('div', { class: 'bench', id: 'invent-bench' });
  const draw = () => { body.replaceChildren(...benchContent(R, io, draw)); };
  draw();
  await openDialog({ title: 'Inventing and rituals', body: [body] });
}

function change(io, fn) {
  const c = clone(io.get());
  const out = fn(c);
  io.apply(c);
  return out;
}

function heroPoints(ch) { return playState(ch).heroPoints; }
function spendHeroPoint(c) { const st = playState(c); st.heroPoints = Math.max(0, st.heroPoints - 1); c.play = st; }

function benchContent(R, io, draw) {
  const ch = io.get();
  if (!ch) return [h('p', null, 'Open a character on the Forge first.')];
  const who = ch.identity?.codename || 'Someone';
  const kinds = inventKinds(ch);
  let d = null;
  try { d = deriveAll(ch, R); } catch { /* shown below */ }
  const out = [];
  out.push(h('p', { class: 'hint', style: { margin: 0 } },
    'Inventors build temporary devices, ritualists perform rituals: powers that work for one scene (DCA 145-146). The power\'s cost sets the checks (DC 10 + cost) and the time. Make a check routine (10 + your bonus, no roll), or cut the time a rank for each −5.'));
  if (!kinds.length) {
    out.push(h('p', { class: 'hint bad' }, `${who} needs the Inventor advantage (Technology, DCA 76) or Ritualist (Expertise: Magic, DCA 78) to do this. Add one in Edit mode.`));
  }
  out.push(h('div', { class: 'bench-skills' }, Object.entries(INVENT_KINDS).map(([id, k]) => {
    const sk = d ? inventSkill(id, d) : null;
    const ok = kinds.includes(id);
    return h('span', { class: `chip${ok ? '' : ' off'}`, title: ok ? `${k.advantage}: ${k.label.toLowerCase()}s` : `Needs ${k.advantage}` }, `${k.label}: ${sk ? `${sk.label} ${sign(sk.bonus)}` : `no ${k.spec ? `${k.skill} (${k.spec})` : k.skill}`}`);
  })));

  // New
  const kindSel = h('select', { id: 'invent-kind', 'aria-label': 'Kind' }, Object.entries(INVENT_KINDS).map(([id, k]) => h('option', { value: id, selected: id === (kinds[0] || 'invention') }, `${k.label}${kinds.includes(id) ? '' : ` (needs ${k.advantage})`}`)));
  const labP = io.labPower?.();
  const start = (power) => {
    const kind = kindSel.value;
    change(io, (c) => addInvention(c, { kind, power }));
    toast(`${INVENT_KINDS[kind].label} planned: ${power.name}`);
    draw();
  };
  out.push(h('div', { class: 'bench-new' },
    h('label', { class: 'field' }, h('span', null, 'New'), kindSel),
    h('button', { class: 'btn primary', type: 'button', id: 'invent-new-lab', onClick: () => io.editInLab(blankPower(), `A new ${INVENT_KINDS[kindSel.value].label.toLowerCase()}`, (pw) => start(pw)) }, 'Build it in the Power Lab'),
    labP ? h('button', { class: 'btn', type: 'button', id: 'invent-from-lab', title: 'The power open in the Power Lab now', onClick: () => start(clone(labP)) }, `Use the Lab's ${labP.name} (${inventionCost(labP, R)} pp)`) : null));

  const list = ch.inventions || [];
  if (!list.length) out.push(h('p', { class: 'hint' }, 'Nothing on the bench yet.'));
  const hp = heroPoints(ch);
  for (const inv of list) out.push(inventionCard(R, io, draw, ch, inv, d, hp, who));
  return out;
}

function inventionCard(R, io, draw, ch, inv, d, hp, who) {
  const k = INVENT_KINDS[inv.kind] || INVENT_KINDS.invention;
  const cost = inventionCost(inv.power, R);
  const sk = d ? inventSkill(inv.kind, d) : null;
  const cut = faster[inv.id] || 0;
  const step = inv.status === 'planned' ? 'design' : 'build';
  const plan = stepPlan(inv, R, step, { faster: cut });
  const jury = stepPlan(inv, R, 'build', { jury: true });
  const issues = checkLimits(ch, R).filter((i) => i.message.startsWith(`${k.label} ${inv.power?.name || ''}`.trim()) && i.severity !== 'info');
  const log = (text) => postRoll({ who, text: `${who}: ${text}` });

  const doCheck = (routine, opts = {}) => {
    const p = opts.jury ? jury : plan;
    if (!sk) { toast(`${who} has no ${k.spec ? `${k.skill} (${k.spec})` : k.skill} skill`); return; }
    const mod = sk.bonus + p.penalty;
    let check;
    if (routine) check = { total: 10 + mod, d20: null };
    else {
      const e = rollCheck({ who, label: `${p.label} check (${inv.power.name})`, mod, dc: p.dc, note: p.penalty ? `${p.penalty} to cut the time` : opts.jury ? 'jury-rigged' : '' });
      check = { total: e.dice?.total ?? 10 + mod, d20: e.dice?.roll ?? null };
    }
    const r = change(io, (c) => {
      const x = findInvention(c, inv.id);
      if (opts.jury) spendHeroPoint(c);
      return applyCheck(x, R, opts.jury ? 'build' : step, check, opts);
    });
    if (routine) log(r.text); // a rolled check is already on the Table
    toast(r.text);
    draw();
  };

  const act = (label, fn, attrs = {}) => h('button', { class: 'btn sm', type: 'button', ...attrs, onClick: () => { fn(); draw(); } }, label);
  const timeIn = h('input', { type: 'number', min: 0, max: 12, value: cut, 'aria-label': 'Time ranks to cut', class: 'bench-faster', onChange: (e) => { faster[inv.id] = Math.max(0, Math.min(12, Number(e.target.value) || 0)); draw(); } });
  const routineTotal = sk ? 10 + sk.bonus + plan.penalty : null;
  const canCheck = ['planned', 'designed'].includes(inv.status);

  return h('article', { class: `bench-card ${inv.status}`, 'data-id': inv.id },
    h('div', { class: 'bench-head' },
      h('b', null, inv.power?.name || 'Invention'),
      h('span', { class: 'chip' }, k.label),
      h('span', { class: 'num' }, `${cost} pp`),
      h('span', { class: `chip bench-status ${inv.status}` }, statusText(inv)),
      inv.juryRigged ? h('span', { class: 'chip warn', title: 'Jury-rigged (DCA 146)' }, 'jury-rigged') : null),
    h('p', { class: 'bench-power' }, `${inv.power.effect} ${inv.power.rank}${(inv.power.extras || []).length ? `, ${inv.power.extras.map((m) => m.name).join(', ')}` : ''}${(inv.power.flaws || []).length ? `; ${inv.power.flaws.map((m) => m.name).join(', ')}` : ''}`),
    inv.flawed && inv.status === 'designed' ? h('p', { class: 'hint warn' }, 'GM: the design check failed by three or more degrees, so this invention won\'t work properly once built. The book suggests rolling this check in secret.') : null,
    canCheck ? h('div', { class: 'bench-step' },
      h('div', null, h('b', null, `${plan.label}: DC ${plan.dc}`), ` · ${plan.time}${plan.penalty ? ` · ${plan.penalty} on the check` : ''}`),
      h('label', { class: 'bench-cut' }, 'Cut the time by', timeIn, 'ranks (−5 each)'),
      h('div', { class: 'btn-row' },
        act(`Routine (${routineTotal ?? '—'})`, () => doCheck(true), { disabled: !sk, title: 'No roll: 10 + your bonus. Fine when there is time and no pressure.' }),
        act(`Roll ${sk ? sign(sk.bonus + plan.penalty) : ''}`, () => doCheck(false), { disabled: !sk }),
        act(`Jury-rig: 1 hero point, DC ${jury.dc}, ${jury.time}`, () => doCheck(false, { jury: true }), { disabled: !sk || hp < 1, title: hp < 1 ? 'No hero points left' : 'Skip the design, build it in a round per point (DCA 146). It works for one scene.' }))) : null,
    h('div', { class: 'btn-row' },
      inv.status === 'ready' ? act('Use it this scene', () => { change(io, (c) => useInvention(findInvention(c, inv.id))); toast(`${inv.power.name} is on for this scene`); }, { class: 'btn sm primary' }) : null,
      inv.status === 'active' ? act('Scene over', () => change(io, (c) => { findInvention(c, inv.id).status = 'spent'; })) : null,
      inv.status === 'spent' ? act('Another scene: 1 hero point', () => { change(io, (c) => { spendHeroPoint(c); reuseInvention(findInvention(c, inv.id)); }); toast(`${inv.power.name} works for another scene`); }, { disabled: hp < 1 }) : null,
      inv.status === 'failed' ? act('Start over', () => change(io, (c) => { const x = findInvention(c, inv.id); x.status = 'planned'; delete x.flawed; })) : null,
      ['ready', 'active', 'spent'].includes(inv.status) ? act('Buy for good (Removable)', () => { change(io, (c) => buyInvention(c, inv.id, 'removable')); toast(`${inv.power.name} is now a Removable device on the sheet`); }, { title: 'Spend the power points: it becomes a device, −1 point per 5 (DCA 145)' }) : null,
      ['ready', 'active', 'spent'].includes(inv.status) ? act('Buy as Easily Removable', () => { change(io, (c) => buyInvention(c, inv.id, 'easily')); toast(`${inv.power.name} is now an Easily Removable device`); }) : null,
      ['planned', 'designed', 'failed'].includes(inv.status) ? act('Edit in Power Lab', () => io.editInLab(inv.power, `${k.label}: ${inv.power.name}`, (pw) => change(io, (c) => { const x = findInvention(c, inv.id); if (x) { x.power = pw; x.status = 'planned'; delete x.flawed; } }))) : null,
      act('Remove', () => change(io, (c) => removeInvention(c, inv.id)), { class: 'x', 'aria-label': `Remove ${inv.power.name}` })),
    issues.length ? h('ul', { class: 'issues' }, issues.map((i) => h('li', { class: i.severity }, i.message))) : null,
    (inv.log || []).length ? h('details', { class: 'bench-log' }, h('summary', null, `Checks (${inv.log.length})`),
      h('ol', null, inv.log.map((l) => h('li', null, `${l.jury ? 'Jury-rig' : l.step === 'design' ? k.design : k.build}: ${l.d20 == null ? 'routine' : `d20 ${l.d20}`}, ${l.total} vs DC ${l.dc}: ${l.deg > 0 ? `${l.deg} degree${l.deg > 1 ? 's' : ''} of success` : `${-l.deg} of failure`}`)))) : null);
}

/** The Play view card: inventions and rituals on hand, with use, another scene and the bench. */
export function inventionsPlayCard(ch, R, change, openBench) {
  const list = (ch.inventions || []).filter((i) => ['ready', 'active', 'spent'].includes(i.status));
  const can = inventKinds(ch).length;
  if (!list.length && !can) return null;
  const hp = playState(ch).heroPoints;
  return h('section', { class: 'play-card', id: 'play-inventions' }, h('h3', null, 'Inventions and rituals'),
    list.length ? h('div', { class: 'play-list' }, list.map((inv) => h('div', { class: 'play-line' },
      h('b', null, inv.power.name),
      h('small', null, `${inv.power.effect} ${inv.power.rank} · ${statusText(inv)}`),
      inv.status === 'ready' ? h('button', { class: 'btn sm primary', type: 'button', onClick: () => change((c) => useInvention(findInvention(c, inv.id))) }, 'Use') : null,
      inv.status === 'spent' ? h('button', { class: 'btn sm', type: 'button', disabled: hp < 1, title: 'Spend a hero point for another scene', onClick: () => change((c) => { spendHeroPoint(c); reuseInvention(findInvention(c, inv.id)); }) }, 'Again: 1 hero point') : null))) : h('p', { class: 'hint', style: { margin: 0 } }, 'Nothing built yet.'),
    h('button', { class: 'btn sm', type: 'button', style: { marginTop: '8px' }, onClick: () => openBench() }, 'Open the bench'));
}
