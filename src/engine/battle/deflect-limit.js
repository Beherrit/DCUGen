// What a limited Deflect works on (Limited, Hero's Handbook p131). The limit can be written many ways on a sheet: a Limited
// flaw ("fire only", "to lightning"), or words in the power's descriptors, detail or name ("resistance to psionic", "fire
// only", "only fire and cold", "Deflect (Lightning Only)", "ranged attacks only"). A word that only says what the power
// looks like ("fire", "force field", a power named Lightning Shield) is no limit: a Deflect made of fire stops anything.
// A limit on when it works ("only while flying", "only in water") is not about the attack, so it is not read here.

import { canonical } from './descriptors.js';

const NAMED = /\b(?:resist\w*\s+to|protect\w*\s+(?:from|against)|defen[cs]e\s+(?:from|against)|limited\s+to|only\s+(?:against|vs\.?|versus)|only|against|versus|vs\.?)\s+([^.;]+)/i;
const TRAILING = /^(.*?)\s*\(?\bonly\b\)?\s*[.;]?\s*$/i;
const CONDITION = /\b(?:while|when|during|if|unless|in|at|after|before)\b/i;

/** The descriptors and attack kinds ('ranged', 'close') one piece of text limits a Deflect to. */
function readLimit(text) {
  const t = String(text || '').trim();
  const what = (NAMED.exec(t) || TRAILING.exec(t))?.[1];
  if (!what || CONDITION.test(what)) return [];
  const kinds = [];
  if (/\branged\b/i.test(what)) kinds.push('ranged');
  if (/\b(?:close|melee|hand[- ]to[- ]hand)\b/i.test(what)) kinds.push('close');
  if (/\bphysical\b/i.test(what)) kinds.push('physical'); // a family word, carried on every physical attack's descriptors
  return [...canonical(what), ...kinds];
}

/** A Limited flaw as text: its name, option and notes, read as "limited to ...". */
function flawText(f) {
  const rest = [String(f.name || '').replace(/^limited(?:\s+to)?:?\s*/i, ''), f.option, f.detail, f.note, f.text].filter(Boolean).join(' ');
  return `limited to ${rest.replace(/^to\s+/i, '')}`;
}

/** What this Deflect power is limited to: a list of descriptors and attack kinds, or null when it names no limit. */
export function deflectLimit(p) {
  const limited = (p.flaws || []).filter((f) => /limited/i.test(f.name || '')).map(flawText);
  const only = [...(p.descriptors || []), p.detail, p.name, ...limited].flatMap(readLimit);
  return only.length ? [...new Set(only)] : null;
}

/** Does a limit cover this attack? `only` is deflectLimit's list. */
export function limitCovers(only, atk) {
  if (!only) return true;
  return only.some((x) => (x === 'ranged' || x === 'close' ? (atk.range ?? atk.kind) === x : (atk.descriptors || []).includes(x)));
}
