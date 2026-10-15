// Astra: Star Square on its floating island, the broken bridge, Gate Rock, Glow Forest,
// and the far-off islands, waterfalls, railway and observatory that hint at more to discover.

import * as THREE from 'three';
import { alienTree, alienHouse } from './alien.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(7);
const rr = (a, b) => a + R() * (b - a);

// Toon shading: three flat bands of light, so rocks, grass and props share one cartoon look.
// The plush buddies, water and glowing pieces keep their own materials.
const gradientMap = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
gradientMap.needsUpdate = true;

// Every toon material keeps a standard twin (and the other way round), so the ?debug panel can
// switch between the two looks.
const twins = new Map();
function toon(params) {
  const { roughness, metalness, flatShading, ...rest } = params;
  const t = new THREE.MeshToonMaterial({ ...rest, gradientMap });
  t.flatShading = !!flatShading;
  const standard = new THREE.MeshStandardMaterial(params);
  twins.set(t, standard);
  twins.set(standard, t);
  return t;
}

const matCache = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, toon({ color, roughness: 0.9, ...o }));
  return matCache.get(key);
}

function mesh(geo, material, { pos = [0, 0, 0], rot, scale, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// Lumpy, organic geometry: an icosphere pushed around by layered sines.
function lumpy(radius, detail, amount, seed = 1) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.1 + seed) * Math.sin(v.y * 2.7 + seed * 2) * Math.sin(v.z * 1.9 + seed * 3)
      + 0.5 * Math.sin(v.x * 5.3 + v.z * 4.1 + seed);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Grass colours: a soft, warm green with lighter, darker and yellow-green patches.
const GRASS = { base: '#88c25e', light: '#a3d27b', dark: '#6ea84f', yellow: '#b9cf65' };

// Fine blade detail only, in near-white, so the patch colours (vertex colours) set the hue.
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#eef2e6';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `hsla(${rr(70, 110)}, ${rr(15, 35)}%, ${rr(72, 94)}%, 0.5)`;
    g.fillRect(rr(0, w), rr(0, h), rr(1, 3), rr(2, 6));
  }
}, { repeat: [10, 10] });

// A grass disc with large, gentle colour patches baked into its vertices.
function grassDisc(r, seed) {
  const geo = new THREE.RingGeometry(0, r, 72, 28);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const base = new THREE.Color(GRASS.base), light = new THREE.Color(GRASS.light);
  const dark = new THREE.Color(GRASS.dark), yellow = new THREE.Color(GRASS.yellow);
  const c = new THREE.Color();
  const colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const patch = (Math.sin(x * 0.21 + seed) * Math.cos(z * 0.17 - seed * 1.3)
      + Math.sin((x - z) * 0.11 + seed * 2.1) * 0.8 + Math.cos((x + z) * 0.29 + seed * 0.7) * 0.4) / 2.2;
    c.copy(base).lerp(patch > 0 ? light : dark, Math.min(1, Math.abs(patch) * 0.9));
    const sunny = Math.sin(x * 0.13 + seed * 3) * Math.cos(z * 0.23 + seed);
    c.lerp(yellow, Math.max(0, sunny - 0.35) * 1.2);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = toon({ map: grassTex, vertexColors: true, roughness: 1 });
  // Drawn just above the island top without fighting it for depth.
  for (const v of [m, twins.get(m)]) Object.assign(v, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  return mesh(geo, m, { pos: [0, 0.002, 0], cast: false });
}

// A floating island: grassy top with a soft rolled edge, and craggy layered rock underneath.
function island({ x = 0, y = 0, z = 0, r = 10, depth = 14, seed = 1, top = null, rock = ['#b07a4c', '#9a7cb4', '#6a5a96'] }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(new THREE.CylinderGeometry(r, r * 0.98, 1, 72), mat(top || GRASS.base), { pos: [0, -0.5, 0], cast: false }));
  if (!top) g.add(grassDisc(r, seed));
  g.add(mesh(new THREE.TorusGeometry(r - 0.05, 0.38, 10, 72), mat(top || GRASS.base), { pos: [0, -0.32, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.95, 1.1, 48), mat('#8f6440'), { pos: [0, -1.4, 0] }));

  // Underside: a lathed, tapering rock profile with ledges, then roughened by noise.
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12; // 0 = tip, 1 = top
    const w = r * 0.97 * (0.05 + 0.95 * Math.pow(k, 0.65)) * (1 + 0.05 * Math.sin(k * 17 + seed));
    prof.push(new THREE.Vector2(w, -depth + depth * k));
  }
  const geo = new THREE.LatheGeometry(prof, 30);
  const p = geo.attributes.position;
  const colors = [];
  const cTop = new THREE.Color(rock[0]), cMid = new THREE.Color(rock[1]), cBot = new THREE.Color(rock[2]);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const a = Math.atan2(vx, vz);
    const h = -vy / depth; // 0 at the top, 1 at the tip
    const n = Math.sin(a * 5 + seed) * 0.5 + Math.sin(a * 11 + vy * 0.8 + seed) * 0.3 + Math.sin(vy * 1.4 + a * 3) * 0.25;
    const k = 1 + n * 0.16 * Math.min(1, h * 4);
    p.setXYZ(i, vx * k, vy + Math.sin(a * 7 + seed) * 0.4 * h, vz * k);
    const c = h < 0.35 ? cTop.clone().lerp(cMid, h / 0.35) : cMid.clone().lerp(cBot, (h - 0.35) / 0.65);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  g.add(mesh(geo, toon({ vertexColors: true, flatShading: true, roughness: 1 }), { pos: [0, -1.9, 0] }));
  for (let i = 0; i < 5; i++) {
    const a = rr(0, Math.PI * 2);
    const d = rr(0.3, 0.7) * r;
    g.add(mesh(lumpy(rr(0.5, 1.2), 1, 0.2, i), toon({ color: rock[2], flatShading: true }),
      { pos: [Math.cos(a) * d, -depth * rr(0.55, 0.9) - 2, Math.sin(a) * d] }));
  }
  return g;
}

const waterfallTex = canvasTex(128, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = rr(0, w);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,0.0)');
    grd.addColorStop(rr(0.2, 0.8), `rgba(255,255,255,${rr(0.3, 0.8)})`);
    grd.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, rr(2, 6), h);
  }
}, { repeat: [1, 1] });

const fadeDown = canvasTex(4, 256, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.6, '#aaa');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
}, { srgb: false });

function waterfall(width, height) {
  const tex = waterfallTex.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(width / 3, 1);
  const m = new THREE.MeshBasicMaterial({ color: '#d9f3ff', map: tex, alphaMap: fadeDown, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const back = new THREE.MeshBasicMaterial({ color: '#7fc8f0', alphaMap: fadeDown, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const plane = new THREE.PlaneGeometry(width, height);
  const a = new THREE.Mesh(plane, back);
  const b = new THREE.Mesh(plane, m);
  b.position.z = 0.05;
  a.position.y = b.position.y = -height / 2;
  g.add(a, b);
  g.userData.tex = tex;
  return g;
}

// Soft canvas-painted clouds.
const cloudTex = canvasTex(256, 256, (g, w, h) => {
  for (let i = 0; i < 14; i++) {
    const x = rr(60, 196), y = rr(90, 170), r = rr(40, 80);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
});

function cloud(x, y, z, s, opacity = 0.95, tint = '#ffffff') {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: tint, transparent: true, opacity, depthWrite: false, fog: true }));
  sp.position.set(x, y, z);
  sp.scale.set(s, s * 0.6, 1);
  return sp;
}

function tree(x, z, s = 1, leaf = '#5fb548', seed = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunkCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.1, 1, 0.05), V(-0.1, 2, 0), V(0.05, 2.8, 0)]);
  g.add(mesh(new THREE.TubeGeometry(trunkCurve, 12, 0.22, 8), mat('#7a5236'), { scale: [s, s, s] }));
  const shades = [leaf, new THREE.Color(leaf).offsetHSL(0.02, 0, 0.06).getStyle(), new THREE.Color(leaf).offsetHSL(-0.02, 0, -0.06).getStyle()];
  const blobs = [[0, 3.3, 0, 1.4], [-0.9, 2.8, 0.3, 1], [0.9, 2.9, -0.2, 1.05], [0.2, 3.9, -0.3, 0.95], [0.1, 2.9, 0.9, 0.9]];
  blobs.forEach(([bx, by, bz, br], i) => {
    g.add(mesh(lumpy(br * s, 3, 0.08, seed + i), mat(shades[i % 3]), { pos: [bx * s, by * s, bz * s] }));
  });
  return g;
}

// Rounded alien cottage built on a lathe: bulging walls, mushroom-cap roof, round window, door.
function cottage({ wall, roof, r = 1.6, h = 2.2, roofH = 1.8, window: win = '#ffd98a', tilt = 0, chimney = false }) {
  const g = new THREE.Group();
  const wallPts = [V(0, 0, 0), V(r * 0.94, 0, 0), V(r, h * 0.12, 0), V(r * 1.04, h * 0.5, 0), V(r * 0.98, h * 0.9, 0), V(r * 0.9, h, 0), V(0, h, 0)]
    .map(v => new THREE.Vector2(v.x, v.y));
  g.add(mesh(new THREE.LatheGeometry(wallPts, 36), mat(wall)));
  const roofPts = [V(0, roofH, 0), V(r * 0.5, roofH * 0.92, 0), V(r * 1.05, roofH * 0.5, 0), V(r * 1.32, roofH * 0.08, 0), V(r * 1.3, 0, 0), V(r * 0.9, -0.05, 0), V(0, -0.05, 0)]
    .map(v => new THREE.Vector2(v.x, v.y));
  const rf = mesh(new THREE.LatheGeometry(roofPts, 36), mat(roof));
  rf.position.y = h - 0.05;
  rf.rotation.z = tilt;
  g.add(rf);
  // Door (with an arched top) and a round glowing window.
  const door = new THREE.Group();
  door.add(mesh(new THREE.BoxGeometry(0.72, 0.9, 0.14), mat('#6d4428'), { pos: [0, 0.45, 0] }));
  door.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 20, 1, false, -Math.PI / 2, Math.PI), mat('#6d4428'), { pos: [0, 0.9, 0], rot: [Math.PI / 2, 0, 0] }));
  door.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), mat('#ffd166', { metalness: 0.6, roughness: 0.3 }), { pos: [0.22, 0.6, 0.09] }));
  door.position.set(0, 0, r * 0.97);
  g.add(door);
  const winG = new THREE.Group();
  winG.add(mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ color: win, emissive: win, emissiveIntensity: 0.8 }), { cast: false }));
  winG.add(mesh(new THREE.TorusGeometry(0.33, 0.06, 8, 24), mat('#fff3df')));
  winG.position.set(r * 0.62, h * 0.6, r * 0.82);
  winG.rotation.y = 0.65;
  g.add(winG);
  if (chimney) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 1, 10), mat('#a9876a'), { pos: [-r * 0.55, h + roofH * 0.6, -0.2] }));
  return g;
}

const stripes = (a, b) => canvasTex(128, 16, (g, w, h) => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect((i * w) / 8, 0, w / 8, h);
  }
});

function awning(len, depth, a, b) {
  const geo = new THREE.CylinderGeometry(depth, depth, len, 16, 1, true, 0, Math.PI);
  const m = new THREE.MeshStandardMaterial({ map: stripes(a, b), side: THREE.DoubleSide, roughness: 0.95 });
  m.map.wrapS = THREE.RepeatWrapping;
  m.map.repeat.set(3, 1);
  return mesh(geo, m, { rot: [0, 0, Math.PI / 2] });
}

function glyphTexture(kind) {
  return canvasTex(256, 256, (g, w) => {
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineWidth = 18;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.arc(128, 128, 112, 0, Math.PI * 2);
    g.lineWidth = 8;
    g.stroke();
    g.lineWidth = 18;
    // Stick-figure glyphs: the gate's ancient "dance" symbols.
    g.beginPath();
    g.arc(128, 70, 20, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(128, 96); g.lineTo(128, 160);
    g.moveTo(128, 160); g.lineTo(100, 210);
    g.moveTo(128, 160); g.lineTo(156, 210);
    if (kind === 'star') { g.moveTo(128, 108); g.lineTo(84, 52); g.moveTo(128, 108); g.lineTo(172, 52); }
    if (kind === 'bridge') { g.moveTo(128, 112); g.lineTo(62, 112); g.moveTo(128, 112); g.lineTo(194, 112); }
    if (kind === 'moon') { g.moveTo(128, 108); g.lineTo(168, 46); g.moveTo(128, 108); g.lineTo(100, 150); }
    g.stroke();
  });
}

// A strip of light following a curve; reveal it progressively with setProgress(0..1).
function ribbon(points, width, color) {
  const curve = new THREE.CatmullRomCurve3(points);
  const N = 160;
  const pos = [];
  const uv = [];
  const idx = [];
  const up = V(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const p = curve.getPoint(k);
    const t = curve.getTangent(k);
    const side = new THREE.Vector3().crossVectors(t, up).normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, p.y, p.z - side.z, p.x + side.x, p.y, p.z + side.z);
    uv.push(0, k * 20, 1, k * 20);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const tex = canvasTex(64, 64, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, h / 2 - 3, w, 6);
  }, { repeat: [1, 1] });
  tex.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const r = new THREE.Mesh(geo, m);
  r.renderOrder = 2;
  r.userData = { curve, total: idx.length };
  r.setProgress = k => geo.setDrawRange(0, Math.floor((r.userData.total * Math.max(0, Math.min(1, k))) / 6) * 6);
  r.setProgress(0);
  return r;
}

// ---------------------------------------------------------------------------

export function buildWorld(scene) {
  const updaters = [];
  const clickable = [];
  const label = (obj, text, line) => {
    obj.userData.label = text;
    obj.userData.line = line;
    clickable.push(obj);
    return obj;
  };

  // Sky dome: deep blue overhead fading to a warm horizon.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color('#2f6fd0') }, mid: { value: new THREE.Color('#8cc8f5') }, horizon: { value: new THREE.Color('#f7e7d4') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = mix(horizon, mid, smoothstep(-0.05, 0.25, h)); c = mix(c, top, smoothstep(0.25, 0.8, h));
      c = mix(c, vec3(0.55,0.72,0.92), smoothstep(0.0, -0.4, h)); gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);
  scene.fog = new THREE.Fog('#bcd6ef', 260, 900);

  // Toon materials ignore scene.environment, so the hemisphere light does the soft fill.
  const hemi = new THREE.HemisphereLight('#e8f1ff', '#b9a6dd', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd7a0', 2.4);
  sun.position.set(30, 45, 25);
  sun.target.position.set(12, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.intensity = 0.55;
  scene.add(sun, sun.target);

  // Far below: a deep blue sea under a floor of clouds.
  scene.add(mesh(new THREE.PlaneGeometry(2000, 2000), mat('#8cbbe8', { roughness: 0.4 }), { pos: [0, -90, 0], rot: [-Math.PI / 2, 0, 0], cast: false }));
  for (let i = 0; i < 70; i++) {
    const a = rr(0, Math.PI * 2), d = rr(20, 220);
    scene.add(cloud(Math.cos(a) * d, rr(-60, -38), Math.sin(a) * d, rr(40, 80), 0.9));
  }
  for (let i = 0; i < 24; i++) {
    const a = rr(0, Math.PI * 2), d = rr(120, 220);
    scene.add(cloud(Math.cos(a) * d, rr(20, 45), Math.sin(a) * d, rr(25, 50), 0.6));
  }
  // Clouds along the opening fly-in. They sit just above the camera's path, so the flight
  // passes under them but they don't cover Star Square in the title shot.
  for (const [x, y, z, s] of [[-33, 34, 62, 10], [-52, 37, 70, 14]]) {
    scene.add(cloud(x, y, z, s, 0.85));
  }

  // A far ring of cloud banks instead of a hard horizon.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rr(-0.05, 0.05);
    const d = rr(300, 380);
    scene.add(cloud(Math.cos(a) * d, rr(-25, 10), Math.sin(a) * d, rr(90, 150), 0.8, '#f4f1ff'));
  }

  // ------------------------------------------------------------- Star Square
  const home = island({ r: 22, depth: 26, seed: 2 });
  scene.add(home);

  // Stepping-stone paths: rings around the fountain, then a tidy trail out to each place.
  // Each stone is [x, z, size].
  const stones = [];
  for (const [ring, size] of [[2.4, 1], [3.4, 1.1], [4.5, 1.2], [5.7, 1.05]]) {
    const count = Math.round((Math.PI * 2 * ring) / 1.15);
    const turn = rr(0, 1);
    for (let i = 0; i < count; i++) {
      const a = ((i + turn + rr(-0.15, 0.15)) / count) * Math.PI * 2;
      const d = ring + rr(-0.15, 0.15);
      stones.push([Math.cos(a) * d, Math.sin(a) * d, size * rr(0.85, 1.15)]);
    }
  }
  // Two staggered rows along the line from a to b, about one stride apart.
  const layPath = (ax, az, bx, bz, w = 1.7) => {
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const n = Math.max(2, Math.round(len / 0.95));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const o = (i % 2 ? 0.22 : -0.22) * w + rr(-0.08, 0.08);
      stones.push([ax + (bx - ax) * k + nx * o, az + (bz - az) * k + nz * o, rr(0.85, 1.15)]);
    }
  };
  const PLACES = {
    poppyHouse: [-11, 5], garden: [-7, 9], nuttyHouse: [-14.5, -2], bakery: [5, -11], market: [11, -3.5],
    theater: [-5.5, -13], pond: [-15, -10], tree: [5, 12], workshop: [15.5, 11.5], bridgeHead: [20.4, 4],
  };
  layPath(-5.4, 2.6, -10, 5.5); layPath(-5, 4, -7, 7.6); layPath(-5.9, -1, -13, -2); layPath(2.6, -5.4, 5, -9);
  layPath(5.9, -2, 10, -3); layPath(-2.4, -5.6, -5, -11); layPath(5.8, 3, 15, 4); layPath(15, 4, 20.5, 4, 2);
  layPath(12, 4.5, 15, 9.8); layPath(3.4, 5.6, 4.5, 9.5);
  const isPath = (x, z) => stones.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 0.9);
  const cobble = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.45, 0.12, 8), new THREE.MeshStandardMaterial({ roughness: 0.95 }), stones.length);
  const tmp = new THREE.Object3D();
  stones.forEach(([x, z, size], i) => {
    tmp.position.set(x, 0, z); // sunk a little: just the top shows above the grass
    tmp.rotation.set(0, rr(0, Math.PI), 0);
    tmp.scale.set(size, 1, size * rr(0.75, 1));
    tmp.updateMatrix();
    cobble.setMatrixAt(i, tmp.matrix);
    cobble.setColorAt(i, new THREE.Color().setHSL(rr(0.06, 0.1), rr(0.18, 0.32), rr(0.42, 0.58)));
  });
  cobble.receiveShadow = true;
  scene.add(cobble);

  const occupied = [[0, 0, 3], [-11, 5, 2.6], [-14.5, -2, 2.4], [5, -11, 2.8], [11, -3.5, 3], [-5.5, -13, 3.6],
    [-15, -10, 3.4], [5, 12, 1.5], [15.5, 11.5, 3.2], [-7, 9, 1.8]];
  const free = (x, z, pad = 0) => Math.hypot(x, z) < 20.5 && !isPath(x, z) && occupied.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > or + pad);

  // Grass tufts (the ground's own green, lighter at the tips) and flowers.
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.28, 5, 1, true);
  const tuftShade = [];
  for (let i = 0; i < tuftGeo.attributes.position.count; i++) {
    const k = 0.75 + 0.55 * (tuftGeo.attributes.position.getY(i) / 0.28 + 0.5);
    tuftShade.push(k, k, k);
  }
  tuftGeo.setAttribute('color', new THREE.Float32BufferAttribute(tuftShade, 3));
  const TUFTS = 840;
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide, vertexColors: true }), TUFTS);
  let n = 0;
  while (n < TUFTS) {
    const x = rr(-21, 21), z = rr(-21, 21);
    if (!free(x, z)) continue;
    tmp.position.set(x, 0.17, z);
    tmp.rotation.set(rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3));
    tmp.scale.setScalar(rr(0.5, 1.1));
    tmp.updateMatrix();
    tufts.setMatrixAt(n, tmp.matrix);
    tufts.setColorAt(n++, new THREE.Color(GRASS.base).offsetHSL(rr(-0.02, 0.02), 0, rr(-0.06, 0.04)));
  }
  scene.add(tufts);
  const flowerColors = ['#ff6f9c', '#ffd447', '#b28cff', '#ffffff', '#ff984f', '#5ec3ff'];
  const FLOWERS = 320;
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), FLOWERS);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.02, 0.32, 4), mat('#3f8a2e'), FLOWERS);
  n = 0;
  while (n < FLOWERS) {
    const cx = rr(-21, 21), cz = rr(-21, 21);
    if (!free(cx, cz, 0.3)) continue;
    // Flowers grow in little clumps of one colour.
    const color = new THREE.Color(flowerColors[Math.floor(R() * flowerColors.length)]);
    for (let k = 0; k < 5 && n < FLOWERS; k++, n++) {
      const x = cx + rr(-0.4, 0.4), z = cz + rr(-0.4, 0.4), h = rr(0.24, 0.4);
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(x, h / 2, z);
      tmp.scale.set(1, h / 0.32, 1);
      tmp.updateMatrix();
      stems.setMatrixAt(n, tmp.matrix);
      tmp.position.set(x, h, z);
      tmp.scale.set(1, 0.75, 1);
      tmp.updateMatrix();
      flowers.setMatrixAt(n, tmp.matrix);
      flowers.setColorAt(n, color);
    }
  }
  flowers.castShadow = true;
  scene.add(flowers, stems);

  const faceCenter = (g, x, z) => { g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); };

  // Poppy's slightly chaotic house and garden.
  const poppyHouse = alienHouse({ wall: '#fff0e0', roof: '#ff6f9c', tilt: 0.08, chimney: true });
  faceCenter(poppyHouse, ...PLACES.poppyHouse);
  scene.add(label(poppyHouse, "Poppy's house", "Don't go in my room. It's... organised. In a Poppy way."));
  for (let i = 0; i < 4; i++) {
    scene.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat(['#c58b52', '#b97a44'][i % 2]), { pos: [-13 + i * 0.3, 0.3 + (i === 3 ? 0.6 : 0), 7 + (i % 2) * 0.7], rot: [0, rr(0, 1), 0] }));
  }
  const garden = new THREE.Group();
  garden.position.set(...[PLACES.garden[0], 0, PLACES.garden[1]]);
  // A raised bed: a rounded stone rim, light soil, and flowers sitting in little leaf clusters.
  garden.add(mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.18, 32), mat('#9a7352'), { pos: [0, 0.03, 0], cast: false }));
  garden.add(mesh(new THREE.TorusGeometry(1.66, 0.14, 10, 48), mat('#d9c6a8'), { pos: [0, 0.13, 0], rot: [Math.PI / 2, 0, 0] }));
  const leafGeo = new THREE.SphereGeometry(0.13, 10, 6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const fx = Math.cos(a) * 1.3, fz = Math.sin(a) * 1.3;
    garden.add(mesh(new THREE.SphereGeometry(0.18, 12, 10), mat(['#ff6f9c', '#ffd447', '#ff984f'][i % 3]), { pos: [fx, 0.38, fz] }));
    garden.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5), mat('#4f9a37'), { pos: [fx, 0.2, fz] }));
    for (let j = 0; j < 3; j++) {
      const b = a + (j / 3) * Math.PI * 2 + rr(-0.3, 0.3);
      garden.add(mesh(leafGeo, mat(j % 2 ? '#6fb84f' : '#5aa844'), {
        pos: [fx + Math.cos(b) * 0.16, 0.16, fz + Math.sin(b) * 0.16], rot: [0, -b, 0], scale: [1.2, 0.35, 0.7],
      }));
    }
  }
  scene.add(garden);

  // The relic: a glowing fragment of Starway stone, half-buried in Poppy's garden.
  const relic = new THREE.Group();
  const relicCore = mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: '#bff6ff', emissive: '#4fe3ff', emissiveIntensity: 2.2, roughness: 0.2, flatShading: true }));
  relicCore.scale.set(1, 1.5, 1);
  relic.add(relicCore);
  const relicLight = new THREE.PointLight('#6fe9ff', 6, 5, 2);
  relic.add(relicLight);
  relic.position.set(PLACES.garden[0] - 0.2, -0.05, PLACES.garden[1] + 0.1);
  scene.add(relic);
  relic.userData.glow = 1;
  updaters.push((dt, t) => {
    relicCore.rotation.y += dt * 1.2;
    relicLight.intensity = (5 + Math.sin(t * 3) * 1.5) * relic.userData.glow;
    relicCore.material.emissiveIntensity = 2.2 * relic.userData.glow;
  });

  // Nutty's acorn-roofed house next door.
  const nuttyHouse = alienHouse({ wall: '#ffe9b5', roof: '#a8743f', r: 1.5, roofH: 2.1 });
  faceCenter(nuttyHouse, ...PLACES.nuttyHouse);
  scene.add(label(nuttyHouse, "Nutty's house", "Nutty has four kinds of pillow. FOUR."));

  // Fountain in the middle of the square.
  const fountain = new THREE.Group();
  fountain.add(mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(2.4, 0), new THREE.Vector2(2.5, 0.55), new THREE.Vector2(2.2, 0.6), new THREE.Vector2(2.1, 0.25), new THREE.Vector2(0, 0.25)], 40), mat('#e8dcc8')));
  const water = new THREE.MeshStandardMaterial({ color: '#3fa7e0', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });
  fountain.add(mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.05, 40), water, { pos: [0, 0.48, 0], cast: false }));
  fountain.add(mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.8, 16), mat('#e8dcc8'), { pos: [0, 1.2, 0] }));
  fountain.add(mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0.2), new THREE.Vector2(1, 0.45), new THREE.Vector2(0.85, 0.4), new THREE.Vector2(0, 0.25)], 30), mat('#e8dcc8'), { pos: [0, 2, 0] }));
  fountain.add(mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: '#9fe8ff', emissive: '#3fcfff', emissiveIntensity: 0.6, flatShading: true }), { pos: [0, 2.85, 0] }));
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ color: '#c9f0ff', transparent: true, opacity: 0.85 }), 60);
  fountain.add(drops);
  const dropSeeds = Array.from({ length: 60 }, () => [rr(0, Math.PI * 2), rr(0, 1)]);
  updaters.push((dt, t) => {
    dropSeeds.forEach(([a, o], i) => {
      const k = (t * 0.7 + o) % 1;
      tmp.position.set(Math.cos(a) * (0.9 + k * 0.9), 2.4 + k * 0.6 - k * k * 2.3, Math.sin(a) * (0.9 + k * 0.9));
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      drops.setMatrixAt(i, tmp.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
  });
  scene.add(label(fountain, 'The fountain', 'Mimi says the fountain is her audience. It never claps, though.'));

  // Bakery with a striped awning and a giant bun sign.
  const bakery = alienHouse({ wall: '#ffd9b3', roof: '#ff984f', r: 1.9, h: 2.4, chimney: true });
  faceCenter(bakery, ...PLACES.bakery);
  const aw = awning(2.6, 0.8, '#ff984f', '#fff4e6');
  aw.position.set(0, 2.1, 1.9);
  bakery.add(aw);
  bakery.add(mesh(lumpy(0.45, 2, 0.05), mat('#d9893d'), { pos: [0, 4.6, 0.6], scale: [1.3, 0.8, 1] }));
  scene.add(label(bakery, 'Bakery', 'The bakery! Nutty visits eleven times a day. Minimum.'));

  // Market stalls.
  const market = new THREE.Group();
  faceCenter(market, ...PLACES.market);
  [[-2.2, '#5ec3ff'], [0, '#ffd447'], [2.2, '#7fd35a']].forEach(([x, c], i) => {
    const stall = new THREE.Group();
    stall.position.set(x, 0, 0);
    stall.add(mesh(new THREE.BoxGeometry(1.8, 0.9, 1), mat('#b98556'), { pos: [0, 0.45, 0] }));
    for (const sx of [-0.85, 0.85]) stall.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), mat('#8a5d3b'), { pos: [sx, 1.1, -0.4] }));
    const a = awning(2, 0.6, c, '#ffffff');
    a.position.set(0, 2.15, 0);
    stall.add(a);
    for (let k = 0; k < 7; k++) {
      stall.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(['#ff6f6f', '#ffd447', '#9be36a', '#b28cff'][(k + i) % 4]), { pos: [-0.6 + k * 0.2, 1.03, rr(-0.2, 0.25)] }));
    }
    market.add(stall);
  });
  scene.add(label(market, 'Market', 'Fresh moon-melons! Well. Fresh-ish.'));

  // Theater: a little round stage with velvet curtains and bunting.
  const theater = new THREE.Group();
  faceCenter(theater, ...PLACES.theater);
  theater.add(mesh(new THREE.CylinderGeometry(3, 3.2, 0.6, 32, 1, false, -Math.PI / 2, Math.PI), mat('#c58b52'), { pos: [0, 0.3, 0] }));
  theater.add(mesh(new THREE.TorusGeometry(2.8, 0.25, 12, 32, Math.PI), mat('#a982f5'), { pos: [0, 0.6, -0.2] }));
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(1.3, 2.6, 12, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.1);
    geo.computeVertexNormals();
    theater.add(mesh(geo, new THREE.MeshStandardMaterial({ color: '#c2304f', roughness: 0.8, side: THREE.DoubleSide }), { pos: [s * 2, 1.9, -0.15] }));
  }
  scene.add(label(theater, 'Theater', "Mimi's theater. Every show is a world premiere. Every single one."));

  // Pond with lily pads and reeds.
  const pond = new THREE.Group();
  pond.position.set(...[PLACES.pond[0], 0, PLACES.pond[1]]);
  pond.add(mesh(new THREE.CircleGeometry(3, 40), new THREE.MeshStandardMaterial({ color: '#2f8fd0', roughness: 0.05, metalness: 0.2 }), { pos: [0, 0.04, 0], rot: [-Math.PI / 2, 0, 0], scale: [1.2, 0.9, 1], cast: false }));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    pond.add(mesh(lumpy(0.3, 1, 0.15, i), mat('#bfb4a6', { flatShading: true }), { pos: [Math.cos(a) * 3.6, 0.1, Math.sin(a) * 2.7] }));
  }
  for (let i = 0; i < 5; i++) pond.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16, 1, false, 0.3, Math.PI * 1.8), mat('#4fae3f'), { pos: [rr(-2, 2), 0.07, rr(-1.5, 1.5)] }));
  for (let i = 0; i < 12; i++) pond.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, rr(0.8, 1.4), 4), mat('#5a8f3a'), { pos: [-3 + rr(-0.3, 0.3), 0.5, rr(-1, 1)] }));
  scene.add(label(pond, 'Pond', 'Lumi tried to build a submarine for this pond. It went... down.'));

  // The big tree Zuzu naps under, plus scattered trees.
  const bigTree = alienTree(PLACES.tree[0], PLACES.tree[1], 1.35, '#5aae45', 3);
  scene.add(bigTree);
  for (const [x, z, s, c] of [[-18, 6, 1, '#4f9f3e'], [-17, -14, 1.1, '#62b84a'], [8, -17, 1.2, '#ff8fb5'], [-10, -18, 0.9, '#5aae45'],
    [17, -10, 1, '#ffb347'], [-19, 0, 0.8, '#5aae45'], [12, 16, 0.9, '#62b84a'], [-2, 17, 0.9, '#ff8fb5'], [19, -4, 0.8, '#5aae45']]) {
    scene.add(alienTree(x, z, s, c, x));
  }

  // Lamp posts.
  for (const [x, z] of [[3.5, 3.5], [-3.5, -3.5], [-4, 3.6], [4, -3.6], [13, 3], [9, 5.2], [18.5, 2.6]]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.09, 0.135, 2.6, 10), mat('#6b4a5e'), { pos: [x, 1.3, z] }));
    scene.add(mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: '#fff1c2', emissive: '#ffcf70', emissiveIntensity: 1.2 }), { pos: [x, 2.7, z] }));
  }

  // ------------------------------------------------------------- Lumi's workshop & the Sky Crank
  const workshop = new THREE.Group();
  workshop.position.set(PLACES.workshop[0], 0, PLACES.workshop[1]);
  workshop.rotation.y = -2.4;
  workshop.add(mesh(new THREE.BoxGeometry(4, 2.6, 3), mat('#cfd8e6'), { pos: [0, 1.3, 0] }));
  workshop.add(mesh(new THREE.BoxGeometry(4.6, 0.3, 3.8), mat('#5ec3ff'), { pos: [0, 2.85, 0.1], rot: [0.18, 0, 0] }));
  workshop.add(mesh(new THREE.BoxGeometry(1.3, 1.9, 0.12), mat('#6d4428'), { pos: [-0.8, 0.95, 1.5] }));
  workshop.add(mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffbf5a', emissiveIntensity: 0.9 }), { pos: [1.1, 1.6, 1.52], cast: false }));
  const gear = new THREE.Group();
  gear.add(mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 24), mat('#c9893a', { metalness: 0.6, roughness: 0.35 })));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    gear.add(mesh(new THREE.BoxGeometry(0.2, 0.25, 0.15), mat('#c9893a', { metalness: 0.6, roughness: 0.35 }), { pos: [Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0], rot: [0, 0, a] }));
  }
  gear.position.set(2.05, 1.6, 0.2);
  gear.rotation.y = Math.PI / 2;
  workshop.add(gear);
  workshop.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 10), mat('#8a8fa8'), { pos: [-1.4, 3.4, -0.6] }));
  scene.add(label(workshop, "Lumi's workshop", "Lumi's workshop. Things in there go 'bzzt'. Sometimes on purpose."));
  updaters.push(dt => { gear.rotation.z += dt * 0.4; });

  // Chimney smoke.
  const smoke = [];
  for (let i = 0; i < 6; i++) {
    const s = cloud(0, 0, 0, 1, 0.6, '#e8e8f0');
    s.userData.k = i / 6;
    scene.add(s);
    smoke.push(s);
  }
  const chimneyTop = new THREE.Vector3();
  updaters.push(dt => {
    workshop.localToWorld(chimneyTop.set(-1.4, 4.2, -0.6));
    for (const s of smoke) {
      s.userData.k = (s.userData.k + dt * 0.15) % 1;
      const k = s.userData.k;
      s.position.set(chimneyTop.x + k * 1.5, chimneyTop.y + k * 4, chimneyTop.z + k * 0.6);
      s.scale.set(1 + k * 3, (1 + k * 3) * 0.6, 1);
      s.material.opacity = 0.55 * (1 - k);
    }
  });

  const crank = new THREE.Group();
  crank.position.set(18.2, 0, 8);
  crank.rotation.y = Math.PI / 2;
  crank.add(mesh(new THREE.BoxGeometry(1.8, 0.7, 1.4), mat('#8a8f9e', { roughness: 0.7 }), { pos: [0, 0.35, 0] }));
  const wheel = new THREE.Group();
  wheel.add(mesh(new THREE.TorusGeometry(0.75, 0.08, 10, 32), mat('#b5732f', { metalness: 0.5, roughness: 0.4 })));
  for (let i = 0; i < 6; i++) wheel.add(mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), mat('#b5732f', { metalness: 0.5 }), { rot: [0, 0, (i / 6) * Math.PI] }));
  wheel.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mat('#ff6f9c'), { pos: [0.72, 0, 0.25], rot: [Math.PI / 2, 0, 0] }));
  wheel.position.set(-0.6, 1.55, 0.75);
  crank.add(wheel);
  for (let i = 0; i < 5; i++) crank.add(mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 20), mat('#d9893d', { metalness: 0.7, roughness: 0.3 }), { pos: [0.4, 0.85 + i * 0.16, 0], rot: [Math.PI / 2, 0, 0] }));
  const coreMat = new THREE.MeshStandardMaterial({ color: '#bff6ff', emissive: '#3fd8ff', emissiveIntensity: 0.1 });
  const core = mesh(new THREE.SphereGeometry(0.28, 20, 16), coreMat, { pos: [0.4, 1.85, 0] });
  crank.add(core);
  const dish = mesh(new THREE.SphereGeometry(0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: '#e8ecf5', metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }));
  dish.position.set(0.4, 2.6, 0);
  dish.rotation.set(0, 0, 0);
  const dishPivot = new THREE.Group();
  dishPivot.position.set(0.4, 2.4, 0);
  dish.position.set(0, 0.3, 0);
  dish.rotation.x = Math.PI / 2;
  dishPivot.add(dish);
  crank.add(dishPivot);
  scene.add(label(crank, 'The Sky Crank', "Lumi's Sky Crank. Nobody knows what it does. Including Lumi."));
  const crankLight = new THREE.PointLight('#5fe1ff', 0, 8, 2);
  crankLight.position.set(18.2, 2, 8);
  scene.add(crankLight);
  let crankSpin = 0;
  updaters.push((dt, t) => {
    crankSpin *= Math.exp(-dt * 2.5);
    wheel.rotation.z -= crankSpin * dt;
    core.scale.setScalar(1 + Math.sin(t * 6) * 0.04 * coreMat.emissiveIntensity);
  });

  // ------------------------------------------------------------- The broken bridge
  const BRIDGE_Z = 4;
  const bridgeHead = new THREE.Group();
  for (const [x, z] of [[20.6, 2.9], [20.6, 5.1], [33.9, 2.9], [33.9, 5.1]]) {
    bridgeHead.add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.5, 8), mat('#c9b79c'), { pos: [x, 0.75, z] }));
    bridgeHead.add(mesh(new THREE.SphereGeometry(0.26, 10, 8), mat('#ffd447'), { pos: [x, 1.55, z] }));
  }
  // Broken plank stubs hanging off each side.
  for (const [x, rotZ] of [[21.5, -0.25], [22.2, -0.6], [33, 0.3]]) {
    bridgeHead.add(mesh(new THREE.BoxGeometry(0.8, 0.12, 2), mat('#a87a4f'), { pos: [x, -0.25 - Math.abs(rotZ) * 0.8, BRIDGE_Z], rot: [0, 0, rotZ] }));
  }
  scene.add(label(bridgeHead, 'The old bridge', 'The old bridge. It broke before we were born.'));

  const STONE_X = [23.2, 25.8, 28.4, 31];
  const LANDING = V(34.8, 0, BRIDGE_Z);
  const bridgeStones = STONE_X.map((x, i) => {
    const g = new THREE.Group();
    g.add(mesh(lumpy(0.95, 1, 0.18, i + 4), toon({ color: '#8d7aa8', flatShading: true }), { pos: [0, -0.75, 0], scale: [1, 0.8, 1] }));
    g.add(mesh(new THREE.CylinderGeometry(0.98, 0.9, 0.3, 14), mat(GRASS.base), { pos: [0, -0.15, 0] }));
    const rune = mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 30), new THREE.MeshStandardMaterial({ color: '#bff6ff', emissive: '#4fe3ff', emissiveIntensity: 0 }), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], cast: false });
    g.add(rune);
    g.userData = { x, phase: i * 1.7, rune, raise: i === 2 ? 0 : 1, sunk: i === 2 };
    g.position.set(x, 0, BRIDGE_Z);
    scene.add(g);
    return g;
  });
  const bridge = {
    stones: bridgeStones,
    landing: LANDING,
    start: V(20.3, 0, BRIDGE_Z),
    drift: 0,
    settled: 0, // 0 = floating free, 1 = locked into a straight bridge
    top(i) {
      const s = bridgeStones[i];
      return V(s.position.x, s.position.y, s.position.z);
    },
    aligned(i, tol) {
      return Math.abs(bridgeStones[i].position.z - BRIDGE_Z) < tol;
    },
    highlight(i, on) {
      bridgeStones.forEach((s, k) => {
        const target = s.userData.sunk ? 0.3 : k === i && on ? 2.2 : this.settled ? 1.4 : 0;
        const m = s.userData.rune.material;
        m.emissiveIntensity += (target - m.emissiveIntensity) * 0.2;
      });
    },
  };
  updaters.push((dt, t) => {
    for (const s of bridgeStones) {
      const u = s.userData;
      const free = 1 - bridge.settled;
      const bobY = Math.sin(t * 1.3 + u.phase) * 0.18 * free;
      const sunkY = (1 - u.raise) * -3.2;
      s.position.y = bobY + sunkY;
      s.position.z = BRIDGE_Z + Math.sin(t * 0.85 + u.phase) * bridge.drift * free;
      s.rotation.y = Math.sin(t * 0.4 + u.phase) * 0.2 * free;
    }
  });

  // ------------------------------------------------------------- Gate Rock
  const gateIsland = island({ x: 40.5, y: 0, z: BRIDGE_Z, r: 6.2, depth: 14, seed: 9 });
  scene.add(gateIsland);
  for (let i = 0; i < 4; i++) scene.add(alienTree(40.5 + rr(-3, 4), BRIDGE_Z + (i % 2 ? 1 : -1) * rr(3, 4.5), rr(0.6, 0.8), '#5aae45', i + 20));

  // The "giant potato": an ancient Starway gate stone, carved with three movement glyphs.
  const gate = new THREE.Group();
  gate.position.set(41.2, 0, BRIDGE_Z);
  const potatoMat = new THREE.MeshStandardMaterial({ color: '#b38b66', roughness: 0.95, emissive: '#3fd8ff', emissiveIntensity: 0 });
  gate.add(mesh(lumpy(1.6, 3, 0.12, 5), potatoMat, { pos: [0, 1.45, 0], scale: [0.9, 1, 1.25] }));
  const GLYPHS = ['star', 'bridge', 'moon'];
  const glyphMats = GLYPHS.map(k => new THREE.MeshStandardMaterial({ color: '#6b5240', emissiveMap: glyphTexture(k), emissive: '#ffffff', emissiveIntensity: 0, alphaMap: glyphTexture(k), transparent: true, depthWrite: false }));
  glyphMats.forEach((m, i) => {
    const p = mesh(new THREE.PlaneGeometry(0.7, 0.7), m, { pos: [-1.68, 1.45 + (i === 1 ? 0.35 : 0), (i - 1) * 0.85], rot: [0, -Math.PI / 2, 0], cast: false });
    gate.add(p);
  });
  const slot = mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 20), mat('#4b3d6e'), { pos: [-0.2, 2.98, 0], rot: [Math.PI / 2, 0, 0] });
  gate.add(slot);
  const gateLight = new THREE.PointLight('#5fe1ff', 0, 12, 2);
  gateLight.position.set(-1.5, 2, 0);
  gate.add(gateLight);
  scene.add(label(gate, 'The giant potato', "Nutty calls it the giant potato. I'm... not totally sure he's wrong."));

  // Beam from the Sky Crank to the gate.
  const beamFrom = V(18.2, 2.7, 8), beamTo = V(40.9, 2.9, BRIDGE_Z);
  const beam = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#8ff0ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), { cast: false, receive: false });
  beam.visible = false;
  scene.add(beam);

  // ------------------------------------------------------------- Starways
  const homeway = ribbon([V(19.6, 0.12, BRIDGE_Z), V(23, 0.14, BRIDGE_Z), V(27, 0.14, BRIDGE_Z), V(31, 0.14, BRIDGE_Z), V(35.2, 0.12, BRIDGE_Z)], 1.6, '#8fefff');
  scene.add(homeway);
  const forestway = ribbon([V(44, 0.4, 2), V(50, 2.5, -4), V(57, 4.5, -11), V(64, 4.4, -16), V(70, 3.2, -19)], 1.7, '#9ff7d8');
  scene.add(forestway);

  // ------------------------------------------------------------- Glow Forest (dormant until the end)
  const forest = island({ x: 76, y: 2, z: -24, r: 12, depth: 22, seed: 14, top: '#2f6f5c', rock: ['#4f6488', '#3d4878', '#2a3060'] });
  scene.add(forest);
  const glowMats = [];
  const glow = (c) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, roughness: 0.6 });
    glowMats.push(m);
    return m;
  };
  for (let i = 0; i < 9; i++) {
    const a = rr(0, Math.PI * 2), d = rr(1, 10);
    const x = 76 + Math.cos(a) * d, z = -24 + Math.sin(a) * d;
    const h = rr(2.5, 6);
    scene.add(mesh(new THREE.CylinderGeometry(0.25, 0.45, h, 10), mat('#d9e8ff'), { pos: [x, 2 + h / 2, z] }));
    scene.add(mesh(new THREE.SphereGeometry(rr(1.2, 2.2), 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glow(['#58f0d0', '#7f9cff', '#c08bff'][i % 3]), { pos: [x, 2 + h, z], scale: [1, 0.6, 1] }));
  }
  for (let i = 0; i < 40; i++) {
    const a = rr(0, Math.PI * 2), d = rr(1, 11);
    scene.add(mesh(new THREE.SphereGeometry(rr(0.12, 0.3), 8, 6), glow(['#a7fff0', '#ffe9a8', '#c7b3ff'][i % 3]), { pos: [76 + Math.cos(a) * d, 2.3, -24 + Math.sin(a) * d] }));
  }
  for (let i = 0; i < 4; i++) scene.add(alienTree(76 + rr(-8, 8), -24 + rr(-8, 8), rr(1.3, 1.8), '#246b6b', i + 40).translateY(2));
  const forestLight = new THREE.PointLight('#6fffe0', 0, 40, 1.5);
  forestLight.position.set(76, 9, -24);
  scene.add(forestLight);
  const mist = [];
  for (let i = 0; i < 14; i++) {
    const c = cloud(76 + rr(-12, 12), rr(3, 10), -24 + rr(-12, 12), rr(10, 18), 0.85, '#c9d6f0');
    scene.add(c);
    mist.push(c);
  }
  const forestLabel = new THREE.Group();
  forestLabel.position.set(76, 4, -24);
  scene.add(forestLabel);

  // ------------------------------------------------------------- Far islands: there's more out there
  const falls = [];
  const farIsland = (o, withFall) => {
    const g = island(o);
    scene.add(g);
    for (let i = 0; i < 3; i++) g.add(alienTree(rr(-o.r * 0.5, o.r * 0.5), rr(-o.r * 0.5, o.r * 0.5), rr(0.8, 1.2), ['#5aae45', '#ff8fb5', '#62b84a'][i], o.seed + i));
    if (withFall) {
      const f = waterfall(withFall, 70);
      const a = Math.atan2(-o.z, -o.x); // face roughly toward the centre of the world
      f.position.set(Math.cos(a) * (o.r + 0.1), -0.1, Math.sin(a) * (o.r + 0.1));
      f.rotation.y = -a + Math.PI / 2;
      g.add(f);
      falls.push(f);
      const stream = mesh(new THREE.BoxGeometry(withFall, 0.08, o.r * 0.8), new THREE.MeshStandardMaterial({ color: '#4fb6e8', roughness: 0.1 }), { cast: false });
      stream.position.set(Math.cos(a) * o.r * 0.6, 0.02, Math.sin(a) * o.r * 0.6);
      stream.rotation.y = -a + Math.PI / 2;
      g.add(stream);
    }
    return g;
  };
  farIsland({ x: -46, y: -3, z: -34, r: 9, depth: 22, seed: 21 }, 4);
  farIsland({ x: -62, y: 12, z: 14, r: 7, depth: 18, seed: 31 }, 3);
  farIsland({ x: 16, y: -9, z: -46, r: 6, depth: 16, seed: 41 }, 2.5);
  farIsland({ x: -32, y: -12, z: 46, r: 7, depth: 16, seed: 51 }, 0);
  farIsland({ x: 62, y: -8, z: 34, r: 8, depth: 18, seed: 61 }, 3.5);
  farIsland({ x: -10, y: -16, z: 60, r: 9, depth: 18, seed: 71 }, 4);

  // Railway island with a little train looping round it.
  const rail = farIsland({ x: 44, y: 9, z: -52, r: 8, depth: 20, seed: 81 }, 0);
  rail.add(mesh(new THREE.TorusGeometry(10.5, 0.14, 6, 90), mat('#6b5240'), { pos: [0, 0.4, 0], rot: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rail.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), mat('#6b5240'), { pos: [Math.cos(a) * 10.5, -2.6, Math.sin(a) * 10.5] }));
  }
  const train = new THREE.Group();
  ['#ff6f9c', '#ffd447', '#5ec3ff', '#7fd35a'].forEach((c, i) => {
    const car = new THREE.Group();
    car.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), mat(c)));
    car.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 12, 1, false, 0, Math.PI), mat('#fff3df'), { pos: [0, 0.45, 0], rot: [0, 0, Math.PI / 2] }));
    car.userData.offset = -i * 0.17;
    train.add(car);
  });
  rail.add(train);
  updaters.push((dt, t) => {
    train.children.forEach(car => {
      const a = t * 0.22 + car.userData.offset;
      car.position.set(Math.cos(a) * 10.5, 1, Math.sin(a) * 10.5);
      car.rotation.y = -a;
    });
  });

  // The Lost Observatory, high on a lonely cliff.
  const obs = island({ x: -30, y: 18, z: -66, r: 6, depth: 46, seed: 91 });
  scene.add(obs);
  obs.add(mesh(new THREE.CylinderGeometry(2.6, 2.8, 3, 24), mat('#d6d0e6'), { pos: [0, 1.5, 0] }));
  obs.add(mesh(new THREE.SphereGeometry(2.7, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat('#eef0f8', { metalness: 0.3, roughness: 0.4 }), { pos: [0, 3, 0] }));
  obs.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 12), mat('#4b4f6e'), { pos: [1.2, 5, 1.2], rot: [0.5, 0, -0.6] }));
  obs.add(mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshStandardMaterial({ color: '#a7f0ff', emissive: '#4fd8ff', emissiveIntensity: 1.4 }), { pos: [0, 2, 2.85], cast: false }));

  // Butterflies drifting over the square.
  const flyMat = new THREE.MeshStandardMaterial({ color: '#ffd447', side: THREE.DoubleSide, emissive: '#ffb347', emissiveIntensity: 0.3 });
  const flies = Array.from({ length: 8 }, (_, i) => {
    const b = new THREE.Group();
    const wing = new THREE.CircleGeometry(0.16, 8);
    const l = new THREE.Mesh(wing, i % 2 ? flyMat : mat('#ff8fc0', { side: THREE.DoubleSide }));
    const r = l.clone();
    l.position.x = -0.12;
    r.position.x = 0.12;
    const lp = new THREE.Group(); lp.add(l);
    const rp = new THREE.Group(); rp.add(r);
    b.add(lp, rp);
    b.userData = { lp, rp, cx: rr(-15, 15), cz: rr(-15, 15), s: rr(0.5, 1) };
    scene.add(b);
    return b;
  });
  updaters.push((dt, t) => {
    flies.forEach((b, i) => {
      const u = b.userData;
      const a = t * 0.3 * u.s + i;
      b.position.set(u.cx + Math.sin(a) * 3, 1.2 + Math.sin(t * 2 + i) * 0.4, u.cz + Math.cos(a * 1.3) * 3);
      b.rotation.y = a;
      const f = Math.sin(t * 18 + i) * 0.9;
      u.lp.rotation.y = f;
      u.rp.rotation.y = -f;
    });
  });

  updaters.push(dt => {
    for (const f of falls) f.userData.tex.offset.y += dt * 0.9;
    homeway.material.map.offset.y -= dt * 0.8;
    forestway.material.map.offset.y -= dt * 0.8;
  });

  return {
    places: PLACES,
    clickable,
    relic,
    garden,
    bridge,
    crank: {
      position: V(18.2, 0, 8),
      setCharge(k) {
        coreMat.emissiveIntensity = 0.1 + k * 3;
        crankLight.intensity = k * 10;
      },
      kick() { crankSpin += 9; },
      aimDish(t) { dishPivot.rotation.z = -t * 1.2; },
      // Pans the dish around: 0 faces the gate (east), PI/2 faces south, PI faces west.
      turnDish(angle) { dishPivot.rotation.y = angle; },
    },
    beam: {
      show(k) {
        beam.visible = k > 0;
        const end = beamFrom.clone().lerp(beamTo, k);
        const mid = beamFrom.clone().add(end).multiplyScalar(0.5);
        beam.position.copy(mid);
        beam.scale.set(1, Math.max(0.01, beamFrom.distanceTo(end)), 1);
        beam.lookAt(end);
        beam.rotateX(Math.PI / 2);
      },
      fade(o) { beam.material.opacity = o; },
    },
    gate: {
      position: gate.position,
      slot: V(41, 3.05, BRIDGE_Z),
      glyphs: GLYPHS,
      setGlyph(i, k) { glyphMats[i].emissiveIntensity = k; glyphMats[i].color.set(k > 0.5 ? '#8ff0ff' : '#6b5240'); },
      setPower(k) { potatoMat.emissiveIntensity = k * 0.08; gateLight.intensity = k * 6; },
    },
    homeway,
    forestway,
    forest: {
      position: V(76, 3, -24),
      reveal(k) {
        for (const m of glowMats) m.emissiveIntensity = 0.12 + k * 1.6;
        forestLight.intensity = k * 60;
        for (const c of mist) c.material.opacity = 0.85 * (1 - k * 0.8);
      },
    },
    update(dt, t) {
      for (const u of updaters) u(dt, t);
    },
    // Toon shading on or off (for comparing in the ?debug panel).
    setToon(on) {
      scene.traverse(o => {
        const twin = o.material && twins.get(o.material);
        if (twin && twin.isMeshToonMaterial === on) o.material = twin;
      });
    },
  };
}
