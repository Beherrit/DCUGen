// The character "case file": read view and edit view.

import { h } from './dom.js';
import { guideFor, skillGuideBody } from './skillguide.js';
import { inkFor } from './dom.js';
import { sheet as makeSheet, describeEffect, explainPower } from '../engine/render.js';
import { costMath } from '../engine/powersmith.js';
import { ABILITIES, BUYABLE_DEFENSES } from '../engine/rules.js';
import { powerCost } from '../engine/costs.js';
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const clone = (x) => JSON.parse(JSON.stringify(x));

function stepper(value, onStep, { min = -Infinity, max = Infinity, label } = {}) {
  return h('span', { class: 'stepper no-print' },
    h('button', { type: 'button', 'aria-label': `Lower ${label || ''}`, disabled: value <= min, onClick: () => onStep(-1) }, '−'),
    h('button', { type: 'button', 'aria-label': `Raise ${label || ''}`, disabled: value >= max, onClick: () => onStep(1) }, '+'));
}

function mathTable(p, R) {
  let m;
  try { m = costMath(p, R); } catch (e) { return h('div', { class: 'math' }, e.message); }
  const fmt = (v) => (v > 0 ? `+${v}` : `${v}`);
  return h('div', { class: 'math' }, h('table', null, h('tbody', null, m.lines.map((l) => h('tr', { class: l.final ? 'final' : l.subtotal ? 'sub' : '' },
    h('td', null, l.label),
    h('td', { class: 'v' }, l.perRank !== undefined ? `${fmt(l.perRank)}/rank` : l.flat !== undefined ? `${fmt(l.flat)} flat` : ''),
    h('td', { class: 'v' }, l.total !== undefined ? `${l.total} pp` : ''))))),
  h('div', { style: { color: 'var(--ink-3)', marginTop: '4px' } }, `Cost ratio ${m.ratio} (points : ranks)`));
}

/** The plain-English "what it does" block under a power. */
export function whatItDoes(p, R, compact = false) {
  let ex;
  try { ex = explainPower(p, R); } catch { return null; }
  return h('div', { class: `power-what ${compact ? 'compact' : ''}` },
    h('p', null, ex.what),
    !compact && ex.notes.length ? h('ul', null, ex.notes.map((n) => h('li', { class: n.kind }, h('b', null, `${n.name}: `), n.text))) : null);
}

/**
 * opts: { editing, fresh, toolbar, onChange(newCh), onEditPower(path), onAddPower() }
 */
export function renderFile(ch, R, opts = {}) {
  const s = makeSheet(ch, R);
  const editing = !!opts.editing;
  const change = (fn) => { const c = clone(ch); fn(c); opts.onChange?.(c); };
  const hero = ch.theme?.color || '#c8202f';
  const id = ch.identity || {};

  // ---- header ----
  const tags = [
    ch.archetype?.name && h('span', { class: 'chip' }, ch.archetype.name),
    ch.theme?.name && h('span', { class: 'chip' }, ch.theme.name + (ch.theme.secondary ? ` + ${ch.theme.secondary.name}` : '')),
    ch.style && h('span', { class: 'chip', title: ch.style.summary }, `${ch.style.name} style`),
    h('span', { class: 'chip' }, ch.alignment === 'villain' ? 'Villain' : 'Hero'),
    id.base && h('span', { class: 'chip' }, id.base),
  ];
  const head = h('div', { class: `file-head ${editing ? 'editing' : ''}` },
    h('div', { class: 'pl-badge' },
      h('b', { class: 'num' }, ch.pl), h('span', null, 'POWER LEVEL'),
      editing ? stepper(ch.pl, (d) => change((c) => { c.pl = Math.max(1, Math.min(20, c.pl + d)); }), { min: 1, max: 20, label: 'power level' }) : null),
    h('div', { class: 'eyebrow' }, ch.origin?.label ? `Case file · ${ch.origin.label} origin` : 'Case file'),
    editing
      ? h('div', { style: { display: 'grid', gap: '6px', margin: '8px 0', maxWidth: '520px' } },
        h('input', { class: 'codename-input', type: 'text', id: 'edit-codename', value: id.codename || '', 'aria-label': 'Codename', onChange: (e) => change((c) => { c.identity = { ...c.identity, codename: e.target.value }; }) }),
        h('input', { class: 'realname-input', type: 'text', id: 'edit-realname', value: id.realName || '', 'aria-label': 'Real name', onChange: (e) => change((c) => { c.identity = { ...c.identity, realName: e.target.value }; }) }))
      : [h('h1', { class: 'codename' }, id.codename || 'Unnamed'), h('div', { class: 'realname' }, [id.realName, id.age ? `${id.age}` : null, id.occupation].filter(Boolean).join(' · '))],
    h('div', { class: 'head-tags' }, tags));
  head.style.setProperty('--hero', hero);
  head.style.setProperty('--hero-ink', inkFor(hero));

  // ---- abilities ----
  const abilities = h('section', { class: 'sec' },
    h('h3', null, 'Abilities', h('span', { class: 'pts' }, `${s.cost.abilities} pp`)),
    h('div', { class: 'abilities' }, s.abilities.map((a) => h('div', { class: 'ab' },
      h('span', { class: 'abbr' }, a.abbr),
      h('span', { class: 'val num' }, a.total ?? '—'),
      a.total !== a.base && a.base != null ? h('span', { class: 'sub' }, `base ${a.base}`) : null,
      editing ? stepper(a.base ?? 0, (d) => change((c) => { c.abilities[a.name] = (c.abilities[a.name] ?? 0) + d; }), { min: -5, label: a.name }) : null))));

  // ---- defenses ----
  const pl = ch.pl;
  const t = s.defenses.find((d) => d.name === 'Toughness');
  const capRow = (label, a, b) => {
    const total = a + b;
    const over = total > 2 * pl;
    return h('div', { class: 'cap' },
      h('span', null, label),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${label}: ${total} of ${2 * pl}` },
        h('i', { class: over ? 'over' : '', style: { width: `${Math.min(100, (total / (2 * pl)) * 100)}%` } })),
      h('span', { class: 'num', style: { color: over ? 'var(--bad)' : total === 2 * pl ? 'var(--good)' : 'var(--ink-2)' } }, `${total}/${2 * pl}`));
  };
  const defenses = h('section', { class: 'sec' },
    h('h3', null, 'Defenses', h('span', { class: 'pts' }, `${s.cost.defenses} pp`)),
    h('div', { class: 'defenses' }, s.defenses.map((d) => h('div', { class: 'def' },
      h('span', { class: 'name' }, d.name),
      h('span', { class: 'v num' }, d.name === 'Toughness' && d.noRoll !== d.value ? `${d.value}/${d.noRoll}` : d.value),
      h('span', { class: 'note' }, d.name === 'Toughness'
        ? `Stamina ${d.parts.stamina}${d.parts.protection ? ` + Protection ${d.parts.protection}` : ''}${d.parts.defensiveRoll ? ` + Defensive Roll ${d.parts.defensiveRoll}` : ''}`
        : d.bought ? `${d.bought} bought` : ''),
      editing && BUYABLE_DEFENSES.includes(d.name) ? stepper(d.bought, (x) => change((c) => { c.defenses[d.name] = Math.max(0, (c.defenses[d.name] || 0) + x); }), { min: 0, label: d.name }) : h('span')))),
    (() => {
      const dd = s.d.defenses;
      const cls = (v) => (typeof v === 'number' ? v + 10 : '—');
      const half = (v) => (typeof v === 'number' ? Math.ceil(v / 2) + 10 : '—');
      return h('div', { class: 'def-class', title: 'Defense class = defense + 10 (DC Adventures p. 51). Vulnerable halves defenses (round up); defenseless makes them 0.' },
        h('div', { class: 'label' }, 'Defense class (DC to affect you)'),
        h('div', { class: 'dc-row' },
          [['Close attacks', 'Parry', dd.Parry], ['Ranged attacks', 'Dodge', dd.Dodge], ['Mental powers', 'Will', dd.immune?.Will ? null : dd.Will]].map(([what, name, v]) =>
            h('div', { class: 'dc-box' }, h('b', { class: 'num' }, v == null ? 'Immune' : cls(v)), h('span', null, `${what} · ${name} + 10`),
              v == null || name === 'Will' ? null : h('small', null, `Vulnerable ${half(v)} · Defenseless 10`)))));
    })(),
    h('div', { class: 'caps' },
      capRow('Dodge + Toughness', s.d.defenses.Dodge, t.value),
      capRow('Parry + Toughness', s.d.defenses.Parry, t.value),
      capRow('Fortitude + Will', s.d.defenses.Fortitude, s.d.defenses.Will)));

  // ---- offense ----
  const offense = h('section', { class: 'sec' },
    h('h3', null, 'Offense', h('span', { class: 'pts' }, `Initiative ${sign(s.d.initiative)}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'offense' },
      h('thead', null, h('tr', null, h('th', null, 'Attack'), h('th', null, 'Check'), h('th', null, 'Effect'), h('th', null, 'PL limit'))),
      h('tbody', null, s.d.attacks.map((a) => {
        const used = a.roll ? a.bonus + a.rank : a.rank;
        const limit = a.roll ? 2 * pl : pl;
        return h('tr', null,
          h('td', null, a.name, a.alternate ? h('span', { style: { color: 'var(--ink-3)' } }, ' (AE)') : null),
          h('td', { class: 'n' }, a.roll ? sign(a.bonus) : a.kind === 'area' ? 'Area' : 'Perc.'),
          h('td', null, `${a.effect} ${a.rank}${a.resistance ? ` · ${a.resistance}` : ''}${a.crit && a.crit < 20 ? ` · crit ${a.crit}-20` : ''}`),
          h('td', null, h('span', { class: 'ok', style: used > limit ? { color: 'var(--bad)' } : null }, `${used}/${limit}`)));
      })))));

  // ---- powers ----
  const powerCard = (p, path, inDevice) => {
    const cost = powerCost(p, R);
    const alts = p.alternates || [];
    return h('div', { class: 'power' },
      h('div', { class: 'power-top' },
        h('span', { class: 'power-name' }, p.name),
        alts.length ? h('span', { class: 'chip' }, `${p.dynamic ? 'Dynamic ' : ''}Array`) : null,
        h('span', { class: 'power-cost num' }, inDevice ? `${cost} pp in device` : `${cost} pp`),
        editing ? h('span', { class: 'btn-row no-print' },
          stepper(p.rank, (d) => change((c) => { const q = getPower(c, path); q.rank = Math.max(1, q.rank + d); }), { min: 1, label: `${p.name} rank` }),
          h('button', { class: 'btn sm', type: 'button', onClick: () => opts.onEditPower?.(path) }, 'Open in Lab'),
          h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${p.name}`, onClick: () => change((c) => removeAt(c, path)) }, '✕')) : null),
      h('div', { class: 'power-text' }, describeEffect(p, R)),
      whatItDoes(p, R),
      alts.map((a, i) => h('div', { class: 'ae' },
        h('b', null, `${p.dynamic ? 'DAE' : 'AE'}: ${a.name} `), describeEffect(a, R), whatItDoes(a, R, true),
        editing ? h('span', { class: 'no-print' }, ' ',
          stepper(a.rank, (d) => change((c) => { const q = getPower(c, { ...path, alt: i }); q.rank = Math.max(1, q.rank + d); }), { min: 1, label: `${a.name} rank` }),
          h('button', { class: 'x', type: 'button', 'aria-label': `Remove ${a.name}`, onClick: () => change((c) => removeAt(c, { ...path, alt: i })) }, '✕')) : null)),
      h('details', { class: 'no-print' }, h('summary', null, 'Show the math'), mathTable(p, R), alts.length ? h('div', { class: 'math' }, `Alternate Effects: each costs ${p.dynamic ? 2 : 1} point${p.dynamic ? 's' : ''} and may cost no more than the primary effect on its own.`) : null));
  };
  const powers = h('section', { class: 'sec' },
    h('h3', null, 'Powers', h('span', { class: 'pts' }, `${s.cost.powers} pp`)),
    (ch.powers || []).map((p, i) => powerCard(p, { device: null, index: i })),
    (ch.devices || []).map((dev, di) => {
      const dc = s.devices[di];
      return h('div', { class: 'device' },
        h('div', { class: 'device-head' },
          h('b', null, dev.name),
          h('span', { class: 'chip' }, dev.kind === 'easily' ? 'Easily Removable' : 'Removable'),
          h('span', { class: 'power-cost num', title: `${dev.kind === 'easily' ? 'Easily Removable: −2' : 'Removable: −1'} point per full 5 points of the whole device (${dc.raw} points of powers)` }, `${dc.raw} pp of powers − ${dc.discount} ${dev.kind === 'easily' ? 'Easily Removable' : 'Removable'} (${dev.kind === 'easily' ? 2 : 1} per 5) = ${dc.total} pp`),
          editing ? h('button', { class: 'x no-print', type: 'button', 'aria-label': `Remove ${dev.name}`, onClick: () => change((c) => { c.devices.splice(di, 1); }) }, '✕') : null),
        dev.powers.map((p, i) => powerCard(p, { device: di, index: i }, true)));
    }),
    !ch.powers?.length && !ch.devices?.length ? h('p', { style: { color: 'var(--ink-3)', margin: 0 } }, 'No powers. All skill, training and gear.') : null,
    editing ? h('div', { class: 'add-row no-print' }, h('button', { class: 'btn', type: 'button', onClick: () => opts.onAddPower?.() }, '+ Add a power from the Power Lab')) : null);

  // ---- advantages ----
  const advNames = (R.raw.advantages || []).map((a) => a.name).sort();
  const advantages = h('section', { class: 'sec' },
    h('h3', null, 'Advantages', h('span', { class: 'pts' }, `${s.cost.advantages} pp`)),
    h('div', { class: 'adv-list' }, s.advantages.map((a) => {
      const def = R.advantage(a.name);
      const i = ch.advantages.findIndex((x) => x.name === a.name && (x.param || null) === (a.param || null));
      const max = def?.max_rank === 'half_pl' ? Math.floor(ch.pl / 2) : def?.max_rank;
      return h('div', { class: 'adv-row' },
        h('div', { class: 'adv-head' },
          h('b', null, a.name), a.param ? h('span', { class: 'adv-param' }, ` (${a.param})`) : null,
          (a.rank || 1) > 1 || def?.ranked ? h('span', { class: 'adv-rank num' }, `${a.rank || 1}${max ? ` / ${max}` : ''}`) : null,
          h('span', { class: 'adv-type' }, def ? `${def.type}${def.book ? ` · ${def.book}` : ''}` : ''),
          editing && def?.ranked ? stepper(a.rank || 1, (d) => change((c) => { const x = c.advantages[i]; x.rank = (x.rank || 1) + d; if (x.rank <= 0) c.advantages.splice(i, 1); }), { min: 0, label: a.name }) : null,
          editing ? h('button', { class: 'x no-print', type: 'button', 'aria-label': `Remove ${a.name}`, onClick: () => change((c) => { c.advantages.splice(i, 1); }) }, '✕') : null),
        def?.summary ? h('div', { class: 'adv-what' }, def.summary, (def.requires || []).length ? h('span', { class: 'adv-req' }, ` Requires ${def.requires.map((r) => r.replace(/^\w+:/, '')).join(', ')}.`) : null) : null);
    })),
    editing ? (() => {
      const nameIn = h('input', { type: 'text', list: 'adv-list', placeholder: 'Advantage', id: 'add-adv-name', 'aria-label': 'Advantage to add' });
      const paramIn = h('input', { type: 'text', placeholder: 'Detail (optional)', id: 'add-adv-param', 'aria-label': 'Advantage detail' });
      return h('div', { class: 'add-row no-print' },
        h('datalist', { id: 'adv-list' }, advNames.map((n) => h('option', { value: n }))),
        nameIn, paramIn,
        h('button', { class: 'btn', type: 'button', onClick: () => {
          const name = nameIn.value.trim();
          if (!R.advantage(name)) { nameIn.setCustomValidity('Pick an advantage from the list'); nameIn.reportValidity(); return; }
          change((c) => {
            const param = paramIn.value.trim() || undefined;
            const ex = c.advantages.find((x) => x.name === R.advantage(name).name && (x.param || undefined) === param);
            if (ex && R.advantage(name).ranked) ex.rank = (ex.rank || 1) + 1;
            else if (!ex) c.advantages.push(param ? { name: R.advantage(name).name, rank: 1, param } : { name: R.advantage(name).name, rank: 1 });
          });
        } }, 'Add'));
    })() : null);

  // ---- skills ----
  const skills = h('section', { class: 'sec' },
    h('h3', null, 'Skills', h('span', { class: 'pts' }, `${s.cost.skills} pp · ${s.cost.skillRanks} ranks`)),
    s.skills.length ? h('table', { class: 'skills' }, h('tbody', null, s.skills.map((k) => {
      const i = ch.skills.findIndex((x) => x.name === k.name && (x.spec || null) === (k.spec || null));
      const g = guideFor(R, k.name);
      return h('tr', null,
        h('td', null, g ? h('details', { class: 'skill-details' }, h('summary', null, k.label), skillGuideBody(g, { compact: true })) : k.label),
        h('td', { class: 'n' }, `${k.ranks} rank${k.ranks === 1 ? '' : 's'}`),
        h('td', { class: 'b' }, sign(k.bonus)),
        editing ? h('td', { class: 'no-print' }, stepper(k.ranks, (d) => change((c) => { const x = c.skills[i]; x.ranks += d; if (x.ranks <= 0) c.skills.splice(i, 1); }), { min: 0, label: k.label })) : null);
    }))) : h('p', { style: { color: 'var(--ink-3)', margin: 0 } }, 'No trained skills.'),
    (R.raw.skillGuide || []).length ? h('p', { class: 'hint no-print', style: { margin: '6px 0 0', fontSize: '12.5px', color: 'var(--ink-3)' } }, 'Tap a skill to see what it covers and its DCs. Full list: Rules > Skills or GM Tools > Skills.') : null,
    editing ? (() => {
      const sel = h('select', { id: 'add-skill', 'aria-label': 'Skill to add' }, R.raw.skills.map((k) => h('option', { value: k.name }, k.name)));
      const spec = h('input', { type: 'text', placeholder: 'Specialty (Expertise, Combat)', id: 'add-skill-spec', 'aria-label': 'Skill specialty' });
      return h('div', { class: 'add-row no-print' }, sel, spec, h('button', { class: 'btn', type: 'button', onClick: () => change((c) => {
        const name = sel.value;
        const sp = spec.value.trim() || (R.skill(name)?.specialized ? 'General' : undefined);
        const ex = c.skills.find((x) => x.name === name && (x.spec || undefined) === sp);
        if (ex) ex.ranks += 2; else c.skills.push(sp ? { name, spec: sp, ranks: 2 } : { name, ranks: 2 });
      }) }, 'Add 2 ranks'));
    })() : null);

  // ---- equipment ----
  const eqItems = [...(R.raw.equipment?.weapons || []), ...(R.raw.equipment?.armor || []), ...(R.raw.equipment?.gear || []).filter((g) => !/Vehicle/.test(g.category || ''))];
  const equipment = (ch.equipment?.length || editing) ? h('section', { class: 'sec' },
    h('h3', null, 'Equipment', h('span', { class: 'pts' }, `${(ch.equipment || []).reduce((t, e) => t + (e.cost || 0), 0)} ep`)),
    (ch.equipment || []).map((e, i) => h('div', { class: 'power' },
      h('div', { class: 'power-top' }, h('span', { class: 'power-name' }, e.name), h('span', { class: 'power-cost' }, `${e.cost} ep`),
        editing ? h('button', { class: 'x no-print', type: 'button', 'aria-label': `Remove ${e.name}`, onClick: () => change((c) => { c.equipment.splice(i, 1); }) }, '✕') : null),
      e.effect ? h('div', { class: 'power-text' }, e.effect) : null)),
    editing ? (() => {
      const sel = h('select', { id: 'add-equip', 'aria-label': 'Equipment to add' }, eqItems.map((it, i) => h('option', { value: i }, `${it.name} (${it.cost} ep)`)));
      return h('div', { class: 'add-row no-print' }, sel,
        h('button', { class: 'btn', type: 'button', onClick: () => change((c) => {
          const it = eqItems[Number(sel.value)];
          const item = { name: it.name, cost: it.cost, effect: it.effect };
          const prot = /Protection (\d+)/.exec(it.effect || '');
          if (prot && /Armor/.test(it.category || '')) item.protection = Number(prot[1]);
          const dmg = /(Ranged )?(?:Multiattack )?Damage (\d+)/.exec(it.effect || '');
          if (dmg && !/Area/.test(it.effect)) item.attack = { kind: dmg[1] ? 'ranged' : 'close', rank: Number(dmg[2]), strengthBased: !!it.strength_based, crit: it.crit };
          c.equipment = [...(c.equipment || []), item];
          const ep = c.equipment.reduce((t, e) => t + (e.cost || 0), 0);
          const need = Math.ceil(ep / 5);
          const adv = c.advantages.find((a) => a.name === 'Equipment');
          if (adv) adv.rank = Math.max(adv.rank, need); else c.advantages.push({ name: 'Equipment', rank: need });
        }) }, 'Add (raises Equipment if needed)'));
    })() : null) : null;

  // ---- story ----
  const per = ch.personality || {};
  const ap = ch.appearance || {};
  const story = h('section', { class: 'sec story' },
    h('h3', null, 'Story'),
    ch.origin?.text ? h('p', null, ch.origin.text) : null,
    h('dl', null,
      ch.goal ? [h('dt', null, 'Wants to'), h('dd', null, ch.goal)] : null,
      per.positive?.length ? [h('dt', null, 'Personality'), h('dd', null, [...per.positive, ...(per.negative || [])].join(', '))] : null,
      per.quirk ? [h('dt', null, 'Quirk'), h('dd', null, per.quirk)] : null,
      ap.costume ? [h('dt', null, 'Costume'), h('dd', null, ap.costume)] : null,
      ap.height ? [h('dt', null, 'Looks'), h('dd', null, [ap.height, ap.weight ? `${ap.weight} lb` : null, ap.eyes && `${ap.eyes} eyes`, ap.hair && `${ap.hair} hair`, ap.skin && `${ap.skin} skin`, ap.feature].filter(Boolean).join(' · '))] : null,
      id.homeland ? [h('dt', null, 'From'), h('dd', null, `${id.homeland.country}${id.homeland.region && id.homeland.region !== id.homeland.country ? `, ${id.homeland.region}` : ''}`)] : null,
      id.languages?.length ? [h('dt', null, 'Languages'), h('dd', null, id.languages.join(', '))] : null),
    h('div', { style: { marginTop: '12px' } },
      h('div', { class: 'label', style: { marginBottom: '6px' } }, 'Complications'),
      (ch.complications || []).map((x, i) => h('div', { class: 'comp' }, h('b', null, x.type,
        editing ? h('button', { class: 'x no-print', type: 'button', 'aria-label': `Remove ${x.type}`, onClick: () => change((c) => { c.complications.splice(i, 1); }) }, '✕') : null), x.text)),
      editing ? (() => {
        const type = h('input', { type: 'text', placeholder: 'Type (Enemy, Secret...)', id: 'add-comp-type', 'aria-label': 'Complication type' });
        const text = h('input', { type: 'text', placeholder: 'What it means for them', id: 'add-comp-text', 'aria-label': 'Complication text' });
        return h('div', { class: 'add-row no-print' }, type, text, h('button', { class: 'btn', type: 'button', onClick: () => {
          if (!type.value.trim()) return;
          change((c) => { c.complications = [...(c.complications || []), { type: type.value.trim(), text: text.value.trim() }]; });
        } }, 'Add'));
      })() : null),
    editing
      ? h('label', { class: 'field', style: { marginTop: '12px' } }, h('span', null, 'Notes'),
        h('textarea', { id: 'edit-notes', onChange: (e) => change((c) => { c.notes = e.target.value; }) }, ch.notes || ''))
      : ch.notes ? h('p', { style: { marginTop: '10px' } }, h('b', null, 'Notes: '), ch.notes) : null);

  // ---- points and legality ----
  const c = s.cost;
  const parts = [
    ['Abilities', c.abilities, '#d1495b'], ['Powers', c.powers, '#2f6fde'], ['Advantages', c.advantages, '#e0a030'],
    ['Skills', c.skills, '#3aa17e'], ['Defenses', c.defenses, '#8a5cd6'],
  ];
  const denom = Math.max(c.budget, c.total, 1);
  const points = h('section', { class: 'sec points' },
    h('h3', null, 'Power points', h('span', { class: 'pts num' }, `${c.total} / ${c.budget}`)),
    h('div', { class: 'points-bar', role: 'img', 'aria-label': parts.map(([n, v]) => `${n} ${v}`).join(', ') },
      parts.map(([, v, col]) => h('i', { style: { width: `${(Math.max(0, v) / denom) * 100}%`, background: col } }))),
    h('div', { class: 'legend' }, parts.map(([n, v, col]) => h('span', { style: { '--c': col } }, `${n} ${v}`))),
    s.issues.length ? h('ul', { class: 'issues' }, s.issues.map((i) => h('li', { class: i.severity }, i.message))) : null);

  const file = h('article', { class: `file ${opts.fresh ? 'fresh' : ''}` },
    head,
    opts.toolbar || null,
    h('div', { class: 'file-body' },
      h('div', { class: 'col' }, abilities, defenses, offense, powers),
      h('div', { class: 'col' }, advantages, skills, equipment, story, points)));
  file.style.setProperty('--hero', hero);
  file.style.setProperty('--hero-ink', inkFor(hero));
  return { el: file, sheet: s };
}

// ---- power paths ----

export function getPower(ch, path) {
  const list = path.device == null ? ch.powers : ch.devices[path.device].powers;
  const p = list[path.index];
  return path.alt == null ? p : p.alternates[path.alt];
}

export function removeAt(ch, path) {
  const list = path.device == null ? ch.powers : ch.devices[path.device].powers;
  if (path.alt != null) { list[path.index].alternates.splice(path.alt, 1); return; }
  list.splice(path.index, 1);
  if (path.device != null && !list.length) ch.devices.splice(path.device, 1);
}

export function setPower(ch, path, p) {
  const list = path.device == null ? ch.powers : ch.devices[path.device].powers;
  if (path.alt != null) list[path.index].alternates[path.alt] = p;
  else list[path.index] = p;
}

export { ABILITIES };
