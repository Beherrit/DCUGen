// The battle map in 3D (three.js). The ground sets the scene (a grass field under a blue sky, city
// asphalt, desert sand, snow, a torch-lit dungeon, a cavern ringed with rock, the moon under the stars, deep
// space, a starship deck), the weather falls (rain, a thunderstorm with lightning, snow, a blizzard, fog, a
// sandstorm, ash and embers), and day, dusk or night lights it. Walls and cover rise from the painted squares,
// the pieces from Build become little models (houses, skyscrapers with lit windows, cars, buses, cranes,
// trees, ponds, people...), tokens stand as cardboard standees with their portraits, and area templates glow
// on the ground. Orbit around it or stand in a token's shoes. One square is one unit; heights come from feet.

import { h, toast } from './dom.js';
import { TERRAIN, PROPS, GROUNDS, WEATHER, LIGHTS, sizeOf, centerOf, templateGeom, propHeightFt } from '../engine/mapgeo.js';

const TERRAIN_FT = { wall: 10, total: 5, partial: 3 };
const FLAT = { difficult: 0.04, water: 0.03, hazard: 0.05 };
const WET = ['rain', 'storm', 'snow', 'blizzard', 'fog', 'sandstorm', 'ash'];
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const seedOf = (str) => { let x = 7; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) | 0; return x; };

function canvasTex(T, w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.encoding = T.sRGBEncoding; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
const speckle = (g, w, h, n, colour) => { for (let i = 0; i < n; i++) { g.fillStyle = colour(); g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 3); } };

/** The ground's texture; `per` is how many map squares one copy of it covers. */
function groundTexture(T, ground) {
  const make = (draw, per = 4) => ({ tex: canvasTex(T, 256, 256, draw, true), per });
  switch (ground) {
    case 'city': return make((g, w, h) => { g.fillStyle = '#5a5d63'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, () => `hsl(220,4%,${28 + Math.random() * 25}%)`); });
    case 'desert': return make((g, w, h) => { g.fillStyle = '#d8bd85'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, () => `hsl(${38 + Math.random() * 8},50%,${60 + Math.random() * 16}%)`); g.strokeStyle = 'rgba(150,110,60,.25)'; for (let y = 10; y < h; y += 22) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 20) * 4); g.stroke(); } });
    case 'snow': return make((g, w, h) => { g.fillStyle = '#eef4f9'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1500, () => `hsl(205,40%,${82 + Math.random() * 14}%)`); });
    case 'dirt': return make((g, w, h) => { g.fillStyle = '#8a6d4b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3200, () => `hsl(${25 + Math.random() * 12},35%,${24 + Math.random() * 22}%)`); });
    case 'dungeon': return make((g, w, h) => {
      g.fillStyle = '#3d3a35'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = `hsl(35,6%,${36 + Math.random() * 14}%)`; g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58); }
      speckle(g, w, h, 1200, () => `rgba(0,0,0,${Math.random() * 0.25})`);
    }, 4);
    case 'cavern': return make((g, w, h) => { g.fillStyle = '#4b3e33'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `hsla(28,20%,${18 + Math.random() * 20}%,.6)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 6 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill(); } speckle(g, w, h, 1500, () => `hsl(28,15%,${15 + Math.random() * 25}%)`); }, 6);
    case 'moon': return make((g, w, h) => { g.fillStyle = '#8e8c88'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, () => `hsl(40,3%,${45 + Math.random() * 25}%)`); for (let i = 0; i < 14; i++) { const x = Math.random() * w; const y = Math.random() * h; const r = 4 + Math.random() * 18; g.strokeStyle = 'rgba(60,60,60,.45)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.fillStyle = 'rgba(70,70,70,.25)'; g.fill(); } }, 8);
    case 'space': return make((g, w, h) => { g.fillStyle = '#121a30'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,170,255,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.strokeStyle = 'rgba(90,170,255,.18)'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); }, 1);
    case 'deck': return make((g, w, h) => {
      g.fillStyle = '#7f8892'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = `hsl(210,8%,${50 + Math.random() * 8}%)`; g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122); g.fillStyle = '#5b636c'; for (const [a, b] of [[10, 10], [114, 10], [10, 114], [114, 114]]) { g.beginPath(); g.arc(x * 128 + a, y * 128 + b, 4, 0, 7); g.fill(); } }
    }, 2);
    default: return make((g, w, h) => { g.fillStyle = '#5c9a45'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2600, () => `hsl(${95 + Math.random() * 25},45%,${30 + Math.random() * 28}%)`); });
  }
}

/** Sky, fog and light for a ground, the weather and the time of day. */
function environment(ground, weather, light) {
  const indoor = ground === 'dungeon' || ground === 'cavern';
  const void_ = ground === 'space' || ground === 'moon';
  const deck = ground === 'deck';
  let sky = ['#5b93d6', '#a9cdf0', '#e8f1f8']; let fog = '#d6e6f4'; let fogNear = 1.6; let fogFar = 4.5;
  let hemi = 0.75; let sun = 1.0; let sunColor = '#fff4dd'; let hemiSky = '#dfefff'; let hemiGround = '#4a6a3a';
  if (light === 'dusk') { sky = ['#3b3f78', '#e07a5f', '#f6c28b']; fog = '#d9a98a'; hemi = 0.55; sun = 0.7; sunColor = '#ffb07a'; hemiSky = '#ffd2b0'; }
  if (light === 'night') { sky = ['#03060f', '#0b1a33', '#1b2a44']; fog = '#0d1626'; hemi = 0.3; sun = 0.25; sunColor = '#9fb7ff'; hemiSky = '#6c84b8'; hemiGround = '#1a2230'; }
  if (['rain', 'storm', 'snow', 'blizzard'].includes(weather)) { sky = light === 'night' ? ['#05070c', '#121821', '#1d242e'] : ['#5f6873', '#8d96a1', '#b4bcc5']; fog = light === 'night' ? '#151b24' : '#9aa3ad'; hemi *= 0.85; sun *= 0.45; fogNear = 0.8; fogFar = 3; }
  if (weather === 'storm') { fogNear = 0.6; fogFar = 2.4; }
  if (weather === 'blizzard') { sky = ['#c6d0da', '#dfe6ec', '#eef2f5']; fog = '#e6ecf1'; fogNear = 0.1; fogFar = 1.1; }
  if (weather === 'fog') { fog = light === 'night' ? '#222a35' : '#cfd6dc'; sky = [fog, fog, fog]; fogNear = 0.05; fogFar = 0.9; sun *= 0.5; }
  if (weather === 'sandstorm') { sky = ['#b58a4c', '#d2a865', '#e2c08a']; fog = '#cfa463'; fogNear = 0.1; fogFar = 1.2; sun *= 0.6; }
  if (weather === 'ash') { sky = ['#2b1d1a', '#5a2f22', '#8a4a2a']; fog = '#4a2c22'; fogNear = 0.6; fogFar = 2.6; sun *= 0.5; sunColor = '#ff9a5a'; }
  if (indoor) { sky = ground === 'cavern' ? ['#0b0806', '#17110d', '#21180f'] : ['#08080a', '#121114', '#1b1a1e']; fog = ground === 'cavern' ? '#120d09' : '#111014'; fogNear = 0.5; fogFar = 2.2; hemi = 0.42; sun = 0.35; sunColor = '#ffd2a0'; hemiSky = '#c9b8a0'; hemiGround = '#2a2018'; }
  if (void_) { sky = ['#000000', '#03040a', '#070a18']; fog = null; hemi = 0.3; sun = 1.0; sunColor = '#ffffff'; hemiSky = '#9fb0d0'; hemiGround = '#202020'; }
  if (deck) { sky = ['#06080d', '#0b1018', '#121a26']; fog = '#0c121b'; fogNear = 0.9; fogFar = 3; hemi = 0.6; sun = 0.6; sunColor = '#dfe9ff'; hemiSky = '#cfe0ff'; hemiGround = '#30363e'; }
  return { sky, fog, fogNear, fogFar, hemi, sun, sunColor, hemiSky, hemiGround, indoor, void_, deck, stars: void_ || deck || (light === 'night' && !indoor && !WET.includes(weather)) };
}

function windowTexture(T, colour, cols, rows, lit) {
  return canvasTex(T, Math.max(32, cols * 32), Math.max(32, rows * 32), (g, w, h) => {
    g.fillStyle = colour; g.fillRect(0, 0, w, h);
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) { g.fillStyle = Math.random() < lit ? '#ffe39a' : 'rgba(20,32,48,.85)'; g.fillRect(x * 32 + 7, y * 32 + 8, 18, 16); }
  });
}

function standeeTexture(T, tok, done) {
  const W = 256; const H = 360;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
  const paint = (img) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff'; roundRect(g, 6, 6, W - 12, H - 12, 22); g.fill();
    g.fillStyle = tok.color || '#888'; roundRect(g, 14, 14, W - 28, H - 90, 16); g.fill();
    if (img) {
      g.save(); roundRect(g, 14, 14, W - 28, H - 90, 16); g.clip();
      const k = Math.max((W - 28) / img.width, (H - 90) / img.height);
      g.drawImage(img, 14 + ((W - 28) - img.width * k) / 2, 14, img.width * k, img.height * k);
      g.restore();
    } else { g.fillStyle = '#fff'; g.font = '900 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((tok.name || '?').trim()[0].toUpperCase(), W / 2, (H - 76) / 2 + 8); }
    g.fillStyle = tok.villain ? '#2b1418' : '#14213d'; roundRect(g, 14, H - 70, W - 28, 56, 12); g.fill();
    g.fillStyle = '#fff'; g.font = '800 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(tok.name.length > 14 ? `${tok.name.slice(0, 13)}…` : tok.name, W / 2, H - 42);
    tex.needsUpdate = true; done?.();
  };
  paint(null);
  if (tok.img) { const im = new Image(); im.onload = () => paint(im); im.src = tok.img; }
  return tex;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/**
 * One piece from Build as a Group on the ground, its footprint centred on 0,0. Long things (roads,
 * vehicles, fences) are built along z and turned when the footprint is wider than deep.
 * ctx: { night, dark, snowy, cold, lights: [] (where real lights go) }
 */
function buildProp(T, p, scale, ctx) {
  const P = PROPS[p.kind] || PROPS.house;
  const color = p.color || P.color;
  const grp = new T.Group();
  const H = Math.max(0.05, propHeightFt(p) / scale);
  const ft = (f) => f / scale;
  const W = p.w; const D = p.d; const L = Math.max(W, D); const B = Math.min(W, D);
  const along = new T.Group();
  if (W > D) along.rotation.y = Math.PI / 2;
  const R = rnd(seedOf(p.id));
  const std = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, ...o });
  const glow = (c, k = 1) => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } parent.add(m); return m; };
  const box = (parent, w, hh, d, mat, x = 0, y = hh / 2, z = 0) => add(parent, new T.BoxGeometry(w, hh, d), mat, x, y, z);
  const cyl = (parent, r1, r2, hh, mat, x = 0, y = hh / 2, z = 0, seg = 12) => add(parent, new T.CylinderGeometry(r1, r2, hh, seg), mat, x, y, z);
  const flat = (parent, w, d, mat, y = 0.01) => { const m = add(parent, new T.PlaneGeometry(w, d), mat, 0, y, 0, false); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m; };
  const person = (parent, x, z, c, height, hat) => {
    const hh = ft(height);
    box(parent, hh * 0.22, hh * 0.45, hh * 0.14, std('#2b2f3a'), x, hh * 0.225, z);
    box(parent, hh * 0.3, hh * 0.36, hh * 0.18, std(c), x, hh * 0.63, z);
    add(parent, new T.SphereGeometry(hh * 0.11, 12, 10), std(['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'][Math.floor(R() * 5)]), x, hh * 0.9, z);
    if (hat) cyl(parent, hh * 0.12, hh * 0.13, hh * 0.06, std(c === '#1d2b4a' ? '#111827' : '#f2b705'), x, hh * 1.0, z);
  };
  // real lights: lamps at night, fire, lava and glowing things always
  const lightAt = (x, y, z, colour = '#ffd58a', dist = 6, always = false) => { if (always || ctx.night) ctx.lights.push({ x, y, z, colour, dist, parent: grp }); };

  switch (P.model) {
    case 'road': {
      flat(along, B, L, std('#3a3d44', { roughness: 0.95 }), 0.006);
      const dash = std('#f2d24b');
      for (let z = -L / 2 + 0.4; z < L / 2 - 0.3; z += 1) { const m = flat(along, 0.08, 0.5, dash, 0.012); m.position.z = z + 0.25; }
      if (B >= 2) for (const sx of [-1, 1]) { const m = flat(along, 0.05, L, std('#e8e8e8'), 0.011); m.position.x = sx * (B / 2 - 0.12); }
      break;
    }
    case 'slab': box(along, B, H, L, std(color)); break;
    case 'parking': {
      flat(grp, W, D, std(color, { roughness: 0.95 }), 0.006);
      for (let x = -W / 2 + 1; x < W / 2; x += 1) { const m = flat(grp, 0.05, Math.min(1.6, D / 2), std('#f0f0f0'), 0.012); m.position.set(x, 0.012, -D / 2 + Math.min(0.8, D / 4)); }
      break;
    }
    case 'crosswalk': {
      flat(grp, W, D, std(color), 0.006);
      const n = Math.round(W * 3);
      for (let i = 0; i < n; i++) { const m = flat(grp, 0.18, D * 0.85, std('#f4f4f4'), 0.012); m.position.x = -W / 2 + 0.2 + i * (W / n); }
      break;
    }
    case 'lamp': {
      cyl(grp, 0.05, 0.07, H, std(color, { metalness: 0.6 }));
      box(grp, 0.5, 0.05, 0.08, std(color), 0.22, H, 0);
      add(grp, new T.SphereGeometry(0.1, 10, 8), ctx.night ? glow('#ffe7a8', 1.6) : std('#f5efd8'), 0.42, H - 0.08, 0);
      lightAt(0.42, H - 0.2, 0, '#ffd58a', Math.max(5, H * 1.6));
      break;
    }
    case 'trafficlight': {
      cyl(grp, 0.05, 0.06, H, std(color, { metalness: 0.5 }));
      box(grp, 0.2, 0.55, 0.18, std('#1b1b1b'), 0, H - 0.3, 0);
      ['#e3242b', '#f2b705', '#2a9d55'].forEach((c, i) => add(grp, new T.SphereGeometry(0.06, 8, 6), glow(c, i === 2 ? 1.2 : 0.2), 0, H - 0.12 - i * 0.17, 0.1, false));
      break;
    }
    case 'bench': {
      const wood = std(color); const iron = std('#2b2f36', { metalness: 0.5 });
      box(along, B * 0.5, 0.06, L * 0.9, wood, 0, ft(1.5), 0);
      box(along, 0.06, ft(1.4), L * 0.9, wood, -B * 0.24, ft(2.4), 0);
      for (const z of [-L * 0.38, L * 0.38]) box(along, B * 0.5, ft(1.5), 0.06, iron, 0, ft(0.75), z);
      break;
    }
    case 'hydrant': cyl(grp, 0.12, 0.14, H, std(color)); add(grp, new T.SphereGeometry(0.13, 10, 8), std(color), 0, H, 0); break;
    case 'busstop': {
      const frame = std('#2b2f36', { metalness: 0.5 });
      for (const z of [-L / 2 + 0.1, L / 2 - 0.1]) box(along, 0.06, H, 0.06, frame, -B * 0.3, H / 2, z);
      box(along, B * 0.7, 0.06, L, std(color), 0, H, 0);
      box(along, 0.04, H * 0.7, L * 0.95, new T.MeshStandardMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.35 }), -B * 0.3, H * 0.45, 0);
      box(along, B * 0.3, 0.05, L * 0.7, std('#8a5a32'), -B * 0.1, ft(1.6), 0);
      break;
    }
    case 'box': box(along, B * 0.9, H, L * 0.9, std(color)); break;
    case 'fence': {
      const m = std(color);
      for (let z = -L / 2 + 0.05; z <= L / 2; z += 1) box(along, 0.08, H, 0.08, m, 0, H / 2, z);
      for (const y of [H * 0.35, H * 0.85]) box(along, 0.05, 0.08, L, m, 0, y, 0);
      break;
    }
    case 'building': {
      const floors = p.floors || 1;
      const w = W * 0.96; const d = D * 0.96;
      const lit = ctx.night ? 0.6 : 0.28;
      const mats = [D, D, 0, 0, W, W].map((faceW) => {
        if (!faceW || (!P.windows && P.roof !== 'gable')) return std(color);
        const t = windowTexture(T, color, Math.max(1, Math.round(faceW * 2)), floors, lit);
        return new T.MeshStandardMaterial({ map: t, roughness: 0.7, ...(ctx.night ? { emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.55 } : {}) });
      });
      mats[2] = std(P.roof === 'gable' ? color : '#4b4f57');
      add(grp, new T.BoxGeometry(w, H, d), mats, 0, H / 2, 0);
      if (P.roof === 'gable') {
        const long = W >= D; const span = long ? d : w; const len = long ? w : d;
        const shape = new T.Shape(); shape.moveTo(-span / 2 - 0.06, 0); shape.lineTo(span / 2 + 0.06, 0); shape.lineTo(0, span * 0.45); shape.closePath();
        const geo = new T.ExtrudeGeometry(shape, { depth: len + 0.08, bevelEnabled: false }); geo.translate(0, 0, -(len + 0.08) / 2);
        const roof = add(grp, geo, std({ hotel: '#7a1a14', house: '#1f6b3b', church: '#5b4a3a', shed: '#7a4a2a', home2: '#3b4a5a' }[p.kind] || '#6b3a2a', { flatShading: true }), 0, H, 0);
        if (long) roof.rotation.y = Math.PI / 2;
        if (P.steeple) {
          const sz = long ? 0 : -d / 2 + 0.6; const sx = long ? -w / 2 + 0.6 : 0;
          box(grp, 0.9, H * 1.4, 0.9, std(color), sx, H + H * 0.7, sz);
          add(grp, new T.ConeGeometry(0.75, H, 4), std('#5b4a3a', { flatShading: true }), sx, H * 2.4 + H / 2, sz).rotation.y = Math.PI / 4;
        }
      } else if (P.roof === 'spire') {
        add(grp, new T.CylinderGeometry(0.02, Math.min(w, d) * 0.3, H * 0.15, 8), std('#c9d3dd', { metalness: 0.8, roughness: 0.2 }), 0, H + H * 0.075, 0);
      } else if (H > 3) box(grp, w * 0.35, Math.min(1.2, H * 0.05), d * 0.35, std('#6c717a'), 0, H + Math.min(1.2, H * 0.05) / 2, 0);
      if (P.awning) { const a = box(grp, w * 0.9, 0.06, 0.6, std(p.kind === 'diner' ? '#d1352b' : '#2a9d55'), 0, Math.min(H, ft(9)), d / 2 + 0.3); a.rotation.x = 0.25; }
      break;
    }
    case 'gas': {
      box(grp, W * 0.9, 0.25, D * 0.8, std('#e3242b'), 0, H, 0);
      for (const x of [-W * 0.3, W * 0.3]) cyl(grp, 0.1, 0.1, H, std('#e8e8e8'), x, H / 2, 0);
      for (const x of [-W * 0.15, W * 0.15]) box(grp, 0.4, ft(5), 0.3, std('#2b4a7a'), x, ft(2.5), 0);
      lightAt(0, H - 0.3, 0, '#f4fbff', 8);
      break;
    }
    case 'car': case 'van': {
      const wide = B * 0.8; const len = L * 0.9; const tall = P.model === 'van';
      box(along, wide, H * (tall ? 0.7 : 0.48), len, std(color, { metalness: 0.45, roughness: 0.35 }), 0, H * (tall ? 0.45 : 0.42), 0);
      box(along, wide * 0.86, H * (tall ? 0.28 : 0.42), len * (tall ? 0.85 : 0.5), std('#bcd4ea', { metalness: 0.6, roughness: 0.15 }), 0, H * (tall ? 0.84 : 0.86), tall ? 0.04 : -len * 0.05);
      if (P.siren) { box(along, wide * 0.4, 0.08, 0.15, glow('#e3242b', 1), -wide * 0.2, H * 1.1, 0); box(along, wide * 0.4, 0.08, 0.15, glow('#2b6cb0', 1), wide * 0.2, H * 1.1, 0); }
      if (p.kind === 'taxi') box(along, 0.25, 0.1, 0.12, glow('#fff3b0', 0.4), 0, H * 1.12, 0);
      const wheel = std('#151515');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = cyl(along, H * 0.2, H * 0.2, 0.12, wheel, sx * wide * 0.5, H * 0.2, sz * len * 0.32); w.rotation.z = Math.PI / 2; }
      if (ctx.night) for (const sx of [-1, 1]) add(along, new T.SphereGeometry(0.05, 6, 4), glow('#fff6d0', 1.5), sx * wide * 0.3, H * 0.45, len / 2, false);
      break;
    }
    case 'truck': {
      const wide = B * 0.85; const len = L * 0.95;
      box(along, wide, H * 0.55, len * 0.25, std(color, { metalness: 0.4 }), 0, H * 0.4, len * 0.37);
      box(along, wide * 0.9, H * 0.2, len * 0.2, std('#bcd4ea', { metalness: 0.6, roughness: 0.15 }), 0, H * 0.55, len * 0.38);
      box(along, wide, H * 0.82, len * 0.72, std('#e8e8e8'), 0, H * 0.53, -len * 0.13);
      for (const z of [0.36, 0.05, -0.35]) for (const sx of [-1, 1]) { const w = cyl(along, H * 0.11, H * 0.11, 0.14, std('#151515'), sx * wide * 0.5, H * 0.11, z * len); w.rotation.z = Math.PI / 2; }
      break;
    }
    case 'bus': {
      const wide = B * 0.85; const len = L * 0.95;
      const t = windowTexture(T, color, Math.round(len * 2), 1, ctx.night ? 0.9 : 0.05);
      add(along, new T.BoxGeometry(wide, H * 0.75, len), [new T.MeshStandardMaterial({ map: t }), new T.MeshStandardMaterial({ map: t }), std(color), std(color), std(color), std(color)], 0, H * 0.48, 0);
      for (const z of [0.35, -0.35]) for (const sx of [-1, 1]) { const w = cyl(along, H * 0.12, H * 0.12, 0.14, std('#151515'), sx * wide * 0.5, H * 0.12, z * len); w.rotation.z = Math.PI / 2; }
      break;
    }
    case 'tank': {
      const m = std(color, { roughness: 0.9 });
      box(along, B * 0.9, H * 0.4, L * 0.9, m, 0, H * 0.3, 0);
      box(along, B * 0.98, H * 0.25, L * 0.95, std('#2b2b2b'), 0, H * 0.12, 0);
      box(along, B * 0.6, H * 0.3, L * 0.4, m, 0, H * 0.65, -L * 0.05);
      const gun = cyl(along, 0.06, 0.08, L * 0.6, m, 0, H * 0.7, L * 0.3, 8); gun.rotation.x = Math.PI / 2;
      break;
    }
    case 'heli': {
      const m = std(color, { metalness: 0.4 });
      add(along, new T.SphereGeometry(B * 0.35, 16, 12), m, 0, H * 0.45, L * 0.15).scale.set(1, 0.9, 1.6);
      const tail = cyl(along, 0.05, 0.12, L * 0.55, m, 0, H * 0.5, -L * 0.25, 8); tail.rotation.x = Math.PI / 2;
      cyl(along, 0.03, 0.03, H * 0.25, std('#222'), 0, H * 0.8, L * 0.1);
      for (const a of [0, Math.PI / 2]) { const r = box(along, 0.1, 0.02, L * 0.95, std('#222'), 0, H * 0.93, L * 0.1); r.rotation.y = a + 0.3; }
      for (const sx of [-1, 1]) box(along, 0.04, 0.04, L * 0.5, std('#222'), sx * B * 0.25, 0.04, L * 0.12);
      break;
    }
    case 'bike': { box(grp, 0.12, H * 0.45, 0.8, std(color, { metalness: 0.5 }), 0, H * 0.5, 0); for (const z of [-0.32, 0.32]) { const w = cyl(grp, H * 0.25, H * 0.25, 0.08, std('#151515'), 0, H * 0.25, z); w.rotation.z = Math.PI / 2; } break; }
    case 'crane': {
      const m = std(color, { metalness: 0.4 });
      const jib = Math.max(8, H * 0.45);
      box(grp, W, 0.5, D, std('#7a7a7a'), 0, 0.25, 0);
      box(grp, 0.6, H, 0.6, m, 0, H / 2, 0);
      box(grp, 0.3, 0.4, jib, m, 0, H, jib * 0.3);
      box(grp, 0.8, 0.8, 1.2, std('#444'), 0, H + 0.2, -jib * 0.18);
      cyl(grp, 0.02, 0.02, H * 0.45, std('#222'), 0, H - H * 0.225, jib * 0.6, 4);
      break;
    }
    case 'scaffold': {
      const m = std(color, { metalness: 0.6 });
      for (let z = -L / 2 + 0.1; z <= L / 2; z += 1.5) for (const x of [-B / 2 + 0.1, B / 2 - 0.1]) box(along, 0.05, H, 0.05, m, x, H / 2, z);
      for (let y = ft(6); y < H; y += ft(6)) box(along, B * 0.9, 0.05, L, std('#a0743c'), 0, y, 0);
      break;
    }
    case 'girders': { const m = std(color, { metalness: 0.5 }); for (let i = 0; i < 3; i++) { const g = box(along, B * 0.2, 0.25, L * 0.95, m, (i - 1) * B * 0.25, 0.125 + (i === 1 ? 0.25 : 0), 0); g.rotation.y = (R() - 0.5) * 0.2; } break; }
    case 'mound': { const m = add(grp, new T.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(color, { flatShading: true, roughness: 1 })); m.scale.set(W * 0.95, H * 2, D * 0.95); break; }
    case 'cones': { for (let z = -L / 2 + 0.3; z < L / 2; z += 0.7) { cyl(along, 0.02, 0.13, H, std(color), 0, H / 2, z, 10); cyl(along, 0.075, 0.09, H * 0.15, std('#f4f4f4'), 0, H * 0.55, z, 10); } break; }
    case 'barrier': { const sh = new T.Shape(); sh.moveTo(-B * 0.3, 0); sh.lineTo(B * 0.3, 0); sh.lineTo(B * 0.1, H); sh.lineTo(-B * 0.1, H); sh.closePath(); const g = new T.ExtrudeGeometry(sh, { depth: L * 0.95, bevelEnabled: false }); g.translate(0, 0, -L * 0.475); add(along, g, std(color, { roughness: 0.95 })); break; }
    case 'digger': {
      const m = std(color, { metalness: 0.3 });
      box(along, B * 0.9, H * 0.18, L * 0.7, std('#2b2b2b'), 0, H * 0.09, -L * 0.1);
      box(along, B * 0.8, H * 0.35, L * 0.45, m, 0, H * 0.35, -L * 0.1);
      box(along, B * 0.4, H * 0.3, L * 0.25, std('#bcd4ea', { metalness: 0.6 }), -B * 0.15, H * 0.67, -L * 0.05);
      const arm = box(along, 0.18, 0.18, L * 0.55, m, B * 0.2, H * 0.7, L * 0.25); arm.rotation.x = -0.5;
      box(along, B * 0.4, H * 0.18, 0.35, m, B * 0.2, H * 0.25, L * 0.45);
      break;
    }
    case 'crates': {
      const wood = std(color);
      const n = Math.min(12, Math.max(1, Math.round(W * D)));
      const s = Math.min(H, 0.8);
      for (let i = 0; i < n; i++) {
        const b = box(grp, 0.8, s, 0.8, wood, (i % W) - (W - 1) / 2, s / 2, Math.floor(i / W) - (D - 1) / 2);
        b.rotation.y = (R() - 0.5) * 0.4;
        if (H > 1 && i % 2 === 0) { const t = b.clone(); t.position.y += s; t.rotation.y += 0.3; grp.add(t); }
      }
      break;
    }
    case 'container': { const m = std(color, { metalness: 0.4 }); box(along, B * 0.95, H, L * 0.98, m); for (let z = -L / 2 + 0.2; z < L / 2; z += 0.35) box(along, B * 0.97, H * 0.96, 0.04, std(color, { metalness: 0.4, roughness: 0.4 }), 0, H / 2, z); break; }
    case 'pine': {
      const s = Math.min(W, D);
      cyl(grp, 0.07 * s, 0.11 * s, H * 0.3, std('#6b4a2b'), 0, H * 0.15, 0, 8);
      const leaf = std(ctx.snowy ? '#e9f1f6' : color, { flatShading: true });
      const k = Math.min(1, Math.max(0.55, H / 2.5));
      [[0.45, 0.42], [0.66, 0.32], [0.85, 0.2]].forEach(([y, r]) => add(grp, new T.ConeGeometry(r * s * 1.3 * k, H * 0.42, 8), leaf, 0, H * y, 0));
      break;
    }
    case 'oak': {
      const s = Math.min(W, D);
      cyl(grp, 0.12 * s, 0.18 * s, H * 0.45, std('#5e4127'), 0, H * 0.225, 0, 8);
      const leaf = std(ctx.snowy ? '#e1ebef' : color, { flatShading: true });
      for (let i = 0; i < 5; i++) add(grp, new T.IcosahedronGeometry(s * (0.32 + R() * 0.12), 0), leaf, (R() - 0.5) * s * 0.5, H * (0.6 + R() * 0.25), (R() - 0.5) * s * 0.5);
      break;
    }
    case 'palm': {
      const trunk = cyl(grp, 0.06, 0.1, H, std('#8a6a43'), 0.15, H / 2, 0, 8); trunk.rotation.z = -0.12;
      for (let i = 0; i < 7; i++) { const f = box(grp, 0.18, 0.03, H * 0.35, std(color), 0, H, 0); f.rotation.y = (i / 7) * Math.PI * 2; f.rotation.x = 0.5; f.translateZ(H * 0.15); }
      break;
    }
    case 'bush': { const leaf = std(ctx.snowy ? '#dfe9ee' : color, { flatShading: true }); for (let i = 0; i < Math.max(2, Math.round(W * D * 1.5)); i++) add(grp, new T.IcosahedronGeometry(0.35 + R() * 0.2, 0), leaf, (R() - 0.5) * (W - 0.4), H * 0.35, (R() - 0.5) * (D - 0.4)); break; }
    case 'rock': { const r = add(grp, new T.DodecahedronGeometry(0.5, 0), std(color, { flatShading: true })); r.scale.set(W * 0.9, H, D * 0.9); r.position.y = H * 0.42; r.rotation.y = R() * 3; break; }
    case 'pond': {
      const water = ctx.cold ? std('#bfe0f2', { roughness: 0.2, metalness: 0.2 }) : new T.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.88 });
      const rim = add(grp, new T.CircleGeometry(0.5, 40), std(ctx.cold ? '#dfe9ee' : '#c9b48a'), 0, 0.008, 0, false); rim.rotation.x = -Math.PI / 2; rim.scale.set(W, D, 1);
      const m = add(grp, new T.CircleGeometry(0.46, 40), water, 0, 0.02, 0, false); m.rotation.x = -Math.PI / 2; m.scale.set(W, D, 1); m.receiveShadow = true;
      break;
    }
    case 'park': {
      flat(grp, W, D, std(color, { roughness: 1 }), 0.007);
      const path = flat(grp, Math.max(0.5, W * 0.12), D * 1.1, std('#cdb98d'), 0.011); path.rotation.z = 0.5;
      break;
    }
    case 'flowers': { flat(grp, W * 0.95, D * 0.95, std('#5b3f2a'), 0.01); for (let i = 0; i < W * D * 10; i++) add(grp, new T.SphereGeometry(0.06, 6, 4), std(['#d94f8a', '#f2b705', '#ffffff', '#9b59b6', '#e3242b'][Math.floor(R() * 5)]), (R() - 0.5) * W * 0.85, 0.1, (R() - 0.5) * D * 0.85, false); break; }
    case 'fountain': {
      const s = Math.min(W, D);
      cyl(grp, s * 0.48, s * 0.5, ft(1.5), std(color), 0, ft(0.75), 0, 24);
      cyl(grp, s * 0.42, s * 0.42, 0.02, new T.MeshStandardMaterial({ color: '#4aa3df', roughness: 0.1, metalness: 0.3 }), 0, ft(1.4), 0, 24);
      cyl(grp, 0.12, 0.16, H * 0.8, std(color), 0, H * 0.4, 0, 10);
      cyl(grp, s * 0.2, s * 0.05, 0.15, std(color), 0, H * 0.8, 0, 16);
      add(grp, new T.SphereGeometry(0.12, 10, 8), new T.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.7 }), 0, H * 0.95, 0, false);
      break;
    }
    case 'picnic': { const wood = std(color); box(along, B * 0.6, 0.06, L * 0.9, wood, 0, ft(2.5), 0); for (const x of [-B * 0.4, B * 0.4]) box(along, B * 0.18, 0.05, L * 0.9, wood, x, ft(1.5), 0); for (const z of [-L * 0.35, L * 0.35]) box(along, B * 0.9, ft(2.5), 0.06, wood, 0, ft(1.25), z); break; }
    case 'swings': {
      const m = std(color, { metalness: 0.4 });
      for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) for (const z of [-0.4, 0.4]) { const l = cyl(grp, 0.04, 0.04, H, m, x, H / 2, z * 0.6, 6); l.rotation.x = z; }
      const bar = cyl(grp, 0.05, 0.05, W - 0.3, m, 0, H, 0, 6); bar.rotation.z = Math.PI / 2;
      for (let x = -W / 2 + 0.8; x < W / 2 - 0.5; x += 0.8) { cyl(grp, 0.01, 0.01, H * 0.7, std('#333'), x, H * 0.65, 0, 4); box(grp, 0.35, 0.04, 0.18, std('#2b2b2b'), x, H * 0.3, 0); }
      break;
    }
    case 'log': { const l = cyl(along, B * 0.3, B * 0.34, L * 0.95, std(color), 0, B * 0.32, 0, 10); l.rotation.x = Math.PI / 2; break; }
    case 'person': person(grp, 0, 0, color, propHeightFt(p), P.hat); if (p.kind === 'reporter') box(grp, 0.12, 0.1, 0.2, std('#111'), 0.12, ft(5), 0.1); break;
    case 'crowd': { const n = Math.min(14, Math.max(2, Math.round(W * D * 1.2))); const cols = ['#4a7bd1', '#d1495b', '#2a9d55', '#e0a030', '#9b59b6', '#f2f2f2', '#333a45', '#c97b4a']; for (let i = 0; i < n; i++) person(grp, (R() - 0.5) * (W - 0.4), (R() - 0.5) * (D - 0.4), cols[Math.floor(R() * cols.length)], 5 + R() * 1.3, false); break; }
    case 'dog': { const m = std(color); box(grp, 0.18, H * 0.35, 0.5, m, 0, H * 0.55, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(grp, 0.05, H * 0.4, 0.05, m, sx * 0.07, H * 0.2, sz * 0.18); add(grp, new T.SphereGeometry(0.1, 8, 6), m, 0, H * 0.85, 0.28); break; }
    case 'spike': { add(grp, new T.ConeGeometry(Math.min(W, D) * 0.42, H, 7), std(color, { flatShading: true, roughness: 1 }), 0, H / 2, 0); add(grp, new T.ConeGeometry(Math.min(W, D) * 0.2, H * 0.55, 6), std(color, { flatShading: true }), 0.25, H * 0.27, 0.2); break; }
    case 'crystal': { for (let i = 0; i < 5; i++) { const c = add(grp, new T.OctahedronGeometry(0.25, 0), glow(color, 0.55), (R() - 0.5) * (W - 0.3), 0, (R() - 0.5) * (D - 0.3)); c.scale.set(0.7, Math.max(1, H * (0.6 + R() * 0.6) / 0.5), 0.7); c.position.y = c.scale.y * 0.2; c.rotation.z = (R() - 0.5) * 0.5; } lightAt(0, H * 0.5, 0, color, 4, true); break; }
    case 'lava': { const m = add(grp, new T.CircleGeometry(0.48, 32), glow(color, 1.1), 0, 0.02, 0, false); m.rotation.x = -Math.PI / 2; m.scale.set(W, D, 1); const r = add(grp, new T.RingGeometry(0.46, 0.52, 32), std('#2b1a14'), 0, 0.025, 0, false); r.rotation.x = -Math.PI / 2; r.scale.set(W, D, 1); lightAt(0, 0.6, 0, '#ff6a2a', Math.max(W, D) * 1.5, true); break; }
    case 'crater': { const r = add(grp, new T.TorusGeometry(0.45, 0.07, 6, 28), std(color, { flatShading: true, roughness: 1 })); r.rotation.x = -Math.PI / 2; r.scale.set(W, D, Math.max(1, H * 3)); const f = add(grp, new T.CircleGeometry(0.42, 28), std('#6d6b67'), 0, 0.01, 0, false); f.rotation.x = -Math.PI / 2; f.scale.set(W, D, 1); break; }
    case 'console': { box(along, B * 0.7, H * 0.7, L * 0.9, std(color, { metalness: 0.5 }), 0, H * 0.35, 0); const s = box(along, 0.04, H * 0.35, L * 0.8, glow('#4de1ff', 0.9), B * 0.3, H * 0.75, 0); s.rotation.z = -0.4; break; }
    case 'reactor': { const s = Math.min(W, D); cyl(grp, s * 0.45, s * 0.45, 0.4, std('#3a4656', { metalness: 0.7 }), 0, 0.2, 0, 20); cyl(grp, s * 0.3, s * 0.3, H * 0.85, new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }), 0, H * 0.45, 0, 20); for (const y of [0.3, 0.6, 0.9]) cyl(grp, s * 0.36, s * 0.36, 0.12, std('#3a4656', { metalness: 0.7 }), 0, H * y, 0, 20); lightAt(0, H * 0.5, 0, color, 7, true); break; }
    case 'dish': { cyl(grp, 0.12, 0.2, H * 0.55, std('#9aa3ad', { metalness: 0.5 }), 0, H * 0.275, 0, 8); const d = add(grp, new T.SphereGeometry(Math.min(W, D) * 0.48, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3), std(color, { metalness: 0.5, side: T.DoubleSide }), 0, H * 0.55, 0); d.rotation.x = Math.PI * 0.75; break; }
    case 'pod': { const s = Math.min(W, D); const pd = add(grp, new T.SphereGeometry(s * 0.45, 20, 14), std(color, { metalness: 0.7, roughness: 0.3 }), 0, H * 0.5, 0); pd.scale.y = H / s; add(grp, new T.SphereGeometry(s * 0.18, 12, 8), glow('#7fd4ff', 0.6), 0, H * 0.7, s * 0.35); break; }
    case 'pillar': { cyl(grp, 0.42, 0.46, H, std(color, { roughness: 0.95 }), 0, H / 2, 0, 12); box(grp, 1, 0.3, 1, std(color), 0, 0.15, 0); box(grp, 1, 0.3, 1, std(color), 0, H - 0.15, 0); break; }
    case 'brazier': { cyl(grp, 0.05, 0.08, H * 0.8, std('#3a2a1a', { metalness: 0.5 }), 0, H * 0.4, 0, 6); cyl(grp, 0.3, 0.18, 0.2, std('#3a2a1a', { metalness: 0.5 }), 0, H * 0.85, 0, 10); add(grp, new T.ConeGeometry(0.2, 0.5, 8), glow('#ff8a2a', 1.6), 0, H * 0.85 + 0.3, 0, false); lightAt(0, H + 0.4, 0, '#ff9a4a', 7, true); break; }
    case 'mushroom': { cyl(grp, 0.15, 0.22, H * 0.7, std('#efe6d2'), 0, H * 0.35, 0, 10); const c = add(grp, new T.SphereGeometry(Math.min(W, D) * 0.48, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), ctx.night ? glow(color, 0.35) : std(color), 0, H * 0.68, 0); c.scale.y = 0.7; break; }
    default: box(grp, W * 0.9, H, D * 0.9, std(color));
  }
  if (along.children.length) grp.add(along);
  return grp;
}

/** Falling rain, snow, sand or ash, as one moving cloud of streaks or points. */
function weatherSystem(T, kind, map, top) {
  if (!['rain', 'storm', 'snow', 'blizzard', 'sandstorm', 'ash'].includes(kind)) return null;
  const W = map.w + 20; const D = map.h + 20;
  const n = Math.min(14000, Math.round(W * D * ({ rain: 3, storm: 5, snow: 2, blizzard: 5, sandstorm: 4, ash: 1.2 }[kind])));
  const pos = new Float32Array(n * 3); const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * W; pos[i * 3 + 1] = Math.random() * top; pos[i * 3 + 2] = (Math.random() - 0.5) * D; seed[i] = Math.random() * 10; }
  const streak = kind === 'rain' || kind === 'storm';
  const geo = new T.BufferGeometry();
  let obj;
  if (streak) {
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 6), 3));
    obj = new T.LineSegments(geo, new T.LineBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0.55 }));
  } else {
    geo.setAttribute('position', new T.BufferAttribute(pos.slice(), 3));
    const dot = canvasTex(T, 32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
    const colour = { snow: '#ffffff', blizzard: '#ffffff', sandstorm: '#d9b27a', ash: '#ff8a3a' }[kind];
    obj = new T.Points(geo, new T.PointsMaterial({ color: colour, size: kind === 'ash' ? 0.18 : kind === 'sandstorm' ? 0.12 : 0.16, map: dot, transparent: true, depthWrite: false, opacity: kind === 'sandstorm' ? 0.6 : 0.95, blending: kind === 'ash' ? T.AdditiveBlending : T.NormalBlending }));
  }
  obj.frustumCulled = false;
  const fall = { rain: 28, storm: 36, snow: 2.2, blizzard: 5, sandstorm: 1.5, ash: -0.6 }[kind];
  const wind = { rain: 0.6, storm: 6, snow: 0.4, blizzard: 9, sandstorm: 16, ash: 0.4 }[kind];
  const update = (dt, t) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      let y = pos[i * 3 + 1] - fall * dt; let x = pos[i * 3] + wind * dt + (streak ? 0 : Math.sin(t * 1.3 + seed[i]) * 0.01);
      if (y < 0) y += top; if (y > top) y -= top;
      if (x > W / 2) x -= W;
      pos[i * 3 + 1] = y; pos[i * 3] = x;
      if (streak) { const j = i * 6; a[j] = x; a[j + 1] = y; a[j + 2] = pos[i * 3 + 2]; a[j + 3] = x - wind * 0.02; a[j + 4] = y + 0.5; a[j + 5] = pos[i * 3 + 2]; } else { a[i * 3] = x; a[i * 3 + 1] = y; }
    }
    geo.attributes.position.needsUpdate = true;
  };
  update(0, 0);
  return { obj, update };
}

/**
 * Open the 3D view. { map, tokens: [{ key, x, y, size, name, color, img, villain, down, hidden }], bg, focus, gm }
 */
/** The 3D library: in the built app it waits as text until the first 3D view (see tools/build.mjs). */
export function loadThree() {
  if (window.THREE) return window.THREE;
  const src = document.getElementById('dcugen-three');
  if (!src) return null;
  const s = document.createElement('script');
  s.textContent = src.textContent;
  document.head.append(s);
  src.remove();
  return window.THREE || null;
}

export function open3D({ map, tokens, bg, focus = null, gm = false }) {
  const T = loadThree();
  if (!T) { toast('3D needs a browser with WebGL.'); return null; }
  const host = h('div', { class: 'm3d', role: 'dialog', 'aria-label': '3D view' });
  const canvasWrap = h('div', { class: 'm3d-canvas' });
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { toast('3D needs a browser with WebGL.'); return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  canvasWrap.append(renderer.domElement);

  let needs = true; // render on the next frame
  const ground = GROUNDS[map.ground] ? map.ground : 'grass';
  const weather = WEATHER[map.weather] ? map.weather : 'clear';
  const light = LIGHTS[map.light] ? map.light : 'day';
  const env = environment(ground, weather, light);
  const scene = new T.Scene();
  const span = Math.max(map.w, map.h);
  scene.background = canvasTex(T, 4, 256, (g, w, hh) => { const gr = g.createLinearGradient(0, 0, 0, hh); env.sky.forEach((c, i) => gr.addColorStop([0, 0.6, 1][i], c)); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });
  if (env.fog) scene.fog = new T.Fog(env.fog, span * env.fogNear, span * env.fogFar);
  const X = (x) => x - map.w / 2; const Z = (y) => y - map.h / 2;

  // light
  const hemi = new T.HemisphereLight(env.hemiSky, env.hemiGround, env.hemi);
  scene.add(hemi);
  const sun = new T.DirectionalLight(env.sunColor, env.sun);
  sun.position.set(span * 0.6, span * 1.1, span * 0.4);
  sun.castShadow = true;
  const sc = sun.shadow.camera; const half = span / 2 + 6;
  sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = span * 4;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  scene.add(sun);

  // the sky's extras: stars, a planet, the moon
  if (env.stars) {
    const n = 2500; const pts = new Float32Array(n * 3); const all = env.void_ || env.deck;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2; const z = all ? Math.random() * 2 - 1 : Math.random() * 0.95 + 0.05; const r = span * 5; const s = Math.sqrt(1 - z * z);
      pts[i * 3] = r * s * Math.cos(th); pts[i * 3 + 1] = r * z; pts[i * 3 + 2] = r * s * Math.sin(th);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pts, 3));
    scene.add(new T.Points(g, new T.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false })));
  }
  if (env.void_) {
    const planet = new T.Mesh(new T.SphereGeometry(span * 0.9, 48, 32), new T.MeshStandardMaterial({ color: ground === 'moon' ? '#3b7bd4' : '#c46a3a', emissive: ground === 'moon' ? '#0b2a55' : '#3a1408', emissiveIntensity: 0.6, roughness: 0.8, fog: false }));
    planet.position.set(-span * 2.6, span * 1.4, -span * 3.2); scene.add(planet);
  } else if (light === 'night' && env.stars && !env.deck) {
    const moon = new T.Mesh(new T.SphereGeometry(span * 0.12, 24, 16), new T.MeshBasicMaterial({ color: '#f4f1e1', fog: false }));
    moon.position.set(-span * 2, span * 2.2, -span * 3); scene.add(moon);
  }

  // the ground: the wide surroundings, then the map itself
  const { tex, per } = groundTexture(T, ground);
  const pad = env.indoor || env.deck ? 6 : ground === 'space' ? 0 : 80;
  if (pad) {
    const outer = tex.clone(); outer.needsUpdate = true; outer.repeat.set((map.w + pad) / per, (map.h + pad) / per);
    const g = new T.Mesh(new T.PlaneGeometry(map.w + pad, map.h + pad), new T.MeshStandardMaterial({ map: outer, roughness: 1 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -0.01; g.receiveShadow = true; scene.add(g);
  }
  if (bg && map.bg) {
    const t = new T.TextureLoader().load(bg, () => { needs = true; }); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    const b = map.bg;
    const pic = new T.Mesh(new T.PlaneGeometry(b.w, b.h), new T.MeshStandardMaterial({ map: t, roughness: 1, transparent: (b.opacity ?? 1) < 1, opacity: b.opacity ?? 1 }));
    pic.rotation.x = -Math.PI / 2; pic.position.set(X(b.x + b.w / 2), 0.002, Z(b.y + b.h / 2)); pic.receiveShadow = true; scene.add(pic);
  } else {
    const inner = tex.clone(); inner.needsUpdate = true; inner.repeat.set(map.w / per, map.h / per);
    const board = new T.Mesh(new T.PlaneGeometry(map.w, map.h), new T.MeshStandardMaterial({ map: inner, roughness: 1, color: ground === 'grass' ? '#d8f0c8' : '#ffffff' }));
    board.rotation.x = -Math.PI / 2; board.position.y = 0.001; board.receiveShadow = true; scene.add(board);
  }
  if (map.grid > 0) {
    const pts = [];
    for (let x = 0; x <= map.w; x++) pts.push(X(x), 0.014, Z(0), X(x), 0.014, Z(map.h));
    for (let y = 0; y <= map.h; y++) pts.push(X(0), 0.014, Z(y), X(map.w), 0.014, Z(y));
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    scene.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: ground === 'space' ? '#5aaaff' : '#ffffff', transparent: true, opacity: Math.min(0.55, map.grid * 0.6) })));
  }
  // rock around a cavern, stone around a dungeon, bulkheads around a starship deck
  if (env.indoor || env.deck) {
    const R = rnd(seedOf(map.id));
    const rock = new T.MeshStandardMaterial({ color: ground === 'cavern' ? '#3e3229' : ground === 'deck' ? '#4a525c' : '#4a4740', roughness: 1, flatShading: true, metalness: ground === 'deck' ? 0.5 : 0 });
    const wallH = Math.max(3, 30 / map.scale);
    const step = ground === 'cavern' ? 1.5 : 2;
    const ring = [];
    for (let t = 0; t < map.w; t += step) ring.push([t, -1.5], [t, map.h + 1.5]);
    for (let t = 0; t < map.h; t += step) ring.push([-1.5, t], [map.w + 1.5, t]);
    for (const [x, z] of ring) {
      const hh = wallH * (ground === 'cavern' ? 0.7 + R() * 0.9 : 1);
      const m = new T.Mesh(ground === 'cavern' ? new T.DodecahedronGeometry(1.6 + R(), 0) : new T.BoxGeometry(2, hh, 2), rock);
      m.position.set(X(x), ground === 'cavern' ? hh * 0.4 : hh / 2, Z(z));
      if (ground === 'cavern') m.scale.set(1, hh / 2, 1);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
  }

  // terrain: one instanced mesh per kind
  const byKind = {};
  for (const [k, kind] of Object.entries(map.terrain || {})) if (TERRAIN[kind]) (byKind[kind] ||= []).push(k.split(',').map(Number));
  const dummy = new T.Object3D();
  for (const [kind, cells] of Object.entries(byKind)) {
    const fl = FLAT[kind];
    const ht = fl ?? Math.max(0.12, TERRAIN_FT[kind] / map.scale);
    const colour = kind === 'wall' && ground === 'cavern' ? '#4a3c30' : kind === 'wall' && ground === 'deck' ? '#5d6670' : TERRAIN[kind].color;
    const mat = new T.MeshStandardMaterial({ color: colour, roughness: kind === 'water' ? 0.15 : 0.9, metalness: kind === 'water' ? 0.2 : 0, transparent: kind === 'water' || kind === 'hazard', opacity: kind === 'water' ? 0.8 : kind === 'hazard' ? 0.75 : 1, emissive: kind === 'hazard' ? '#ff5a1f' : '#000000', emissiveIntensity: kind === 'hazard' ? 0.5 : 0 });
    const mesh = new T.InstancedMesh(new T.BoxGeometry(1, ht, 1), mat, cells.length);
    cells.forEach(([x, y], i) => { dummy.position.set(X(x + 0.5), ht / 2, Z(y + 0.5)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.castShadow = !fl; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // pieces, then a few real lights (lamps at night, fire, lava, glowing things): too many gets slow
  const ctx = { night: light === 'night' || env.indoor, snowy: ground === 'snow' || weather === 'snow' || weather === 'blizzard', cold: ground === 'snow' || weather === 'blizzard', lights: [] };
  for (const p of map.props || []) {
    const g = buildProp(T, p, map.scale, ctx);
    g.position.set(X(p.x + p.w / 2), 0, Z(p.y + p.d / 2));
    scene.add(g);
  }
  ctx.lights.slice(0, 12).forEach((l) => { const pl = new T.PointLight(l.colour, 1.4, l.dist, 1.6); pl.position.set(l.x, l.y, l.z); l.parent.add(pl); });

  // area templates
  const byKey = Object.fromEntries(tokens.map((t) => [t.key, t]));
  (map.templates || []).forEach((t) => {
    const g = templateGeom(t, byKey); const r = t.ft / map.scale;
    const mat = new T.MeshBasicMaterial({ color: t.color || '#e3242b', transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
    let mesh;
    if (t.shape === 'Cone' || t.shape === 'Line') {
      const shape = new T.Shape();
      if (t.shape === 'Cone') { shape.moveTo(0, 0); shape.lineTo(r, -r / 2); shape.lineTo(r, r / 2); shape.closePath(); } else { const hw = Math.max(0.5, 5 / map.scale / 2); shape.moveTo(0, -hw); shape.lineTo(r, -hw); shape.lineTo(r, hw); shape.lineTo(0, hw); shape.closePath(); }
      mesh = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }), mat);
      mesh.rotation.x = Math.PI / 2; mesh.position.set(X(g.ox), 0.36, Z(g.oy)); mesh.rotation.z = g.ang;
    } else if (t.shape === 'Cylinder') {
      mesh = new T.Mesh(new T.CylinderGeometry(r, r, r * 1.5, 48, 1, true), mat); mesh.position.set(X(g.x), r * 0.75, Z(g.y));
    } else {
      mesh = new T.Mesh(new T.SphereGeometry(r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat); mesh.position.set(X(g.x), 0, Z(g.y));
    }
    scene.add(mesh);
    if (!(t.shape === 'Cone' || t.shape === 'Line')) {
      const ring = new T.Mesh(new T.RingGeometry(Math.max(0, r - 0.12), r, 64), new T.MeshBasicMaterial({ color: t.color || '#e3242b', transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(X(g.x), 0.03, Z(g.y)); scene.add(ring);
    }
  });

  // tokens: standees on a coloured base
  const sprites = {};
  for (const t of tokens) {
    if (t.hidden && !gm) continue;
    const s = sizeOf(t); const c = centerOf(t);
    const Hs = Math.max(6 / map.scale, 0.95) * s * 1.3;
    const eyeH = Math.max(5.5 / map.scale, 0.3) * s;
    const base = new T.Mesh(new T.CylinderGeometry(0.42 * s, 0.46 * s, 0.1, 32), new T.MeshStandardMaterial({ color: t.color || '#888', roughness: 0.5 }));
    base.position.set(X(c.x), 0.05, Z(c.y)); base.castShadow = true; base.receiveShadow = true; scene.add(base);
    const mat = new T.SpriteMaterial({ map: standeeTexture(T, t, () => { needs = true; }), transparent: true, opacity: t.hidden ? 0.45 : 1, fog: false });
    const sp = new T.Sprite(mat);
    sp.center.set(0.5, 0); sp.scale.set(Hs * 0.71, Hs, 1);
    sp.position.set(X(c.x), 0.1, Z(c.y));
    if (t.down) { mat.rotation = Math.PI / 2; sp.center.set(0.5, 0.5); sp.position.y = Hs * 0.36; mat.opacity = 0.6; }
    scene.add(sp);
    sprites[t.key] = { sp, Hs, eyeH, x: X(c.x), z: Z(c.y), t };
  }

  // weather
  const wx = weatherSystem(T, weather, map, Math.max(12, span * 0.6));
  if (wx) scene.add(wx.obj);

  // camera and controls
  const cam = new T.PerspectiveCamera(55, 1, 0.05, span * 12);
  const orbit = { target: new T.Vector3(0, 0, 0), r: span * 0.95, theta: -Math.PI / 4, phi: 0.95 };
  const eye = { key: null, yaw: 0, pitch: -0.05 };
  const place = () => {
    // through someone's eyes, whoever is shoulder to shoulder with them would fill the view: leave them out
    const me = eye.key && sprites[eye.key];
    for (const [k, o] of Object.entries(sprites)) o.sp.visible = !me || (k !== eye.key && Math.hypot(o.x - me.x, o.z - me.z) > 1.5);
    if (eye.key && sprites[eye.key]) {
      const s = sprites[eye.key];
      cam.position.set(s.x, s.eyeH, s.z);
      cam.lookAt(s.x + Math.sin(eye.yaw) * Math.cos(eye.pitch), s.eyeH + Math.sin(eye.pitch), s.z - Math.cos(eye.yaw) * Math.cos(eye.pitch));
    } else {
      orbit.phi = Math.max(0.12, Math.min(1.5, orbit.phi));
      orbit.r = Math.max(2, Math.min(span * 4, orbit.r));
      cam.position.set(orbit.target.x + orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta), orbit.target.y + orbit.r * Math.cos(orbit.phi), orbit.target.z + orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
      cam.lookAt(orbit.target);
    }
    needs = true;
  };
  const lookFrom = (key) => {
    eye.key = key && sprites[key] ? key : null;
    if (eye.key) {
      // face the nearest one on the other side (or the middle of the map)
      const me = sprites[eye.key];
      const others = Object.values(sprites).filter((o) => o !== me && !o.t.hidden && (o.t.villain !== me.t.villain));
      const near = others.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      eye.yaw = Math.atan2((near ? near.x : 0) - me.x, -((near ? near.z : 0) - me.z)); eye.pitch = -0.05;
    }
    syncPick(); place();
  };

  // pointer: drag to orbit (or look around), two fingers or right-drag to pan, wheel or pinch to zoom
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const pts = new Map(); let pinch = null;
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => { try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } pts.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x; const dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && !eye.key) orbit.r *= pinch / d;
      pinch = d;
      if (!eye.key) panBy(dx / 2, dy / 2);
    } else if (eye.key) { eye.yaw += dx * 0.005; eye.pitch = Math.max(-1.2, Math.min(1.2, eye.pitch - dy * 0.004)); } else if (p.b === 2 || p.shift) panBy(dx, dy); else { orbit.theta -= dx * 0.006; orbit.phi -= dy * 0.005; }
    place();
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (eye.key) { cam.fov = Math.max(25, Math.min(90, cam.fov + e.deltaY * 0.03)); cam.updateProjectionMatrix(); } else orbit.r *= Math.exp(e.deltaY * 0.001); place(); }, { passive: false });
  const panBy = (dx, dy) => {
    const k = orbit.r * 0.0016;
    const right = new T.Vector3(Math.cos(orbit.theta), 0, -Math.sin(orbit.theta));
    const fwd = new T.Vector3(-Math.sin(orbit.theta), 0, -Math.cos(orbit.theta));
    orbit.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
    orbit.target.x = Math.max(-map.w, Math.min(map.w, orbit.target.x)); orbit.target.z = Math.max(-map.h, Math.min(map.h, orbit.target.z));
  };

  // the bar on top
  const pick = h('select', { 'aria-label': 'Whose eyes', id: 'm3d-view' }, h('option', { value: '' }, 'Overview: drag to turn, scroll or pinch to zoom'), tokens.filter((t) => gm || !t.hidden).map((t) => h('option', { value: t.key }, `Through ${t.name}'s eyes`)));
  pick.addEventListener('change', () => lookFrom(pick.value || null));
  const syncPick = () => { pick.value = eye.key || ''; };
  const btn = (label, title, fn, id) => h('button', { class: 'btn sm', type: 'button', title, id, onClick: () => { fn(); place(); } }, label);
  let raf = 0;
  const close = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('keydown', key); renderer.dispose(); renderer.forceContextLoss?.(); scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); }); }); host.remove(); };
  const mood = [GROUNDS[ground].label, weather !== 'clear' ? WEATHER[weather].label : null, light !== 'day' ? LIGHTS[light].label : null].filter(Boolean).join(' · ');
  const bar = h('div', { class: 'm3d-bar' },
    h('b', null, `${map.name || 'Battle map'}`), h('span', { class: 'm3d-mood' }, mood), pick,
    btn('⟲', 'Turn left', () => { if (eye.key) eye.yaw -= Math.PI / 8; else orbit.theta += Math.PI / 8; }),
    btn('⟳', 'Turn right', () => { if (eye.key) eye.yaw += Math.PI / 8; else orbit.theta -= Math.PI / 8; }),
    btn('Top', 'Look straight down', () => { eye.key = null; syncPick(); orbit.phi = 0.12; orbit.target.set(0, 0, 0); orbit.r = span * 1.1; }, 'm3d-top'),
    btn('Reset', 'Back to the starting view', () => { eye.key = null; syncPick(); orbit.theta = -Math.PI / 4; orbit.phi = 0.95; orbit.r = span * 0.95; orbit.target.set(0, 0, 0); cam.fov = 55; cam.updateProjectionMatrix(); }),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm primary', type: 'button', id: 'm3d-close', onClick: close }, 'Close'));
  const key = (e) => {
    if (e.key === 'Escape') { close(); return; }
    const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (k) { if (eye.key) eye.yaw += k * 0.12; else orbit.theta -= k * 0.12; place(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const s = e.key === 'ArrowUp' ? 1 : -1; if (eye.key) eye.pitch = Math.max(-1.2, Math.min(1.2, eye.pitch + s * 0.08)); else orbit.r *= s > 0 ? 0.9 : 1.1; place(); }
  };
  document.addEventListener('keydown', key);
  host.append(bar, canvasWrap, h('p', { class: 'm3d-hint' }, 'Drag to turn · right-drag, Shift-drag or two fingers to slide · scroll or pinch to zoom · pick a character to see through their eyes · Esc closes'));
  document.body.append(host);

  const resize = () => { const r = canvasWrap.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height)); cam.aspect = Math.max(1, r.width) / Math.max(1, r.height); cam.updateProjectionMatrix(); needs = true; };
  window.addEventListener('resize', resize);
  resize();
  // weather moves every frame; a storm flashes now and then
  let lastT = performance.now(); let flash = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
    if (wx) { wx.update(dt, now / 1000); needs = true; }
    if (weather === 'storm') {
      if (flash <= 0 && Math.random() < dt * 0.25) flash = 0.35;
      if (flash > 0) { flash -= dt; hemi.intensity = env.hemi + (Math.sin(flash * 60) > 0 ? 2.2 : 0.4) * Math.max(0, flash) * 3; needs = true; } else if (hemi.intensity !== env.hemi) { hemi.intensity = env.hemi; needs = true; }
    }
    if (needs) { needs = false; renderer.render(scene, cam); }
  };
  if (focus && sprites[focus]) lookFrom(focus); else place();
  raf = requestAnimationFrame(loop);
  return { close };
}
