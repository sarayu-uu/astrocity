// Above the Clouds: where Sky Power happens. Lumi's dish flies over soft cloud banks between
// floating crystal rocks; the gate glows far ahead on the horizon the whole time. Three skies,
// one per leg: golden hour, sunset, then a starry night as the charge fills.
//
// As on the Sky River, the background is soft and desaturated and everything the child must
// react to is bright with a dark outline (storm clouds, crystal rocks and arches, gusts, rings).
//
// What it provides:
//   stage.runner      sky pieces (recycled), obstacle looks, spark and star looks, heights, theme
//   stage.flyer       the flying dish the runner moves (Lumi and Poppy ride it)
//   stage.setPieces   findSignal, crankJam, fullPower: what each moment's moves change
//   stage.sky         story helpers used by run-scenes.js (lift-off, the beam to the gate)

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const THEMES = {
  // (Kept below the bloom threshold: near-white skies and clouds glow and wash the scene out.)
  gold: { sky: '#e8cfa5', cloud: '#ecdcc6', crystal: '#cdbfab', light: 0.9 },
  sunset: { sky: '#eab7a0', cloud: '#f0d4c6', crystal: '#cdb0a8', light: 0.9 },
  stars: { sky: '#262b57', cloud: '#5b5f96', crystal: '#4b5086', light: 0.6 },
};
const SEG = 20;
const LANE = 2.2;
const HEIGHTS = { low: 1.4, high: 3.6 }; // the dish's height when flying low / high
const GATE = new THREE.Vector3(140, 30, -420); // the gate's glow on the horizon (ahead, a little right)
const OUTLINE_COLOR = '#2a1f4a';

export default {
  id: 'sky-above',
  cast: ['lumi', 'poppy'],
  music: 'sky-above',

  build(stage) {
    const { scene, camera, cast } = stage;
    stage.useSharedEnvironment();
    scene.background = new THREE.Color(THEMES.gold.sky);
    scene.fog = new THREE.Fog(THEMES.gold.sky, 35, 140);
    const hemi = new THREE.HemisphereLight('#fff6e8', '#c9b9e0', 1.0);
    const sun = new THREE.DirectionalLight('#ffe2b8', 1.6);
    sun.position.set(-6, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 14, bottom: -14, far: 50 });
    sun.target.position.set(0, 0, -6);
    scene.add(hemi, sun, sun.target);

    // The chase camera: fixed, behind and a little above the dish.
    camera.position.set(0, 5.4, 9.6);
    camera.lookAt(0, 2.4, -14);

    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
    const glow = (color, k = 0.6) => mat(color, { emissive: color, emissiveIntensity: k, roughness: 0.4 });
    const mesh = (geo, material, x = 0, y = 0, z = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = shadow;
      return m;
    };
    const outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    const outlined = (geo, material, x, y, z, rim = 1.08) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(mesh(geo, material));
      const o = new THREE.Mesh(geo, outline);
      o.scale.setScalar(rim);
      g.add(o);
      return g;
    };
    const rand = seeded(11);
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, k) => a + (b - a) * k;

    // ---- Far away: the gate's glow, floating islands, stars (never move) ------------------
    const gateGlow = new THREE.Group();
    gateGlow.add(new THREE.Mesh(new THREE.TorusGeometry(9, 1.6, 16, 48), new THREE.MeshBasicMaterial({ color: '#ffe9a3', fog: false })));
    gateGlow.add(new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshBasicMaterial({ color: '#fff7d6', fog: false, transparent: true, opacity: 0.35 })));
    gateGlow.position.copy(GATE);
    gateGlow.lookAt(0, 4, 0);
    scene.add(gateGlow);
    const islandMat = mat(THEMES.gold.crystal, { roughness: 1 });
    const cloudMat = mat(THEMES.gold.cloud, { roughness: 1 });
    for (const [x, y, z, s] of [[-60, 8, -200, 9], [70, 14, -240, 11], [-30, 20, -300, 7], [90, 4, -160, 6], [-90, 16, -260, 10]]) {
      const isl = new THREE.Group();
      isl.add(mesh(new THREE.ConeGeometry(1, 1.6, 7).rotateX(Math.PI), islandMat, 0, -0.8, 0, false));
      isl.add(mesh(new THREE.SphereGeometry(1, 14, 8).scale(1, 0.25, 1), cloudMat, 0, 0.02, 0, false));
      isl.position.set(x, y, z);
      isl.scale.setScalar(s);
      scene.add(isl);
    }
    const starPos = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const a = rand() * Math.PI * 2, h = 0.05 + rand() * 0.9, r = 320;
      starPos.set([Math.cos(a) * r * Math.sqrt(1 - h * h), h * r, Math.sin(a) * r * Math.sqrt(1 - h * h) - 100], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false }));
    stars.visible = false;
    scene.add(stars);

    // ---- One sky piece: cloud banks below, crystal rocks at the sides (shared geometry) ----
    const blob = (x, y, z, sx, sy, sz) => new THREE.IcosahedronGeometry(1, 2).scale(sx, sy, sz).translate(x, y, z);
    const cloudGeos = [0, 1, 2].map(() => mergeGeometries(Array.from({ length: 9 }, (_, i) =>
      blob(-18 + (i % 5) * 9 + rand() * 3, -5.5 + rand() * 1.2, -2 - (i * 2.1) - rand() * 2, 4 + rand() * 2, 1.6 + rand(), 3.5 + rand()))));
    const crystalGeos = [0, 1, 2].map(() => mergeGeometries([-1, 1].flatMap(side => Array.from({ length: 2 }, (_, i) =>
      new THREE.OctahedronGeometry(1, 0).scale(1.2 + rand(), 2 + rand() * 1.5, 1.2 + rand())
        .rotateY(rand() * Math.PI).translate(side * (11 + rand() * 6), 1 + rand() * 6, -4 - i * 9 - rand() * 3)))));
    const crystalMat = mat(THEMES.gold.crystal, { roughness: 0.6 });
    let pieceNo = 0;

    stage.runner = {
      heights: HEIGHTS,
      segment() {
        const n = pieceNo++;
        const g = new THREE.Group();
        g.add(mesh(cloudGeos[n % 3], cloudMat, 0, 0, 0, false));
        g.add(mesh(crystalGeos[(n + 1) % 3], crystalMat, 0, 0, 0, false));
        return g;
      },
      obstacle: {
        // Change lane: a dark storm cloud in one lane, top to bottom, with a lightning bolt.
        block() {
          const g = new THREE.Group();
          const m = mat('#5d5778', { emissive: '#3c3560', emissiveIntensity: 0.3 });
          for (const [x, y, s] of [[0, 1.2, 1.0], [0.3, 2.6, 1.1], [-0.3, 3.9, 0.95], [0.1, 5.0, 0.7]]) {
            g.add(outlined(new THREE.SphereGeometry(s, 18, 12), m, x, y, 0, 1.08));
          }
          const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), new THREE.MeshBasicMaterial({ color: '#fff27a' }));
          bolt.position.set(0.15, 0.6, 0.7);
          bolt.rotation.z = 0.35;
          g.add(bolt);
          g.userData.animate = spin => { bolt.visible = Math.sin(spin * 7) > -0.2; };
          return g;
        },
        // Fly high: bright crystal rocks across the low path.
        rock() {
          const g = new THREE.Group();
          const m = glow('#6fe9ff', 0.5);
          for (const x of [-2.2, 0, 2.2]) g.add(outlined(new THREE.OctahedronGeometry(1, 0).scale(1.2, 1.25, 1), m, x, 1.2, 0, 1.07));
          return g;
        },
        // Fly low: a pink crystal arch across the high path.
        arch() {
          const g = new THREE.Group();
          const m = glow('#ff7ad9', 0.45);
          g.add(outlined(new THREE.BoxGeometry(9.4, 1.1, 0.9), m, 0, 3.75, 0, 1.04));
          for (const x of [-5, 5]) g.add(outlined(new THREE.BoxGeometry(0.9, 6.5, 0.9), m, x, 0.95, 0, 1.06));
          return g;
        },
        // Lean: a gust of wind blowing across (arrows; the runner flips it for a left gust).
        gust() {
          const g = new THREE.Group();
          const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
          const arrows = [];
          for (const y of [HEIGHTS.low, HEIGHTS.high]) {
            for (const x of [-3.2, 0, 3.2]) {
              const a = new THREE.Group();
              a.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8).rotateZ(Math.PI / 2), m, 0, 0, 0, false));
              a.add(mesh(new THREE.ConeGeometry(0.3, 0.6, 12).rotateZ(-Math.PI / 2), m, 1.0, 0, 0, false));
              a.position.set(x, y, 0);
              arrows.push(a);
              g.add(a);
            }
          }
          g.userData.animate = spin => arrows.forEach((a, i) => { a.position.x = -3.2 + ((i % 3) * 3.2 + spin * 3) % 9.6 - 1.6; });
          return g;
        },
        // Fly through it: a golden spark ring (5 sparks).
        ring() {
          const g = new THREE.Group();
          g.add(outlined(new THREE.TorusGeometry(1.0, 0.14, 12, 36), glow('#ffd447', 1.2), 0, 0, 0, 1.12));
          return g;
        },
      },
      bun: { geometry: new THREE.OctahedronGeometry(0.32), material: glow('#fff27a', 1.4) }, // a spark
      star: { geometry: new THREE.OctahedronGeometry(0.5), material: glow('#ff9df0', 1.4) },
      theme(name) {
        const t = THEMES[name] ?? THEMES.gold;
        scene.background.set(t.sky);
        scene.fog.color.set(t.sky);
        cloudMat.color.set(t.cloud);
        crystalMat.color.set(t.crystal);
        islandMat.color.set(t.crystal);
        hemi.intensity = t.light;
        sun.intensity = 1.6 * t.light;
        stars.visible = name === 'stars';
      },
    };

    // ---- The flying dish (Lumi's), with Lumi and Poppy riding ------------------------------
    const dish = new THREE.Group();
    const hull = mat('#8fd3df', { roughness: 0.35, metalness: 0.2 });
    dish.add(mesh(new THREE.SphereGeometry(1.75, 36, 16).scale(1, 0.27, 1), hull));
    const rimMat = glow('#ffe680', 0.6);
    dish.add(mesh(new THREE.TorusGeometry(1.72, 0.08, 10, 48).rotateX(Math.PI / 2), rimMat, 0, 0.02, 0, false));
    dish.add(mesh(new THREE.CylinderGeometry(0.7, 0.4, 0.25, 24), glow('#8ff0ff', 1.0), 0, -0.45, 0, false));
    // The antenna dish at the back: it sweeps the sky for the gate's signal.
    const antenna = new THREE.Group();
    antenna.position.set(0, 1.25, 0.95);
    dish.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 10), hull, 0, 0.8, 0.95));
    const bowlMat = glow('#ffe9a8', 0.25);
    const bowl = mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), bowlMat, 0, 0, 0);
    bowl.material.side = THREE.DoubleSide;
    antenna.add(bowl);
    dish.add(antenna);
    // The beam: from the antenna, pointing where it points.
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0, depthWrite: false, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.5, 1, 14, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), beamMat);
    beam.scale.z = 60;
    antenna.add(beam);
    // The Sky Crank, on the dish's side, and its gear (which can pop out).
    const crank = new THREE.Group();
    crank.position.set(1.85, 0.45, 0.2);
    const crankMat = glow('#ffb347', 0.3);
    crank.add(mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 28).rotateY(Math.PI / 2), crankMat, 0, 0, 0, false));
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.BoxGeometry(0.06, 0.86, 0.06), crankMat, 0, 0, 0, false);
      s.rotation.x = (i * Math.PI) / 3;
      crank.add(s);
    }
    dish.add(crank);
    const gearMat = glow('#ffd447', 0.4);
    const gear = outlined(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8).rotateZ(Math.PI / 2), gearMat, 1.95, 0.45, 0.2, 1.12);
    dish.add(gear);
    const gearSeat = new THREE.Vector3(1.95, 0.45, 0.2), gearOut = new THREE.Vector3(2.9, 1.5, 0.6);

    for (const [kind, x] of [['lumi', -0.62], ['poppy', 0.62]]) {
      const b = cast[kind];
      b.seatY = 0.36;
      dish.add(b.root);
      b.place(x, 0.15, b.seatY);
      b.faceNow(x, -10);
      b.state = 'sit';
    }
    dish.position.set(0, HEIGHTS.low, 0);
    scene.add(dish);

    let t = 0;
    stage.flyer = {
      root: dish,
      // Follows the run: lane and height, banking into turns; a wobble after a bump.
      update(sim, dt) {
        t += dt;
        dish.position.x = sim.laneX * LANE;
        dish.position.y = HEIGHTS.low + sim.heightX * (HEIGHTS.high - HEIGHTS.low) + Math.sin(t * 2.4) * 0.08;
        dish.rotation.z = -(sim.lane - sim.laneX) * 0.5 + (sim.stumbleT > 0 ? Math.sin(t * 22) * 0.18 : 0);
        dish.rotation.x = (sim.high ? 1 : 0) - sim.heightX > 0.05 ? -0.12 : sim.heightX - (sim.high ? 1 : 0) > 0.05 ? 0.12 : 0;
        rimMat.emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.15;
      },
    };
    const park = () => {
      dish.position.set(0, HEIGHTS.low, 0);
      dish.rotation.set(0, 0, 0);
    };
    const aimAt = (yaw, length, opacity) => {
      antenna.rotation.y = yaw;
      antenna.rotation.x = Math.atan2(GATE.y - 2.7, GATE.length()); // tipped up to the gate's height
      beam.scale.z = length;
      beamMat.opacity = opacity;
    };
    const gateYaw = Math.atan2(-(GATE.x), -(GATE.z)); // the antenna turned toward the gate

    // ---- The three moments ------------------------------------------------------------
    const smooth = stage.smooth.bind(stage);
    const empty = () => {
      const root = new THREE.Group();
      return root;
    };
    stage.setPieces = {
      // Step left and right: the antenna sweeps the sky; the last side (right) finds the gate.
      findSignal() {
        let lock = 0, extra = 0;
        return {
          root: empty(),
          shot: { pos: [-3, 4.8, 7], look: [4, 4, -30] },
          cheerAt: [0, 3, -2],
          enter: park,
          does: {
            sweep: smooth((k, info) => {
              lock = k >= 0.999 ? 1 : 0;
              const yaw = lock ? gateYaw : -(info.aim ?? 0) * Math.abs(gateYaw);
              aimAt(yaw, lock ? GATE.length() : 40, lock ? 0.75 : 0.22 + extra * 0.3);
              bowlMat.emissiveIntensity = 0.25 + k * 0.8;
            }, 8),
            // (Spare step) arms up holds the dish steady on the gate.
            lock: smooth(k => { extra = k; }, 6),
          },
        };
      },
      // Arm pumps turn the crank; the popped gear clicks back in at the end.
      crankJam() {
        return {
          root: empty(),
          shot: { pos: [5.4, 3.6, 4.4], look: [1.2, 1.5, -0.4] },
          cheerAt: [1.9, 2.2, 0.2],
          enter: () => {
            park();
            aimAt(gateYaw, 0, 0);
          },
          does: {
            crank: smooth(k => {
              crank.rotation.x = -k * Math.PI * 6;
              const seat = clamp01((k - 0.8) / 0.2);
              gear.position.lerpVectors(gearOut, gearSeat, seat);
              gear.rotation.x = (1 - seat) * Math.sin(t * 3) * 0.6;
              crankMat.emissiveIntensity = 0.3 + k * 0.9;
            }, 5),
            // (Spare step) arms up holds the gear in: it glows.
            hold: smooth(k => { gearMat.emissiveIntensity = 0.4 + k * 1.4; }, 6),
          },
        };
      },
      // Quick pumps charge the dish; a star pose fires the beam at the gate.
      fullPower() {
        return {
          root: empty(),
          shot: { pos: [-4.5, 6, 9], look: [5, 5, -40] },
          cheerAt: [0, 3, -1],
          enter: () => {
            park();
            aimAt(gateYaw, 0, 0);
          },
          does: {
            charge: smooth(k => {
              rimMat.emissiveIntensity = 0.5 + k * 1.6;
              crank.rotation.x -= k * 0.05;
            }, 5),
            boost: smooth(k => { bowlMat.emissiveIntensity = 0.25 + k * 1.2; }, 5), // (spare step)
            fire: smooth(k => aimAt(gateYaw, Math.max(0.01, k * GATE.length()), k * 0.85), 4),
          },
        };
      },
    };

    // ---- Story helpers (run-scenes.js) ------------------------------------------------
    stage.sky = {
      cast,
      // Up through the clouds from below (while Lumi and Poppy talk).
      async liftOff(g) {
        dish.position.set(0, -7, 4);
        await g.tween(3.2, k => {
          const e = 1 - (1 - k) * (1 - k);
          dish.position.set(0, lerp(-7, HEIGHTS.low, e), lerp(4, 0, e));
          dish.rotation.x = (1 - k) * -0.3;
        });
        park();
      },
      // The finish: the beam reaches across the sky to the gate, and the gate flares.
      async beamToGate(g) {
        park();
        await g.tween(1.6, k => aimAt(gateYaw, Math.max(0.01, k * GATE.length()), 0.9));
        await g.tween(0.8, k => gateGlow.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.6));
      },
    };
  },
};

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
