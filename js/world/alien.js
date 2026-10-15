// Alien flora and pod houses for Astra.
// Smooth, high-segment shapes with soft glossy materials and small glowing details,
// so the world reads as "another planet" rather than an Earth village.
// Drop-in replacements: alienTree(x, z, s, colour, seed) for tree(), alienHouse({...}) for cottage().

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Alien palette. Earth greens passed in by old call sites are swapped for these.
export const ALIEN = {
  mint: '#7ef0d0', teal: '#3fc9c0', lilac: '#b79cff', violet: '#8a6cf0',
  coral: '#ff8fb8', peach: '#ffb98a', sky: '#86cfff', lemon: '#ffe48a',
  glowCyan: '#7ff7ff', glowPink: '#ff9be6', glowGold: '#ffd76a',
};
const CROWNS = [ALIEN.mint, ALIEN.lilac, ALIEN.coral, ALIEN.sky, ALIEN.teal, ALIEN.peach];
const GLOWS = [ALIEN.glowCyan, ALIEN.glowPink, ALIEN.glowGold];

// Small seeded random so every tree is different but stable between reloads.
function rng(seed) {
  let s = (Math.abs(Math.floor(seed * 9973)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---- Materials --------------------------------------------------------------------
// Soft "glossy clay": smooth shading, a little sheen from the scene environment.
const softCache = new Map();
function soft(color, { rough = 0.42, emissive = null, glow = 0 } = {}) {
  const key = `${color}|${rough}|${emissive}|${glow}`;
  if (!softCache.has(key)) {
    softCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: 0,
      emissive: emissive || '#000000', emissiveIntensity: glow,
    }));
  }
  return softCache.get(key);
}
const glowMat = c => soft('#ffffff', { rough: 0.3, emissive: c, glow: 1.6 });
const glass = new THREE.MeshPhysicalMaterial({
  color: '#cfefff', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
  transparent: true, opacity: 0.55, emissive: '#7fe6ff', emissiveIntensity: 0.12, depthWrite: false,
});

function mesh(geo, material, { pos, rot, scale, cast = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// A tube that tapers from r0 at the start to r1 at the end. Smooth, no seams.
function taperTube(points, r0, r1, segs = 32, radial = 14) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position;
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

const SPHERE = new THREE.SphereGeometry(1, 40, 28);
const SMALL = new THREE.SphereGeometry(1, 20, 14);

// ---- Trees -----------------------------------------------------------------------
// Four species, picked by seed:
//   0 Lantern palm   – arched trunk, drooping fronds that end in glowing bulbs
//   1 Jelly stack    – stalk with stacked, spotted, glossy caps
//   2 Spiral coral   – a twisting tapered spiral with orbs along it
//   3 Ringed orb     – a glossy planet-like crown circled by a tilted ring
export function alienTree(x, z, s = 1, colour = null, seed = 1) {
  const R = rng(seed + 1);
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = R() * Math.PI * 2;
  const species = Math.abs(Math.floor(seed)) % 4;
  const isEarthGreen = !colour || new THREE.Color(colour).getHSL({}).h > 0.2 && new THREE.Color(colour).getHSL({}).h < 0.42;
  const crown = isEarthGreen ? CROWNS[Math.floor(R() * CROWNS.length)] : colour;
  const glow = GLOWS[Math.floor(R() * GLOWS.length)];
  const stalk = new THREE.Color(crown).offsetHSL(0, -0.15, -0.18).getStyle();
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  g.add(inner);

  if (species === 0) {
    const lean = 0.4 + R() * 0.3;
    inner.add(mesh(taperTube([V(0, 0, 0), V(0.1, 1.2, 0), V(lean * 0.6, 2.4, 0), V(lean, 3.3, 0)], 0.26, 0.12), soft(stalk)));
    const top = V(lean, 3.35, 0);
    inner.add(mesh(SPHERE, soft(crown, { rough: 0.35 }), { pos: [top.x, top.y + 0.1, top.z], scale: [0.32, 0.4, 0.32] }));
    inner.add(mesh(SMALL, glowMat(glow), { pos: [top.x, top.y + 0.55, top.z], scale: 0.14, cast: false }));
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.3;
      const len = 1.3 + R() * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      const end = V(top.x + dx * len, top.y - 0.6 - R() * 0.4, top.z + dz * len);
      inner.add(mesh(taperTube([top.clone().add(V(0, 0.2, 0)), V(top.x + dx * len * 0.5, top.y + 0.6, top.z + dz * len * 0.5), end], 0.14, 0.05, 24, 10), soft(crown, { rough: 0.38 })));
      inner.add(mesh(SMALL, glowMat(glow), { pos: [end.x, end.y - 0.12, end.z], scale: 0.2, cast: false }));
    }
  } else if (species === 1) {
    inner.add(mesh(taperTube([V(0, 0, 0), V(0.05, 1.5, 0.05), V(-0.05, 3, 0)], 0.22, 0.14), soft(stalk)));
    const caps = [[2.1, 1.25], [2.85, 0.95], [3.5, 0.62]];
    caps.forEach(([y, r], i) => {
      const c = i === 1 ? new THREE.Color(crown).offsetHSL(0.04, 0, 0.06).getStyle() : crown;
      inner.add(mesh(SPHERE, soft(c, { rough: 0.25, emissive: c, glow: 0.08 }), { pos: [0, y, 0], scale: [r, r * 0.42, r] }));
      inner.add(mesh(SPHERE, soft(new THREE.Color(c).offsetHSL(0, 0, 0.12).getStyle()), { pos: [0, y - r * 0.12, 0], scale: [r * 0.82, r * 0.2, r * 0.82] }));
      for (let k = 0; k < 5 + i; k++) {
        const a = R() * Math.PI * 2, d = r * (0.35 + R() * 0.45);
        inner.add(mesh(SMALL, glowMat(glow), { pos: [Math.cos(a) * d, y + r * 0.34 * Math.sqrt(1 - (d / r) ** 2) + 0.02, Math.sin(a) * d], scale: 0.07 + R() * 0.04, cast: false }));
      }
    });
    inner.add(mesh(SMALL, glowMat(glow), { pos: [0, 3.85, 0], scale: 0.16, cast: false }));
  } else if (species === 2) {
    // Horn coral: a cluster of curved horns rising from one base, each with a glowing tip.
    const horns = 4 + Math.floor(R() * 2);
    for (let i = 0; i < horns; i++) {
      const a = (i / horns) * Math.PI * 2 + R() * 0.4;
      const hgt = 2.4 + R() * 1.4, out = 0.6 + R() * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      const tip = V(dx * out * 1.4, hgt, dz * out * 1.4);
      const tint = i % 2 ? crown : new THREE.Color(crown).offsetHSL(0.05, 0, 0.08).getStyle();
      inner.add(mesh(taperTube([V(dx * 0.1, 0, dz * 0.1), V(dx * out, hgt * 0.35, dz * out), V(dx * out * 0.9, hgt * 0.75, dz * out * 0.9), tip], 0.24, 0.07, 40, 14), soft(tint, { rough: 0.28 })));
      inner.add(mesh(SMALL, glowMat(glow), { pos: [tip.x, tip.y + 0.05, tip.z], scale: 0.15, cast: false }));
      for (let k = 0; k < 2; k++) {
        const t = 0.4 + k * 0.22;
        inner.add(mesh(SMALL, soft(new THREE.Color(tint).offsetHSL(0, 0, 0.14).getStyle(), { rough: 0.25 }),
          { pos: [dx * out * (1.0 + k * 0.1) + dx * 0.18, hgt * t, dz * out * (1.0 + k * 0.1) + dz * 0.18], scale: 0.09, cast: false }));
      }
    }
  } else {
    inner.add(mesh(taperTube([V(0, 0, 0), V(0.25, 1.2, 0), V(-0.1, 2.3, 0), V(0, 2.9, 0)], 0.2, 0.1), soft(stalk)));
    inner.add(mesh(SPHERE, soft(crown, { rough: 0.22, emissive: crown, glow: 0.06 }), { pos: [0, 3.55, 0], scale: 0.95 }));
    inner.add(mesh(SPHERE, soft(new THREE.Color(crown).offsetHSL(0, 0, 0.15).getStyle(), { rough: 0.2 }), { pos: [-0.32, 3.85, 0.55], scale: 0.28, cast: false }));
    const ring = mesh(new THREE.TorusGeometry(1.45, 0.07, 16, 96), glowMat(glow), { pos: [0, 3.55, 0], rot: [Math.PI / 2 - 0.45, 0.25, 0], cast: false });
    inner.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + R();
      inner.add(mesh(SMALL, soft(ALIEN.lemon, { rough: 0.3 }), { pos: [Math.cos(a) * 1.9, 3.3 + R() * 0.8, Math.sin(a) * 1.9], scale: 0.12, cast: false }));
    }
  }

  // Soft glowing roots where the plant meets the ground.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + R();
    inner.add(mesh(SPHERE, soft(stalk, { rough: 0.5 }), { pos: [Math.cos(a) * 0.22, 0.0, Math.sin(a) * 0.22], scale: [0.24, 0.06, 0.14], rot: [0, -a, 0] }));
  }
  return g;
}

// ---- Houses ----------------------------------------------------------------------
// A seed-pod home: a smooth bulb body, a glass dome cap, a glowing band, fins,
// porthole windows and an oval door. Same options and footprint as cottage(),
// with the door facing +z at about r from the centre.
export function alienHouse({ wall, roof, r = 1.6, h = 2.2, roofH = 1.8, window: win = '#ffd98a', tilt = 0, chimney = false }) {
  const g = new THREE.Group();
  const accent = roof;
  const bodyPts = [
    [0, 0], [r * 0.78, 0], [r * 0.92, h * 0.1], [r * 1.06, h * 0.42], [r * 1.02, h * 0.72],
    [r * 0.86, h * 0.95], [r * 0.62, h * 1.08], [0, h * 1.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(new THREE.SplineCurve(bodyPts).getPoints(40), 64);
  g.add(mesh(body, soft(wall, { rough: 0.4 })));

  // Glowing band where the dome meets the body.
  g.add(mesh(new THREE.TorusGeometry(r * 0.8, 0.09, 16, 80), glowMat(ALIEN.glowCyan), { pos: [0, h * 0.98, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
  // A ring of accent-coloured scallops below the band.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(SPHERE, soft(accent, { rough: 0.3 }), { pos: [Math.cos(a) * r * 0.9, h * 0.86, Math.sin(a) * r * 0.9], scale: [0.26, 0.14, 0.26] }));
  }

  // Glass dome with something glowing inside.
  const dome = new THREE.Group();
  dome.position.y = h * 1.0;
  dome.rotation.z = tilt;
  dome.add(mesh(new THREE.SphereGeometry(r * 0.66, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass, { scale: [1, roofH / (r * 0.9), 1], cast: false }));
  dome.add(mesh(SMALL, glowMat(win), { pos: [0, r * 0.25, 0], scale: r * 0.22, cast: false }));
  g.add(dome);

  // Three soft fins, like a seed pod.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6 + Math.PI;
    const fin = mesh(SPHERE, soft(accent, { rough: 0.32 }), { pos: [Math.cos(a) * r * 0.98, h * 0.35, Math.sin(a) * r * 0.98], scale: [0.16, h * 0.42, r * 0.42] });
    fin.rotation.y = -a;
    g.add(fin);
  }

  // Antenna (replaces the chimney).
  if (chimney) {
    const base = V(-r * 0.25, h * 1.05, -r * 0.3);
    g.add(mesh(taperTube([base, base.clone().add(V(-0.1, 0.8, 0)), base.clone().add(V(0.25, 1.5, 0.1))], 0.06, 0.03, 20, 8), soft(accent)));
    g.add(mesh(SMALL, glowMat(ALIEN.glowPink), { pos: [base.x + 0.25, base.y + 1.6, base.z + 0.1], scale: 0.14, cast: false }));
  }

  // Oval door with a glowing frame, facing +z.
  const door = new THREE.Group();
  door.position.set(0, 0, r * 1.02);
  const doorCol = new THREE.Color(accent).offsetHSL(0, -0.1, -0.15).getStyle();
  door.add(mesh(new THREE.CylinderGeometry(1, 1, 0.12, 48), soft(doorCol, { rough: 0.35 }), { pos: [0, 0.72, 0.02], rot: [Math.PI / 2, 0, 0], scale: [0.4, 1, 0.66] }));
  door.add(mesh(new THREE.TorusGeometry(1, 0.07, 12, 64), glowMat(ALIEN.glowCyan), { pos: [0, 0.72, 0.09], scale: [0.44, 0.7, 1], cast: false }));
  door.add(mesh(SMALL, glowMat(win), { pos: [0.22, 0.7, 0.12], scale: 0.05, cast: false }));
  door.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 40), soft(accent, { rough: 0.35 }), { pos: [0, 0.04, 0.22] }));
  g.add(door);

  // Porthole windows.
  for (const [a, y] of [[0.75, 0.6], [-0.9, 0.55], [2.5, 0.5]]) {
    const w = new THREE.Group();
    const rr = r * 1.08;
    w.position.set(Math.sin(a) * rr, h * y, Math.cos(a) * rr);
    w.rotation.y = a;
    w.add(mesh(new THREE.CircleGeometry(0.26, 40), glowMat(win), { cast: false }));
    w.add(mesh(new THREE.TorusGeometry(0.28, 0.06, 12, 40), soft(accent, { rough: 0.3 })));
    g.add(w);
  }

  // A faint hover ring on the ground.
  g.add(mesh(new THREE.TorusGeometry(r * 1.12, 0.05, 10, 96), glowMat(ALIEN.glowCyan), { pos: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
  return g;
}
