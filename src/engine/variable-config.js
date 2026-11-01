// Variable configurations (DCA 121). A Variable effect gives rank x 5 power points to allocate to effects of
// its descriptor, taking its action to change them, and the book suggests a "menu" of commonly used options
// written down in advance. Here each Variable can keep that menu: named configurations, each a list of powers
// built in the Power Lab, priced against rank x 5 and held to the power level limits like any other effect.
//
// Stored on the Variable power:
//   p.configs = [{ id, name, powers: [power, ...], note? }]
//   p.activeConfig = id of the configuration in use, or absent
// While one is active its powers count on the sheet, in Play and in the Battle Room (active-powers.js).

import { powerCost } from './costs.js';
import { activeConfigOf, variablesOf, stripTemp } from './active-powers.js';

export { activeConfigOf, variablesOf };

const clone = (x) => JSON.parse(JSON.stringify(x));

/** The power points a Variable has to allocate: 5 per rank. */
export const configCapacity = (p) => (p?.rank || 0) * 5;

/** What a configuration costs: the full price of each of its powers. */
export function configCost(cfg, R) {
  return (cfg?.powers || []).reduce((s, p) => {
    try { return s + powerCost(p, R); } catch { return s; }
  }, 0);
}

/** A short summary of a configuration, like "Flight 8, Damage 10". */
export function configSummary(cfg) {
  const list = (cfg?.powers || []).map((p) => `${p.name && p.name !== p.effect ? `${p.name} (${p.effect} ${p.rank})` : `${p.effect} ${p.rank}`}`);
  return list.length ? list.join(', ') : 'nothing yet';
}

/** The action it takes to switch configurations: a standard action (the Variable's own), or a reaction with the Reaction extra. */
export function switchAction(p) {
  return (p.extras || []).some((m) => m.name === 'Reaction') ? 'reaction' : 'standard';
}

let seq = 0;
const newId = () => `cfg-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Add a configuration to a Variable power. Mutates p and returns the new configuration. */
export function addConfig(p, { name, powers = [] } = {}) {
  p.configs = p.configs || [];
  const cfg = { id: newId(), name: name || `Configuration ${p.configs.length + 1}`, powers: clone(powers) };
  p.configs.push(cfg);
  return cfg;
}

/** Remove a configuration. Mutates p. */
export function removeConfig(p, id) {
  p.configs = (p.configs || []).filter((c) => c.id !== id);
  if (p.activeConfig === id) delete p.activeConfig;
  if (!p.configs.length) delete p.configs;
}

/** Copy a configuration (for a variant). Mutates p and returns the copy. */
export function duplicateConfig(p, id) {
  const src = (p.configs || []).find((c) => c.id === id);
  if (!src) return null;
  return addConfig(p, { name: `${src.name} (copy)`, powers: src.powers });
}

function variableAt(ch, ref) {
  const vars = variablesOf(ch);
  if (ref == null) return vars[0]?.power || null;
  if (typeof ref === 'string') return vars.find((v) => v.power.name === ref)?.power || null;
  return vars.find((v) => v.path.device === (ref.device ?? null) && v.path.index === ref.index)?.power || null;
}

/**
 * Switch a Variable to a configuration (or to none with id null). ref is the Variable's name or its path
 * { device, index }; null means the first Variable. Returns a new character; ch is not changed.
 */
export function setActiveConfig(ch, ref, id) {
  const c = clone(stripTemp(ch));
  const p = variableAt(c, ref);
  if (!p) return c;
  if (id && (p.configs || []).some((x) => x.id === id)) p.activeConfig = id;
  else delete p.activeConfig;
  return c;
}

/** Every configuration on the character: [{ variable, path, config, cost, capacity, active }]. */
export function allConfigs(ch, R) {
  const out = [];
  for (const { power, path } of variablesOf(ch)) {
    for (const config of power.configs || []) {
      out.push({ variable: power, path, config, cost: configCost(config, R), capacity: configCapacity(power), active: power.activeConfig === config.id });
    }
  }
  return out;
}

/** The character with exactly one configuration on (for checking it against the limits). */
export function withOnlyConfig(ch, variable, id) {
  const c = clone(stripTemp(ch));
  for (const { power } of variablesOf(c)) {
    if (power.name === variable.name && (power.configs || []).some((x) => x.id === id)) power.activeConfig = id;
    else delete power.activeConfig;
  }
  if (c.inventions) c.inventions = c.inventions.map((i) => (i.status === 'active' ? { ...i, status: 'shelved' } : i));
  return c;
}

/** The text for the stat block: "Configurations: Blaster (Damage 12, 24 pp); Flier (Flight 10, 20 pp)". */
export function configsText(p, R) {
  if (!(p.configs || []).length) return '';
  return `Configurations (${configCapacity(p)} pp): ${p.configs.map((c) => `${c.name}${p.activeConfig === c.id ? ' [active]' : ''} (${configSummary(c)}; ${configCost(c, R)} pp)`).join('; ')}`;
}
