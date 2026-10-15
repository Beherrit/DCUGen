// Who may change what at a table. The host (the GM) is the authority: players only ever see the characters
// the GM shares, and can only change or delete characters that are theirs. Pure rules, so they can be tested.

/** Is this character part of the table (shared by the GM, brought by a player, or claimed)? */
export function sharedWithTable(ch) {
  return !!(ch && (ch.tableShared || ch.lobbyShared || ch.lobbyOwner));
}

/** The characters the host sends a player who joins: never the GM's private roster. */
export function tableRoster(roster) {
  return (roster || []).filter(sharedWithTable);
}

/** Host: may player `from` save this character? New ones become theirs; existing ones only if they own it. */
export function hostAcceptsEdit(existing, from) {
  if (!from) return false;
  return !existing || existing.lobbyOwner === from;
}

/** Host: may player `from` delete this character? Only their own. */
export function hostAcceptsRemove(existing, from) {
  return !!existing && !!from && existing.lobbyOwner === from;
}

/** Host: may player `from` claim this character? Only one the GM shared and nobody has claimed. */
export function hostAcceptsClaim(existing, from) {
  return !!existing && !!from && sharedWithTable(existing) && (!existing.lobbyOwner || existing.lobbyOwner === from);
}

/**
 * Should a change to this character go to the table? The host sends what is shared; a player sends their
 * own characters, never the copies of the GM's that they were shown.
 */
export function shouldSendToTable(ch, { role, me }) {
  if (!ch) return false;
  if (role === 'host') return sharedWithTable(ch);
  return !ch.lobbyShared || (!!me && ch.lobbyOwner === me);
}

// ---- who is who: a player keeps the same id at the table across reconnects ------------------------------------
// Each browser keeps a private random secret and sends it with its hello; the table shows only a hash of it, so
// a player's characters stay theirs after a reload, and nobody can copy someone else's id from the member list.

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).padStart(7, '0');
}

/** The public member id for a device secret, or null when the secret is missing or malformed. */
export function memberIdFor(secret) {
  const s = String(secret || '');
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(s)) return null;
  return `u${fnv1a(s, 2166136261)}${fnv1a(s, 0x9e3779b9)}`;
}
