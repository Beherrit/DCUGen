// The range cheat sheet and calculator: how far an attack reaches, what band a target is in, distances
// by rank, how fast you get somewhere, and how far you can throw. Opens from the Forge, the Play view
// and the Rules tab, with the open character's powers ready to pick.

import { h, openDialog } from './dom.js';
import { rangeBands, bandFor, rangeInfo, fmtFt, ftToRank, measure, travelTime, strengthReach, AREA_BASE } from '../engine/range.js';
import { deriveAll } from '../engine/derive.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);
const toFt = (v, unit) => num(v) * (unit === 'mi' ? 5280 : 1);

/** All of the character's powers and attacks that have a range, for the picker. */
function rangedPowers(ch, R) {
  const out = [];
  const visit = (list) => (list || []).forEach((p) => {
    const info = rangeInfo(p, R);
    if (info) out.push({ name: p.name, rank: p.rank, info });
    for (const a of p.alternates || []) visit([a]);
  });
  visit(ch?.powers);
  for (const d of ch?.devices || []) visit(d.powers);
  return out;
}

export function rangeCalculator(ch, R) {
  const powers = ch ? rangedPowers(ch, R) : [];
  const out = (el) => h('div', { class: 'rc-out' }, el);

  // 1. Attack range
  const rank = h('input', { type: 'number', min: 1, max: 40, value: powers.find((p) => p.info.kind === 'Ranged')?.rank || 10, 'aria-label': 'Effect rank', class: 'rc-rank' });
  const ext = h('input', { type: 'number', min: 0, max: 10, value: powers.find((p) => p.info.kind === 'Ranged')?.info.extended || 0, 'aria-label': 'Extended Range ranks', class: 'rc-ext' });
  const dist = h('input', { type: 'number', min: 0, placeholder: 'how far?', 'aria-label': 'Distance to the target', class: 'rc-dist' });
  const unit = h('select', { 'aria-label': 'Unit', class: 'rc-unit' }, h('option', { value: 'ft' }, 'feet'), h('option', { value: 'mi' }, 'miles'));
  const pick = powers.length ? h('select', { 'aria-label': 'Use a power', class: 'rc-power' }, h('option', { value: '' }, 'Pick a power…'),
    powers.map((p, i) => h('option', { value: i }, `${p.name} (${p.info.kind}${p.rank ? ` ${p.rank}` : ''})`))) : null;
  const attackOut = out(null);
  const drawAttack = () => {
    const r = Math.max(1, num(rank.value, 1));
    const x = Math.max(0, num(ext.value));
    const bands = rangeBands(r, x);
    const ft = toFt(dist.value, unit.value);
    const b = dist.value !== '' ? bandFor(ft, r, x) : null;
    const chosen = pick && pick.value !== '' ? powers[Number(pick.value)] : null;
    attackOut.replaceChildren(...[
      chosen && chosen.info.kind !== 'Ranged' ? h('p', { class: 'rc-note' }, h('b', null, `${chosen.name}: `), chosen.info.text) : null,
      h('table', { class: 'rc-table' }, h('tbody', null,
        bands.map((band) => h('tr', { class: b && b.band === band.band ? 'hit' : '' }, h('td', null, band.band[0].toUpperCase() + band.band.slice(1)), h('td', { class: 'num' }, `up to ${fmtFt(band.ft)}`), h('td', { class: 'num' }, band.penalty ? `${band.penalty} to hit` : 'no penalty'))))),
      b ? h('p', { class: `rc-verdict ${b.band === 'out' ? 'bad' : ''}` }, b.band === 'out'
        ? `${fmtFt(ft)} is out of range. Extended Range ${Math.max(x + 1, Math.ceil(Math.log2(ft / (100 * r))))} reaches it at long range (−5), Extended Range ${Math.ceil(Math.log2(ft / (25 * r)))} at short range. Without it, rank ${Math.ceil(ft / 100)} reaches it at long range.`
        : `${fmtFt(ft)} is ${b.band} range: ${b.penalty ? `${b.penalty} to the attack check` : 'no penalty'}.`) : null].filter(Boolean));
  };
  pick?.addEventListener('change', () => {
    const p = powers[Number(pick.value)];
    if (p?.info.kind === 'Ranged') { rank.value = p.rank; ext.value = p.info.extended || 0; }
    drawAttack();
  });
  for (const el of [rank, ext, dist, unit]) el.addEventListener('input', drawAttack);
  drawAttack();

  // 2. Distance ranks
  const mRank = h('input', { type: 'number', min: -5, max: 40, value: 0, 'aria-label': 'Rank', class: 'rc-mrank' });
  const mDist = h('input', { type: 'number', min: 0, placeholder: 'or a distance', 'aria-label': 'Distance', class: 'rc-mdist' });
  const mUnit = h('select', { 'aria-label': 'Unit' }, h('option', { value: 'ft' }, 'feet'), h('option', { value: 'mi' }, 'miles'));
  const measureOut = out(null);
  const drawMeasure = () => {
    let r = num(mRank.value);
    if (mDist.value !== '') { r = ftToRank(toFt(mDist.value, mUnit.value)); }
    const row = measure(r, R);
    measureOut.replaceChildren(h('p', null, h('b', null, `Rank ${r}: `), `distance ${row.distance}`, row.time ? ` · time ${row.time}` : '', row.mass ? ` · mass ${row.mass}` : '', row.volume ? ` · volume ${row.volume}` : ''));
  };
  for (const el of [mRank, mDist, mUnit]) el.addEventListener('input', drawMeasure);
  drawMeasure();

  // 3. Travel
  const moves = powers.filter((p) => p.info.kind === 'Movement');
  const sRank = h('input', { type: 'number', min: -5, max: 40, value: moves[0]?.info.move.rank ?? 0, 'aria-label': 'Speed rank', class: 'rc-speed' });
  const tDist = h('input', { type: 'number', min: 0, value: 1, 'aria-label': 'Distance to travel', class: 'rc-tdist' });
  const tUnit = h('select', { 'aria-label': 'Unit' }, h('option', { value: 'mi' }, 'miles'), h('option', { value: 'ft' }, 'feet'));
  const travelOut = out(null);
  const drawTravel = () => {
    const sr = num(sRank.value);
    const t = travelTime(toFt(tDist.value, tUnit.value), sr, R);
    travelOut.replaceChildren(h('p', null, `Speed ${sr} covers ${measure(sr, R).distance} per move action. ${tDist.value} ${tUnit.value === 'mi' ? 'miles' : 'feet'} takes about `, h('b', null, t.time), ` (time rank ${t.rank}).`));
  };
  for (const el of [sRank, tDist, tUnit]) el.addEventListener('input', drawTravel);
  drawTravel();

  // 4. Throwing
  let str = 0;
  try { str = ch ? deriveAll(ch, R).abilities.Strength ?? 0 : 0; } catch { str = 0; }
  const sIn = h('input', { type: 'number', min: -5, max: 40, value: str, 'aria-label': 'Strength', class: 'rc-str' });
  const masses = (R.raw.reference?.measurements || []).filter((m) => m.rank >= -5 && m.rank <= 25);
  const mass = h('select', { 'aria-label': 'Object mass', class: 'rc-mass' }, masses.map((m) => h('option', { value: m.rank, selected: m.rank === 2 }, `${m.mass} (mass rank ${m.rank})`)));
  const throwOut = out(null);
  const drawThrow = () => {
    const s = num(sIn.value);
    const mr = num(mass.value);
    const reach = strengthReach(s, R);
    throwOut.replaceChildren(h('p', null, `Strength ${s} lifts `, h('b', null, reach?.lift || '—'), '. ',
      s - mr >= -5 ? ['Throws that ', h('b', null, measure(s - mr, R).distance), ` (distance rank ${s - mr}).`] : 'Too heavy to throw.'));
  };
  for (const el of [sIn, mass]) el.addEventListener('input', drawThrow);
  drawThrow();

  return h('div', { class: 'rangecalc' },
    h('section', null, h('h4', null, '🎯 Attack range'), h('div', { class: 'rc-row' }, pick, h('label', null, 'Rank', rank), h('label', null, 'Extended Range', ext), h('label', null, 'Target is', dist, unit)), attackOut,
      h('p', { class: 'hint' }, 'Ranged: short rank × 25 ft, medium × 50 ft (−2), long × 100 ft (−5); Extended Range doubles them per rank (DCA 129, 172-173). Close: touch. Perception: anything you can perceive, no roll.')),
    h('section', null, h('h4', null, '📐 Areas'), h('table', { class: 'rc-table' }, h('tbody', null, Object.entries(AREA_BASE).map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, v.text(v.ft)))))),
      h('p', { class: 'hint' }, 'One rank of Area; each +1 Area doubles it. Targets inside make a Dodge check (DC 10 + rank) for half (DCA 126).')),
    h('section', null, h('h4', null, '📏 Distance by rank'), h('div', { class: 'rc-row' }, h('label', null, 'Rank', mRank), h('label', null, 'or', mDist, mUnit)), measureOut,
      h('p', { class: 'hint' }, 'Every rank doubles: rank 0 is 30 ft, rank 7 about half a mile, rank 15 about 60 miles.')),
    h('section', null, h('h4', null, '🏃 Travel time'), h('div', { class: 'rc-row' }, h('label', null, 'Speed rank', sRank), h('label', null, 'Distance', tDist, tUnit)), travelOut,
      h('p', { class: 'hint' }, 'Time rank = distance rank − speed rank. Flight, Speed and Swimming ranks are speed ranks.')),
    h('section', null, h('h4', null, '💪 Lifting & throwing'), h('div', { class: 'rc-row' }, h('label', null, 'Strength', sIn), h('label', null, 'Object', mass)), throwOut,
      h('p', { class: 'hint' }, 'You lift the mass of your Strength rank. Throwing distance rank = Strength rank − the object’s mass rank.')));
}

export function openRangeCalculator(ch, R) {
  return openDialog({ title: `Range${ch?.identity?.codename ? ` · ${ch.identity.codename}` : ''}`, body: rangeCalculator(ch, R) });
}
