// The Attack extra (Hero's Handbook p128): a personal effect made into a close range attack on someone else, which the
// target resists (Dodge or Will, set when it is built; Will unless the power says otherwise). A Teleport Attack sends the
// target away (attack-form-effect.js). Other effects with the Attack extra (Shrinking, Insubstantial, Morph...) have no
// rule here yet and are left out of the fight when the attacks are built (`formOk` stays unset).
// This file sits low (combatant.js builds attacks with it) and imports nothing.

const FORMS = ['Teleport'];

/** Does the engine know what this effect does as an Attack? */
export const supportsForm = (effect) => FORMS.includes(effect);

/**
 * Called as an attack is built. An Attack extra on an effect that is an attack already changes nothing. On a personal effect
 * the engine knows (Teleport) it sets the target's resistance (Will, or the one the power names) and a control value for the
 * AI; on any other it leaves the attack unmarked (`formOk`), and the fight leaves it out.
 */
export function formAttack(atk, p, eff) {
  if (!atk.ex?.attackForm) return;
  if (eff.attack === true || eff.type === 'Attack') { atk.formOk = true; atk.ex = { ...atk.ex, attackForm: false }; return; }
  if (!supportsForm(atk.effect)) return;
  const named = /resisted by ([A-Za-z]+)/i.exec(String(p?.detail || ''))?.[1];
  atk.formOk = true;
  atk.resistance = named ? named[0].toUpperCase() + named.slice(1).toLowerCase() : 'Will';
  atk.tiers = [['Stunned']]; atk.maxDegree = 1;
}
