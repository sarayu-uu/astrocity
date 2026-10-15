// A plain pastel runway for testing the runner engine (?debug › Runner test). The real Sky
// River replaces it in Phase 5; this shows what a runner stage provides:
//   stage.runner = {
//     segment(),          one 20-unit piece of ground, built once and reused
//     obstacle[kind](),   a look per obstacle kind (block, gap, wobble, high, sunk)
//     bun, star,          { geometry, material } for the collectibles (drawn in one batch)
//     theme(name),        recolour for a leg (mint / lilac / peach)
//   }
//   stage.setPieces = { name(stage) }   the things each set piece moves (see set-piece.js)
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

    // Set pieces (Phase 4): one of each kind of step, so Runner test shows them all.
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const gapMat = new THREE.MeshStandardMaterial({ color: '#3a2f63', roughness: 1 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#a99ac4', roughness: 0.8 });
    const glow = color => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.4 });
    const gap = (z, depth) => mesh(new THREE.BoxGeometry(6.8, 0.62, depth), gapMat, 0, -0.29, z);

    stage.setPieces = {
      // Jump to stomp three floating stones into a line; arms up to lift a sunk one.
      stones() {
        const root = new THREE.Group();
        root.add(gap(-7.5, 4.2));
        const stones = [-2.2, 0, 2.2].map((x, i) => {
          const s = mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.45, 20), stoneMat, x, 0, -6.6);
          s.userData.high = 1.6 + i * 0.45;
          s.userData.tilt = [0.5, -0.4, 0.35][i];
          root.add(s);
          return s;
        });
        const sunkMat = glow('#ffd447');
        const sunk = mesh(new THREE.BoxGeometry(5.2, 0.5, 1.3), sunkMat, 0, -0.22, -9); // only its top shows
        root.add(sunk);
        return {
          root,
          shot: { pos: [6.5, 3.8, 3], look: [0, 0.4, -5.5] }, // from the side, Poppy on the left
          cheerAt: [0, 1, -7.5],
          does: {
            stomp: stage.smooth(k => stones.forEach((s, i) => {
              const t = clamp01(k * 3 - i);
              s.position.y = lerp(s.userData.high, -0.18, t) + Math.sin(performance.now() / 400 + i) * 0.12 * (1 - t);
              s.rotation.z = lerp(s.userData.tilt, 0, t);
            }), 6),
            lift: stage.smooth(k => {
              sunk.position.y = lerp(-0.22, 0.3, k);
              sunk.rotation.z = lerp(0.12, 0, k);
              sunkMat.emissiveIntensity = 0.2 + k * 1.2;
            }, 4),
          },
        };
      },

      // Step left and right: three planks slide across the gap; a light follows the child.
      planks() {
        const root = new THREE.Group();
        root.add(gap(-7.5, 4.6));
        const plankMat = new THREE.MeshStandardMaterial({ color: '#e7b98a', roughness: 0.7 });
        const planks = [-2.2, 0, 2.2].map((x, i) => {
          const p = mesh(new THREE.BoxGeometry(1.9, 0.25, 4.4), plankMat, x, 0, -7.5);
          p.userData.x = x;
          p.userData.from = (i % 2 ? 1 : -1) * 7;
          root.add(p);
          return p;
        });
        const lightMat = glow('#8ff0ff');
        lightMat.emissiveIntensity = 1.4;
        const light = mesh(new THREE.SphereGeometry(0.35, 20, 14), lightMat, 0, 1.3, -4.6);
        root.add(light);
        return {
          root,
          shot: { pos: [0, 5.4, 4.2], look: [0, -0.4, -6.5] },
          cheerAt: [0, 1, -7.5],
          does: {
            push: stage.smooth((k, info) => {
              planks.forEach((p, i) => {
                const t = clamp01(k * 3 - i);
                p.position.x = lerp(p.userData.from, p.userData.x, t);
                p.position.y = lerp(-0.6, 0, t);
              });
              light.position.x = (info.aim ?? 0) * 2.2;
            }, 5),
          },
        };
      },

      // Arm pumps turn a crank and fill its meter; a star pose lights the glyph.
      crank() {
        const root = new THREE.Group();
        const wheelMat = glow('#ffb347');
        const wheel = new THREE.Group();
        wheel.add(mesh(new THREE.TorusGeometry(1.1, 0.13, 12, 40), wheelMat, 0, 0, 0));
        for (let i = 0; i < 4; i++) {
          const spoke = mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), wheelMat, 0, 0, 0);
          spoke.rotation.z = (i * Math.PI) / 4;
          wheel.add(spoke);
        }
        wheel.position.set(2.4, 1.9, -7);
        const postMat = new THREE.MeshStandardMaterial({ color: '#8d7aa8', roughness: 0.8 });
        root.add(wheel, mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.9, 12), postMat, 2.4, 0.95, -7.3));
        root.add(mesh(new THREE.BoxGeometry(0.5, 2.6, 0.3), postMat, 4.0, 1.3, -7.2));
        const fillMat = glow('#8ff0ff');
        fillMat.emissiveIntensity = 1.2;
        const fill = mesh(new THREE.BoxGeometry(0.34, 2.4, 0.34).translate(0, 1.2, 0), fillMat, 4.0, 0.1, -7.05);
        root.add(fill);
        const star = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 0.45 : 1.05;
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        const glyphMat = glow('#ffd447');
        const glyph = mesh(new THREE.ExtrudeGeometry(star, { depth: 0.18, bevelEnabled: false }), glyphMat, -1.6, 2.2, -7.4);
        root.add(glyph);
        return {
          root,
          shot: { pos: [0, 3.4, 7], look: [0.5, 0.9, -6] },
          cheerAt: [0.4, 2, -7],
          does: {
            crank: stage.smooth(k => {
              wheel.rotation.z = -k * Math.PI * 6;
              fill.scale.y = Math.max(0.02, k);
              wheelMat.emissiveIntensity = 0.2 + k * 0.8;
            }, 5),
            glyph: stage.smooth(k => {
              glyphMat.emissiveIntensity = 0.15 + k * 2.6;
              glyph.scale.setScalar(1 + k * 0.25);
            }, 6),
          },
        };
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
    { length: 175, theme: 'mint', patterns: ['bun-line', 'puff', 'gap', 'puff-buns', 'gap-buns'], setPiece: 'stones' },
    { length: 200, theme: 'lilac', patterns: ['branch', 'wobble', 'sunk', 'puff-gap', 'bun-arc'], setPiece: 'planks' },
    { length: 225, theme: 'peach', patterns: ['wall-jump', 'branch-wobble', 'star-stone', 'zigzag', 'double-gap'], setPiece: 'crank' },
  ],
  // One of each step type across the three set pieces.
  setPieces: {
    stones: {
      scene: 'stones',
      steps: [
        { move: 'jump', times: { little: 3, big: 4 }, text: 'Stomp the stones into place!', does: 'stomp', done: 'The stones are in a line!' },
        { move: 'armsUp', hold: 1.4, text: 'Arms up! Lift the sunk stone!', does: 'lift', done: 'You lifted it!' },
      ],
      cheer: 'We can cross!',
    },
    planks: {
      scene: 'planks',
      steps: [{ move: 'step', sequence: { little: ['left', 'right'], big: ['left', 'right', 'left'] }, hold: 0.6, text: 'Push the planks! Step to the {side}!', does: 'push' }],
      cheer: 'A new bridge!',
    },
    crank: {
      scene: 'crank',
      steps: [
        { move: 'pump', times: { little: 5, big: 8 }, text: 'Turn the crank! Arms up, then down!', does: 'crank', done: 'Full power!' },
        { move: 'pose', sequence: ['star'], hold: { little: 0.8, big: 1.3 }, text: 'Make a star to light it up!', does: 'glyph' },
      ],
      cheer: 'It glows!',
    },
  },
  tune: {
    little: { speed: { start: 7.5, max: 10.5 }, breatherEvery: 180 },
    big: { speed: { start: 10, max: 15 }, breatherEvery: 240 },
  },
  text: {
    hit: ['Oops! Keep going!', 'Wobble! You got this!', 'Up we get!'],
    goal: 'You made it!',
  },
};
