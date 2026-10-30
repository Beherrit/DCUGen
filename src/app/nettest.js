// Table connection settings and the connection test: can this network open or join a phone table?

import { h, toast, openDialog } from './dom.js';
import { peerServer, peerIce, setPeerIce, iceServersFor } from './lobby.js';
import { parseIceServers, formatIceServers, hasRelay, summarizeConnectionTest, DEFAULT_STUN } from '../engine/netdiag.js';

/** Does the matchmaking server answer? Opens a throwaway PeerJS connection. */
function brokerAnswers(ms = 8000) {
  return new Promise((resolve) => {
    const P = window.peerjs?.Peer;
    if (!P) { resolve(false); return; }
    const s = peerServer();
    let peer;
    const done = (ok) => { clearTimeout(t); try { peer?.destroy(); } catch { /* ignore */ } resolve(ok); };
    const t = setTimeout(() => done(false), ms);
    try {
      peer = new P(undefined, s ? { host: s.host, port: s.port || (s.secure === false ? 80 : 443), path: s.path || '/', secure: s.secure !== false, debug: 0 } : { debug: 0 });
      peer.on('open', () => done(true));
      peer.on('error', () => done(false));
    } catch { done(false); }
  });
}

/** The kinds of address this browser can offer another one: host, srflx (public, via STUN), relay (TURN). */
async function gatherCandidateTypes(iceServers, ms = 6000) {
  if (typeof RTCPeerConnection === 'undefined') return [];
  const pc = new RTCPeerConnection({ iceServers });
  const types = new Set();
  try {
    pc.createDataChannel('test');
    await new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(t); resolve(); return; }
        const m = / typ (host|srflx|prflx|relay)/.exec(e.candidate.candidate);
        if (m) types.add(m[1] === 'prflx' ? 'srflx' : m[1]);
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => { clearTimeout(t); resolve(); });
    });
  } finally { pc.close(); }
  return [...types];
}

/** Run the test and show what it found. */
export async function testConnection() {
  const body = h('div', { class: 'nettest' }, h('p', { style: { margin: 0 } }, 'Testing this network… (up to 15 seconds)'));
  const shown = openDialog({ title: 'Connection test', body });
  const relays = peerIce();
  const [broker, types] = await Promise.all([brokerAnswers(), gatherCandidateTypes(iceServersFor(null) || DEFAULT_STUN)]);
  const res = summarizeConnectionTest({ broker, types, relayConfigured: hasRelay(relays) });
  body.replaceChildren(
    h('ul', { class: 'nettest-rows' }, res.rows.map((r) => h('li', { class: r.ok ? 'ok' : 'bad' }, h('b', null, `${r.ok ? 'OK' : 'Failed'}: ${r.label}`), h('span', null, r.text)))),
    h('p', { class: `nettest-verdict ${res.ok ? 'ok' : 'bad'}` }, res.verdict),
  );
  return shown;
}

/** Connection settings: the table's own PeerJS server and relay (TURN) servers. Both travel in the table link. */
export function connectionSettings() {
  const cur = peerServer();
  const serverIn = h('input', { type: 'text', placeholder: 'host[:port][/path], e.g. peer.example.com/myapp', value: cur ? `${cur.host}${cur.port ? `:${cur.port}` : ''}${cur.path && cur.path !== '/' ? cur.path : ''}` : '', 'aria-label': 'PeerJS server' });
  const iceIn = h('textarea', { rows: 3, placeholder: 'turn:relay.example.com:3478 username password', 'aria-label': 'Relay servers', spellcheck: false }, formatIceServers(peerIce()));
  const save = () => {
    const v = serverIn.value.trim();
    const m = /^(?:https?:\/\/)?([^:/\s]+)(?::(\d+))?(\/\S*)?$/.exec(v);
    if (v && !m) { toast('That PeerJS server address doesn\'t look right'); return; }
    const ice = parseIceServers(iceIn.value);
    const lines = iceIn.value.split(/\r?\n/).filter((l) => l.trim()).length;
    try {
      if (!v) localStorage.removeItem('dcugen.peer.server');
      else localStorage.setItem('dcugen.peer.server', JSON.stringify({ host: m[1], port: m[2] ? Number(m[2]) : undefined, path: m[3] || '/', secure: !/^http:/.test(v) && m[1] !== 'localhost' }));
      setPeerIce(ice);
      toast(ice.length < lines ? `Saved. ${lines - ice.length} relay line${lines - ice.length > 1 ? 's' : ''} skipped: use "turn:host:port username password"` : 'Saved. Open the table again for players to use it.');
    } catch { toast('Couldn\'t save'); }
  };
  return h('details', { class: 'tb-server' }, h('summary', null, 'Connection settings'),
    h('div', null,
      h('p', { class: 'hint' }, 'Optional. Everyone at the table uses the GM\'s settings: they travel in the table link.'),
      h('label', { class: 'field' }, h('span', null, 'PeerJS server (empty: the free public one)'), serverIn),
      h('label', { class: 'field' }, h('span', null, 'Relay (TURN) servers, one per line'), iceIn),
      h('p', { class: 'hint', style: { margin: 0 } }, 'A relay carries the table when two networks can\'t connect directly (school, work, some phone carriers). Free and paid TURN services work; the username and password go to your players in the link.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn sm primary', type: 'button', onClick: save }, 'Save'), h('button', { class: 'btn sm', type: 'button', onClick: testConnection }, 'Test my connection'))));
}
