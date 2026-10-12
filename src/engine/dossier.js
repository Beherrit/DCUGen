// The whole character in one place: every alternate form and every companion, for exports and print.

import { statBlockText } from './render.js';
import { formCharacters, hasForms } from './forms.js';
import { companionsOf, companionBudget, COMPANION_KINDS } from './companions.js';
import { poolPowers, poolSpent, poolAvailable, fmtPoints } from './pools.js';

/** Every build to show, labeled: [{ title, ch, kind: 'form' | 'companion', note }]. */
export function dossierEntries(ch, R) {
  const out = [];
  const forms = formCharacters(ch);
  forms.forEach((f, i) => {
    const label = hasForms(ch) ? `Form ${i + 1}: ${ch.forms[i].name}` : (ch.identity?.codename || 'Character');
    // Exports that name things by codename need each form to stand out.
    const named = hasForms(ch) ? { ...f, identity: { ...f.identity, codename: `${f.identity?.codename || 'Unnamed'} (${ch.forms[i].name})` } } : f;
    out.push({ title: label, ch: named, kind: 'form', note: hasForms(ch) && i === (ch.activeForm || 0) ? 'the form in play now' : '' });
  });
  for (const comp of companionsOf(ch)) {
    const kind = COMPANION_KINDS[comp.companionKind] || COMPANION_KINDS.companion;
    const b = companionBudget(ch, comp, R);
    out.push({ title: `${kind.label}: ${comp.identity?.codename || 'Companion'}`, ch: comp, kind: 'companion', note: b.message });
  }
  return out;
}

/** Pool and drain state, as text lines. */
function trackerLines(ch, R) {
  const lines = [];
  for (const { power } of poolPowers(ch)) {
    lines.push(`${power.name}: pool ${fmtPoints(poolSpent(ch, power, R))}/${fmtPoints(poolAvailable(ch, power, R))} pp placed${(power.placed || []).length ? ` (${power.placed.map((x) => `${x.target === 'other' ? x.note || 'other' : x.target.replace(/^(skill|power):/, '')} +${x.points}`).join(', ')})` : ''}`);
  }
  const visit = (list) => (list || []).forEach((p) => { if (p.effect === 'Weaken' && p.drained) lines.push(`${p.name}: ${p.drained}/${p.rank} power points drained and held`); });
  visit(ch.powers);
  return lines;
}

/** One text file with every form and companion. */
export function dossierText(ch, R) {
  const entries = dossierEntries(ch, R);
  if (entries.length === 1) {
    const t = trackerLines(ch, R);
    return statBlockText(ch, R) + (t.length ? `\n\nIn play now:\n  ${t.join('\n  ')}\n` : '');
  }
  const bar = '='.repeat(64);
  return entries.map((e) => {
    const t = trackerLines(e.ch, R);
    return `${bar}\n${e.title.toUpperCase()}${e.note ? `  (${e.note})` : ''}\n${bar}\n${statBlockText(e.ch, R)}${t.length ? `\n\nIn play now:\n  ${t.join('\n  ')}` : ''}`;
  }).join('\n\n\n') + '\n';
}
