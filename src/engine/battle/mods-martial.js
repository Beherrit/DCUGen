// The kinds of temporary change a martial artist's stance (and the fighting style's extras) make, for mods.js to apply and
// take off. Each change is { kind, ... } and mods.js calls `shiftMartial` with sign 1 to apply it and -1 to take it off.
//
//   tune     { id, bonus, rank, reach, src }   one attack (by id): attack check, effect rank, feet of reach; `src` names it in the log
//   init     { amount }                        initiative bonus
//   active   { trait, amount }                 Dodge or Parry as an active defense only (High stance)
//   resist   { trait, amount }                 Dodge as a resistance check only (Reactive stance)
//   skill    { name, amount }                  a skill bonus (Deception for a feint)
//   flag     { flag }                          immobile, hindered or vulnerable while the stance is held (conditions.js reads them)
//   swap     {}                                Parry is at least Dodge (Avoiding stance)
//   defend   { key, amount }                   a bonus against a kind of effect: knockback, trip, throw, push (see stanceDefense)

const bump = (obj, key, n) => { obj[key] = (obj[key] || 0) + n; };

/** Name an attack's bonus from a source, so the fight log can show where it came from. */
function note(a, src, n) {
  if (!src || !n) return;
  a.bn = { ...(a.bn || {}) };
  a.bn[src] = (a.bn[src] || 0) + n;
  if (!a.bn[src]) delete a.bn[src];
}

function tune(c, m, n) {
  const a = c.attacks.find((x) => x.id === m.id);
  if (!a) return;
  if (m.bonus && a.roll && a.bonus !== null) { a.bonus += n * m.bonus; note(a, m.src, n * m.bonus); }
  if (m.rank) a.rank += n * m.rank;
  if (m.reach && a.range === 'close') a.reachFt = (a.reachFt || 0) + n * m.reach;
}

/** Apply (sign 1) or take off (sign -1) a martial change. Returns false when the change is not one of these kinds. */
export function shiftMartial(c, m, sign) {
  const n = sign * (m.amount || 0);
  if (m.kind === 'tune') tune(c, m, sign);
  else if (m.kind === 'init') c.initBonus += n;
  else if (m.kind === 'active') { c.actDef ||= {}; bump(c.actDef, m.trait, n); }
  else if (m.kind === 'resist') { c.resDef ||= {}; bump(c.resDef, m.trait, n); }
  else if (m.kind === 'skill') { if (typeof c.skills?.[m.name] === 'number') c.skills[m.name] += n; }
  else if (m.kind === 'flag') {
    c.stanceFlags ||= [];
    if (sign > 0) c.stanceFlags.push(m.flag);
    else { const at = c.stanceFlags.indexOf(m.flag); if (at >= 0) c.stanceFlags.splice(at, 1); }
  } else if (m.kind === 'swap') c.dodgeForParry = Math.max(0, (c.dodgeForParry || 0) + sign);
  else if (m.kind === 'defend') { c.stanceDef ||= {}; bump(c.stanceDef, m.key, n); }
  else return false;
  return true;
}

/** What a stance (or a style extra) adds against a kind of effect: 'knockback' (ranks), 'trip', 'throw', 'push'. */
export const stanceDefense = (c, key) => c.stanceDef?.[key] || 0;
