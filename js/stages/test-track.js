// A plain pastel runway for testing the runner engine (?debug › Runner test). The real Sky
// River replaces it in Phase 5; this shows what a runner stage provides:
//   stage.runner = {
//     segment(),          one 20-unit piece of ground, built once and reused
//     obstacle[kind](),   a look per obstacle kind (block, gap, wobble, high, sunk)
//     bun, star,          { geometry, material } for the collectibles (drawn in one batch)
//     theme(name),        recolour for a leg (mint / lilac / peach)
//   }
// Everything here is built once, when the stage opens.

import * as THREE from 'three';
import { alienTree } from '../world/alien.js';

const THEMES = {
  mint: { sky: '#d6f5ec', ground: '#9fe3c6', edge: '#7cc9ab' },
  lilac: { sky: '#e9e0ff', ground: '#c7b5f2', edge: '#a993e2' },
  peach: { sky: '#ffe6d6', ground: '#ffc7a8', edge: '#f0a888' },
};

export default {
  id: 'test-track',
  cast: ['poppy'],

  build(stage) {
    const { scene, camera } = stage;
    stage.useSharedEnvironment();
    scene.background = new THREE.Color(THEMES.mint.sky);
    scene.fog = new THREE.Fog(THEMES.mint.sky, 30, 75);
    scene.add(new THREE.HemisphereLight('#f4f8ff', '#c3b3e6', 1.2));
    const sun = new THREE.DirectionalLight('#ffe7c4', 1.8);
    sun.position.set(5, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 12, bottom: -12, far: 40 });
    sun.target.position.set(0, 0, -6);
    scene.add(sun, sun.target);

    camera.position.set(0, 4.2, 7.5);
    camera.lookAt(0, 1, -8);

    const groundMat = new THREE.MeshStandardMaterial({ color: THEMES.mint.ground, roughness: 0.9 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: THEMES.mint.edge, roughness: 0.9 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, transparent: true, opacity: 0.5 });
    const groundGeo = new THREE.BoxGeometry(8, 0.6, 20);
    const edgeGeo = new THREE.BoxGeometry(1.2, 0.9, 20);
    const stripeGeo = new THREE.PlaneGeometry(0.08, 20);
    let treeSeed = 1;

    const mesh = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    };

    stage.runner = {
      segment() {
        const g = new THREE.Group();
        g.add(mesh(groundGeo, groundMat, 0, -0.3, -10));
        g.add(mesh(edgeGeo, edgeMat, -4.4, -0.15, -10), mesh(edgeGeo, edgeMat, 4.4, -0.15, -10));
        for (const x of [-1.1, 1.1]) {
          const s = new THREE.Mesh(stripeGeo, stripeMat);
          s.rotation.x = -Math.PI / 2;
          s.position.set(x, 0.01, -10);
          g.add(s);
        }
        for (const side of [-1, 1]) {
          const t = alienTree(side * (6 + (treeSeed % 3)), -4 - (treeSeed % 4) * 4, 0.7, null, treeSeed++);
          g.add(t);
        }
        return g;
      },
      obstacle: {
        // One lane: a soft cloud puff. A wall is two of these.
        block() {
          const g = new THREE.Group();
          const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
          for (const [x, y, s] of [[0, 0.6, 0.75], [-0.45, 0.45, 0.5], [0.45, 0.45, 0.55], [0, 1.05, 0.45]]) g.add(mesh(new THREE.SphereGeometry(s, 20, 14), m, x, y, 0));
          return g;
        },
        // Jump: a glowing gap across all lanes.
        gap() {
          const g = new THREE.Group();
          g.add(mesh(new THREE.BoxGeometry(6.8, 0.62, 1.6), new THREE.MeshStandardMaterial({ color: '#3a2f63', roughness: 1 }), 0, -0.29, 0));
          g.add(mesh(new THREE.BoxGeometry(6.8, 0.05, 0.12), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#8ff0ff', emissiveIntensity: 1.6 }), 0, 0.03, 0.8));
          return g;
        },
        wobble() {
          const g = new THREE.Group();
          g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 6.6, 16), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb300', emissiveIntensity: 0.6 }), 0, 0.3, 0));
          g.children[0].rotation.z = Math.PI / 2;
          return g;
        },
        // Duck: a branch across all lanes, at head height.
        high() {
          const g = new THREE.Group();
          const bar = mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 16), new THREE.MeshStandardMaterial({ color: '#b28cff', roughness: 0.5 }), 0, 1.35, 0);
          bar.rotation.z = Math.PI / 2;
          g.add(bar);
          for (const x of [-3.4, 3.4]) g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.5, 12), bar.material, x, 0.7, 0));
          return g;
        },
        // Arms up: a sunken stone across the path; it rises when cleared.
        sunk() {
          const g = new THREE.Group();
          g.add(mesh(new THREE.BoxGeometry(6.6, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: '#8d7aa8', roughness: 0.8, emissive: '#ffd447', emissiveIntensity: 0.15 }), 0, -0.2, 0));
          return g;
        },
      },
      bun: { geometry: new THREE.SphereGeometry(0.28, 18, 12).scale(1.2, 0.8, 1), material: new THREE.MeshStandardMaterial({ color: '#e0a050', roughness: 0.7 }) },
      star: { geometry: new THREE.OctahedronGeometry(0.4), material: new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffd447', emissiveIntensity: 1.5 }) },
      theme(name) {
        const t = THEMES[name] ?? THEMES.mint;
        scene.background.set(t.sky);
        scene.fog.color.set(t.sky);
        groundMat.color.set(t.ground);
        edgeMat.color.set(t.edge);
      },
    };
  },
};

// A small runner activity for ?debug › Runner test.
export const testRun = {
  id: 'debug.test-run',
  label: 'Test run',
  engine: 'runner',
  stage: 'test-track',
  hero: 'poppy',
  goal: 'Test run: dodge, jump, duck, catch buns',
  legs: [
    { length: 175, theme: 'mint', patterns: ['bun-line', 'puff', 'gap', 'puff-buns', 'gap-buns'] },
    { length: 200, theme: 'lilac', patterns: ['branch', 'wobble', 'sunk', 'puff-gap', 'bun-arc'] },
    { length: 225, theme: 'peach', patterns: ['wall-jump', 'branch-wobble', 'star-stone', 'zigzag', 'double-gap'] },
  ],
  tune: {
    little: { speed: { start: 7.5, max: 10.5 }, breatherEvery: 180 },
    big: { speed: { start: 10, max: 15 }, breatherEvery: 240 },
  },
  text: {
    hit: ['Oops! Keep going!', 'Wobble! You got this!', 'Up we get!'],
    goal: 'You made it!',
  },
};
