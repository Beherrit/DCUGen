// Phone-table connections: why a join failed (in words a player can act on), relay (TURN) server settings,
// and what a connection test found. No browser APIs here, so it can be tested.

/** Default STUN server for the connection test (PeerJS uses the same kind by default). */
export const DEFAULT_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Explain a failed join. `stage` is how far it got: 'broker' (never reached the matchmaking server),
 * 'reach' (found the table, but no direct connection opened), 'hello' (connected, but the table never let us
 * in). `error` is PeerJS's error type when there is one; `relay` says whether the table has a relay server.
 * Returns { title, text, tips }.
 */
export function explainJoinFailure({ stage, error = '', relay = false } = {}) {
  if (error === 'peer-unavailable') {
    return { title: 'The table is closed', text: 'The table isn\'t open any more, or the link is old.', tips: ['Ask the GM to open the table again and send a new link.', 'The GM\'s page has to stay open (on a phone, keep the screen on).'] };
  }
  if (error === 'browser-incompatible') {
    return { title: 'This browser can\'t join', text: 'This browser can\'t make browser-to-browser connections.', tips: ['Use a current Chrome, Edge, Firefox or Safari.', 'Private or "lockdown" modes can turn this off.'] };
  }
  if (stage === 'broker' || ['network', 'server-error', 'socket-error', 'socket-closed'].includes(error)) {
    return { title: 'Couldn\'t reach the matchmaking server', text: 'The free server that introduces the GM\'s browser to yours didn\'t answer.', tips: ['Check that you\'re online.', 'School, work and hotel Wi-Fi often block it: try mobile data.', 'The GM can use the table\'s own PeerJS server under Connection settings.'] };
  }
  if (stage === 'reach') {
    return {
      title: 'Found the table, but couldn\'t connect',
      text: 'Your network and the GM\'s won\'t let the two browsers talk directly.',
      tips: [
        'Get on the same Wi-Fi as the GM, or switch to mobile data.',
        'Strict networks (school, work, some phone carriers) block direct connections.',
        relay ? 'The table has a relay server, but it didn\'t answer either: check its address and password with the GM.' : 'The GM can add a relay (TURN) server under Connection settings, which gets through almost any network.',
      ],
    };
  }
  if (stage === 'hello') {
    return { title: 'The table didn\'t let you in', text: 'You reached the table, but it never answered.', tips: ['Ask the GM for a fresh link: the table may have been closed and opened again.'] };
  }
  return { title: 'The connection failed', text: 'Something went wrong joining the table.', tips: ['Try again, or ask the GM for a new link.'] };
}

/**
 * Relay and STUN servers, one per line: "turn:relay.example.com:3478 username password" or
 * "stun:stun.example.com:3478". Returns RTCIceServer objects; lines that aren't servers are skipped.
 */
export function parseIceServers(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const [urls, username, credential] = line.trim().split(/\s+/);
    if (!urls || !/^(stun|stuns|turn|turns):[^\s]+$/i.test(urls)) continue;
    const s = { urls };
    if (/^turns?:/i.test(urls)) {
      if (!username || !credential) continue; // a relay without its login can't work
      s.username = username; s.credential = credential;
    }
    out.push(s);
  }
  return out;
}

export function formatIceServers(list) {
  return (list || []).map((s) => [s.urls, s.username, s.credential].filter(Boolean).join(' ')).join('\n');
}

export const hasRelay = (list) => (list || []).some((s) => /^turns?:/i.test(String(s.urls)));

/**
 * What a connection test found. `broker`: the matchmaking server answered. `types`: the ICE candidate types
 * gathered ('host', 'srflx', 'relay'). `relayConfigured`: a TURN server was set. Returns rows
 * { label, ok, text } and an overall verdict.
 */
export function summarizeConnectionTest({ broker, types = [], relayConfigured = false }) {
  const has = (t) => types.includes(t);
  const rows = [
    { label: 'Matchmaking server', ok: !!broker, text: broker ? 'Reached.' : 'No answer. Your network may block it; try mobile data.' },
    { label: 'Your public address', ok: has('srflx'), text: has('srflx') ? 'Found: direct connections should work on most networks.' : 'Not found: this network blocks the usual way browsers find each other.' },
  ];
  if (relayConfigured) rows.push({ label: 'Relay (TURN) server', ok: has('relay'), text: has('relay') ? 'Answered: it can carry the table when nothing else gets through.' : 'Didn\'t answer: check its address, username and password.' });
  let verdict;
  if (!broker) verdict = 'You won\'t be able to open or join a phone table from this network.';
  else if (has('relay')) verdict = 'Good to go, even on strict networks.';
  else if (has('srflx')) verdict = 'Good to go on most networks. If someone can\'t connect, a relay (TURN) server will fix it.';
  else verdict = 'Joining will probably fail from this network unless the table has a relay (TURN) server.';
  return { rows, verdict, ok: !!broker && (has('srflx') || has('relay')) };
}

/** How long to wait before reconnect attempt n (0-based), in milliseconds: 1s, 2s, 4s, 8s, then 15s. */
export function reconnectDelay(n) {
  return Math.min(15000, 1000 * 2 ** Math.max(0, n));
}
