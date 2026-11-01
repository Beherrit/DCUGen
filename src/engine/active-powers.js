// Powers that are on only for now: the configuration a Variable is set to (DCA 121) and the inventions and
// rituals working this scene (DCA 145-146). They are stored apart from the build (on the Variable power as
// p.configs, and on the character as ch.inventions) and are put into ch.powers only while they are on, each
// marked p.temp = { kind, source, label }. They cost nothing on the build: the Variable's own rank paid for the
// configuration, and an invention is paid for with time, skill and hero points.
//
// This module has no imports so derive.js, costs.js and the battle engine can all use it.

const clone = (x) => JSON.parse(JSON.stringify(x));

/** True for a power that is only on for now (a Variable configuration or an invention). */
export const isTemp = (p) => !!p?.temp;

/** Every Variable power on the character with where it lives (top-level powers and devices, not AEs). */
export function variablesOf(ch) {
  const out = [];
  (ch?.powers || []).forEach((p, index) => { if (p.effect === 'Variable' && !p.temp) out.push({ power: p, path: { device: null, index } }); });
  (ch?.devices || []).forEach((d, di) => (d.powers || []).forEach((p, index) => { if (p.effect === 'Variable') out.push({ power: p, path: { device: di, index } }); }));
  return out;
}

/** The configuration a Variable is set to, or null. */
export function activeConfigOf(p) {
  if (!p?.activeConfig) return null;
  return (p.configs || []).find((c) => c.id === p.activeConfig) || null;
}

/** The powers of the active configurations and the inventions in use, ready to add to ch.powers. */
export function activeInjections(ch) {
  const out = [];
  for (const { power: v } of variablesOf(ch)) {
    const cfg = activeConfigOf(v);
    if (!cfg) continue;
    for (const p of cfg.powers || []) out.push({ ...clone(p), temp: { kind: 'config', source: v.name, label: cfg.name } });
  }
  for (const inv of ch?.inventions || []) {
    if (inv.status !== 'active' || !inv.power) continue;
    out.push({ ...clone(inv.power), temp: { kind: inv.kind === 'ritual' ? 'ritual' : 'invention', source: inv.id, label: inv.power.name } });
  }
  return out;
}

/** The character with whatever is on right now added to its powers. Returns ch itself when nothing is. */
export function withActive(ch) {
  if (!ch || (ch.powers || []).some(isTemp)) return ch;
  const extra = activeInjections(ch);
  return extra.length ? { ...ch, powers: [...(ch.powers || []), ...extra] } : ch;
}

/** The character as built: nothing temporary in its powers, no configuration active, no invention in use. */
export function asBuilt(ch) {
  if (!ch) return ch;
  const vars = variablesOf(ch).filter(({ power }) => power.activeConfig);
  const inUse = (ch.inventions || []).some((i) => i.status === 'active');
  const temp = (ch.powers || []).some(isTemp);
  if (!vars.length && !inUse && !temp) return ch;
  const c = clone(ch);
  c.powers = (c.powers || []).filter((p) => !isTemp(p));
  for (const { power } of variablesOf(c)) delete power.activeConfig;
  if (c.inventions) c.inventions = c.inventions.map((i) => (i.status === 'active' ? { ...i, status: 'shelved' } : i));
  return c;
}

/** Take the temporary powers back out (for saving a character that went through withActive). */
export function stripTemp(ch) {
  if (!ch || !(ch.powers || []).some(isTemp)) return ch;
  return { ...ch, powers: ch.powers.filter((p) => !isTemp(p)) };
}
