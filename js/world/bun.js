// Nutty's bun: a soft bread roll with a golden-brown domed top, a pale flat bottom, and sesame
// seeds sprinkled on top. One geometry with its colours painted on the vertices, so a whole
// trail of buns can be drawn in one batch (instanced) with one material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TOP = new THREE.Color('#b8641f'); // baked crust
const SIDE = new THREE.Color('#e7a24e'); // golden
const BOTTOM = new THREE.Color('#f7dfae'); // pale underside
const SEED = new THREE.Color('#fff6dc');

// A bun `radius` wide (about 0.6 of that tall).
export function bunGeometry(radius = 0.35) {
  // The roll: a sphere puffed up on top and flat underneath, coloured from crust to base.
  const body = new THREE.SphereGeometry(1, 32, 20);
  const p = body.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const squash = y > 0 ? 0.62 : 0.2;
    p.setY(i, y * squash);
    // Crust colour: darkest on the very top, golden around the sides, pale below the middle.
    if (y > 0.25) c.copy(SIDE).lerp(TOP, Math.min(1, (y - 0.25) / 0.6));
    else c.copy(BOTTOM).lerp(SIDE, Math.max(0, Math.min(1, (y + 0.05) / 0.3)));
    colors.push(c.r, c.g, c.b);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  body.computeVertexNormals();

  // Sesame seeds on the dome, in a loose ring and a few near the top.
  const parts = [body];
  const seeds = [[0.3, 0.2], [0.33, 1.4], [0.36, 2.6], [0.31, 3.7], [0.34, 4.9], [0.32, 5.9], [0.62, 0.8], [0.6, 2.2], [0.64, 3.4], [0.6, 4.4], [0.63, 5.5]];
  for (const [r, a] of seeds) {
    const s = new THREE.SphereGeometry(0.065, 6, 4).scale(1.5, 0.5, 0.8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = Math.sqrt(Math.max(0, 1 - r * r)) * 0.62 + 0.01;
    s.rotateX(-z * 0.9).rotateZ(x * 0.9).rotateY(-a).translate(x, y, z);
    s.setAttribute('color', new THREE.Float32BufferAttribute(Array(s.attributes.position.count).fill([SEED.r, SEED.g, SEED.b]).flat(), 3));
    parts.push(s);
  }
  const geo = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)));
  geo.scale(radius, radius, radius);
  geo.computeBoundingSphere();
  return geo;
}

// A soft, slightly glossy material (the colours come from the geometry).
export function bunMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: '#3a1c05', emissiveIntensity: 0.15 });
}
