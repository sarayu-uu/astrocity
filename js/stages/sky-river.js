// The Sky River: where the Star Stone Run happens. A canyon of soft cloud-rock with a glowing
// river down the middle; the lanes are floating stepping stones. Three colour themes (mint,
// lilac, sunset peach), one per leg.
//
// Readability first: the background (sky, banks, walls, far islands, trees) is soft and
// desaturated; everything the child must react to is bright, with a dark outline.
//
// What it provides (see test-track.js for the plain version):
//   stage.runner      track pieces (with their bank scenery, recycled), obstacle looks, bun, star, theme
//   stage.setPieces   bridge1, bridge2, lastBridge: what each bridge's moves change
//   stage.river       story helpers used by run-scenes.js (Nutty drifting, the final shots)
// Everything is built once, when the stage opens, and reused.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { alienTree } from '../world/alien.js';

const THEMES = {
  mint: { sky: '#dfece8', river: '#5fd0b6', bank: '#b9cbc4', wall: '#a9bbb7', stone: '#cfd6cf' },
  lilac: { sky: '#e7e3ef', river: '#9a80ea', bank: '#c8c0d6', wall: '#b3aac6', stone: '#d6cfdd' },
  peach: { sky: '#f2e5dc', river: '#ff8c93', bank: '#d9c6b9', wall: '#c8b3a5', stone: '#e0d3c8' },
};
const SEG = 20; // track piece length (matches the runner)
const LANE = 2.2;
const OUTLINE_COLOR = '#2a1f4a';

export default {
  id: 'sky-river',
  cast: ['poppy', 'nutty'],
  music: 'sky-river',

  build(stage) {
    const { scene, camera, cast } = stage;
    stage.useSharedEnvironment();
    scene.background = new THREE.Color(THEMES.mint.sky);
    scene.fog = new THREE.Fog(THEMES.mint.sky, 30, 100);
    scene.add(new THREE.HemisphereLight('#f6f8ff', '#cbbfe0', 1.0));
    const sun = new THREE.DirectionalLight('#fff0d8', 1.6);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 16, bottom: -16, far: 50 });
    sun.target.position.set(0, 0, -8);
    scene.add(sun, sun.target);

    // The chase camera: fixed, a little low, behind Poppy.
    camera.position.set(0, 2.6, 6.4);
    camera.lookAt(0, 1.2, -12);

    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
    const mesh = (geo, material, x = 0, y = 0, z = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = shadow;
      return m;
    };
    const outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    // A bright thing with a dark rim: the same shape again, a bit bigger, drawn inside-out.
    const outlined = (geo, material, x, y, z, rim = 1.08) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(mesh(geo, material));
      const o = new THREE.Mesh(geo, outline);
      o.scale.setScalar(rim);
      o.castShadow = false;
      g.add(o);
      return g;
    };
    const rand = seeded(7);

    // ---- Shared materials (theme() recolours them) -------------------------------------
    const riverTex = rippleTexture();
    const riverMat = mat(THEMES.mint.river, { emissive: THEMES.mint.river, emissiveIntensity: 0.45, map: riverTex, roughness: 0.3 });
    const stoneMat = mat(THEMES.mint.stone, { roughness: 0.9 });
    const bankMat = mat(THEMES.mint.bank, { roughness: 1 });
    const wallMat = mat(THEMES.mint.wall, { roughness: 1 });

    // ---- One track piece's geometry, built once and shared by every piece ---------------
    const riverGeo = new THREE.PlaneGeometry(9.4, SEG).rotateX(-Math.PI / 2).translate(0, -0.32, -SEG / 2);
    const stonesGeo = mergeGeometries(
      [-1, 0, 1].flatMap(lane => Array.from({ length: 9 }, (_, i) => {
        const r = 0.86 + rand() * 0.12;
        return new THREE.CylinderGeometry(r, r * 1.06, 0.34, 16)
          .scale(1 + rand() * 0.1, 1, 1.05)
          .rotateY(rand() * Math.PI)
          .translate(lane * LANE + (rand() - 0.5) * 0.18, -0.17, -1.1 - i * (SEG / 9));
      })),
    );
    const blob = (x, y, z, sx, sy, sz) => new THREE.IcosahedronGeometry(1, 2).scale(sx, sy, sz).translate(x, y, z);
    const bankGeo = mergeGeometries([-1, 1].flatMap(side => Array.from({ length: 6 }, (_, i) =>
      blob(side * (6.4 + rand() * 0.8), -0.45 + rand() * 0.2, -1.5 - i * 3.4, 2.3 + rand() * 0.6, 0.9 + rand() * 0.4, 2.2))));
    const wallGeos = [0, 1, 2].map(() => mergeGeometries([-1, 1].flatMap(side => Array.from({ length: 4 }, (_, i) =>
      blob(side * (14 + rand() * 3), 1 + rand() * 4, -2 - i * 5.2, 3 + rand() * 2, 3.5 + rand() * 3.5, 3.2)))));
    const trees = [0, 1, 2, 3].map(species => bake(alienTree(0, 0, 0.85, null, species + 4 * 7), 0.35));
    let pieceNo = 0;

    stage.runner = {
      // A track piece with its bank scenery (trees, rocks): reused as the run goes on, so the
      // number of things drawn never grows.
      segment() {
        const n = pieceNo++;
        const g = new THREE.Group();
        // Scenery receives shadows but casts none (it's out of the way), to save draw calls.
        g.add(mesh(riverGeo, riverMat, 0, 0, 0, false));
        const stones = mesh(stonesGeo, stoneMat);
        stones.castShadow = false;
        g.add(stones);
        g.add(mesh(bankGeo, bankMat, 0, 0, 0, false));
        g.add(mesh(wallGeos[n % 3], wallMat, 0, 0, 0, false));
        const side = n % 2 ? 1 : -1;
        const tree = trees[n % 4].clone();
        tree.position.set(side * (7.6 + (n % 3) * 0.7), 0.2, -6 - (n % 4) * 3);
        g.add(tree);
        return g;
      },

      obstacle: {
        // Change lane: a bright storm puff in one lane (a wall is two of these).
        block() {
          const m = mat('#ff7eb6', { emissive: '#ff7eb6', emissiveIntensity: 0.35, roughness: 0.7 });
          const g = new THREE.Group();
          for (const [x, y, s] of [[0, 0.65, 0.78], [-0.48, 0.45, 0.52], [0.48, 0.48, 0.56], [0.05, 1.15, 0.46]]) {
            g.add(outlined(new THREE.SphereGeometry(s, 22, 16), m, x, y, 0, 1.1));
          }
          return g;
        },
        // Jump: a dark water channel across every lane, with glowing edges.
        gap() {
          const g = new THREE.Group();
          g.add(mesh(new THREE.BoxGeometry(7.4, 0.14, 1.8), mat('#2b2457', { roughness: 0.2 }), 0, -0.05, 0, false));
          const edge = new THREE.MeshBasicMaterial({ color: '#d9fbff' });
          for (const z of [-0.95, 0.95]) g.add(mesh(new THREE.BoxGeometry(7.4, 0.06, 0.14), edge, 0, 0.04, z, false));
          return g;
        },
        // Jump on the glow: a wobbling stone across a channel; it glows during the jump window.
        wobble() {
          const g = new THREE.Group();
          g.add(mesh(new THREE.BoxGeometry(7.4, 0.14, 2.2), mat('#2b2457', { roughness: 0.2 }), 0, -0.05, 0, false));
          const m = mat('#e6c96a', { emissive: '#ffe066', emissiveIntensity: 0.1, roughness: 0.5 });
          const slab = outlined(new THREE.BoxGeometry(6.4, 0.26, 1.1), m, 0, 0.12, 0, 1.05);
          g.add(slab);
          let shown = 0;
          g.userData.glow = k => {
            shown += (k - shown) * 0.25;
            m.emissiveIntensity = 0.1 + shown * 1.8;
            slab.rotation.z = Math.sin(performance.now() / 160) * 0.06 * (1 - shown);
          };
          return g;
        },
        // Duck: a glowing vine branch across the path at head height.
        high() {
          const g = new THREE.Group();
          const vine = mat('#c04bff', { emissive: '#c04bff', emissiveIntensity: 0.35, roughness: 0.5 });
          const bar = outlined(new THREE.CylinderGeometry(0.2, 0.2, 7.6, 14).rotateZ(Math.PI / 2), vine, 0, 1.4, 0, 1.15);
          g.add(bar);
          const bulb = new THREE.MeshBasicMaterial({ color: '#fff3a8' });
          for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) g.add(mesh(new THREE.SphereGeometry(0.13, 12, 8), bulb, x, 1.12, 0, false));
          for (const x of [-3.8, 3.8]) g.add(outlined(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 10), vine, x, 0.72, 0, 1.12));
          return g;
        },
        // Arms up: a sunk stone lying across the path, with glowing cracks; it rises when lifted.
        sunk() {
          const g = new THREE.Group();
          const m = mat('#7c69b8', { emissive: '#ffd447', emissiveIntensity: 0.25, roughness: 0.7 });
          g.add(outlined(new THREE.BoxGeometry(6.6, 0.3, 1.3), m, 0, 0.4, 0, 1.04));
          return g;
        },
      },
      bun: { geometry: new THREE.SphereGeometry(0.3, 18, 12).scale(1.25, 0.8, 1), material: mat('#f0a347', { emissive: '#f0a347', emissiveIntensity: 0.2, roughness: 0.6 }) },
      star: { geometry: new THREE.OctahedronGeometry(0.45), material: mat('#ffd447', { emissive: '#ffd447', emissiveIntensity: 1.6, roughness: 0.3 }) },

      theme(name) {
        const t = THEMES[name] ?? THEMES.mint;
        scene.background.set(t.sky);
        scene.fog.color.set(t.sky);
        riverMat.color.set(t.river);
        riverMat.emissive.set(t.river);
        bankMat.color.set(t.bank);
        wallMat.color.set(t.wall);
        stoneMat.color.set(t.stone);
        islandMat.color.set(t.wall);
      },
    };

    // ---- Far away: floating islands (soft, fogged, never move) --------------------------
    const islandMat = mat(THEMES.mint.wall, { roughness: 1 });
    for (const [x, y, z, s] of [[-38, 14, -150, 7], [30, 20, -180, 9], [-18, 26, -220, 6], [46, 11, -120, 5], [-52, 22, -200, 8], [12, 30, -260, 10]]) {
      const isl = new THREE.Group();
      isl.add(mesh(new THREE.ConeGeometry(1, 1.6, 7).rotateX(Math.PI), islandMat, 0, -0.8, 0, false));
      isl.add(mesh(new THREE.SphereGeometry(1, 14, 8).scale(1, 0.25, 1), bankMat, 0, 0.02, 0, false));
      isl.position.set(x, y, z);
      isl.scale.setScalar(s);
      scene.add(isl);
    }

    // ---- Nutty's raft (he rides it down the river between bridges) --------------------
    const nutty = cast.nutty;
    nutty.root.visible = false;
    const raft = mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.34, 18), stoneMat, 0, 0, -14);
    raft.visible = false;
    scene.add(raft);
    const onRaft = () => {
      nutty.root.position.set(raft.position.x, raft.position.y + 0.17, raft.position.z);
    };
    const showNutty = (x, z) => {
      raft.position.set(x, -0.05, z);
      raft.visible = nutty.root.visible = true;
      onRaft();
      nutty.faceNow(0, 6);
      nutty.state = 'wave';
    };
    const hideNutty = () => { raft.visible = nutty.root.visible = false; };
    // Raft and Nutty float off down the river (away from Poppy), then are gone.
    const floatAway = async (g, seconds = 2.2) => {
      const from = raft.position.clone();
      nutty.state = 'wave';
      await g.tween(seconds, k => {
        raft.position.set(from.x + k * 2.5, from.y - k * k * 0.3, from.z - k * 22);
        onRaft();
      });
      hideNutty();
    };

    // ---- Set pieces: the three bridges ------------------------------------------------
    const smooth = stage.smooth.bind(stage);
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const water = mat('#2b2457', { roughness: 0.15 });
    const glowMat = color => mat(color, { emissive: color, emissiveIntensity: 0.2, roughness: 0.5 });
    // The broken bit of river all three bridges cross: z -5.5 to -12.5, Nutty beyond it.
    const crossing = () => {
      const root = new THREE.Group();
      root.add(mesh(new THREE.BoxGeometry(7.6, 0.5, 7), water, 0, -0.21, -9, false)); // covers the path stones
      const edge = new THREE.MeshBasicMaterial({ color: '#d9fbff' });
      for (const z of [-5.5, -12.5]) root.add(mesh(new THREE.BoxGeometry(7.6, 0.06, 0.14), edge, 0, 0.05, z, false));
      return root;
    };
    // From the side and above the banks: Poppy on the left, the gap in the middle, Nutty right.
    const SIDE_SHOT = { pos: [12.5, 7.5, -7.3], look: [0, 0.2, -7.3] };
    const stoneGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.34, 18);

    stage.setPieces = {
      // Jump to stomp three floating stones down into a line across the water.
      bridge1() {
        const root = crossing();
        const m = glowMat('#ffe9a8');
        const stones = [-7, -9, -11].map((z, i) => {
          const s = outlined(stoneGeo, m, 0, 0, z, 1.06);
          s.userData.from = { x: [-2.2, 2.4, -1.6][i], y: [1.4, 2.0, 1.1][i], rz: [0.5, -0.4, 0.3][i] };
          root.add(s);
          return s;
        });
        return {
          root, shot: SIDE_SHOT, cheerAt: [0, 1, -9],
          enter: () => showNutty(0, -14.6),
          exit: hideNutty,
          nuttyAway: g => floatAway(g),
          does: {
            stomp: smooth(k => stones.forEach((s, i) => {
              const t = clamp01(k * 3 - i), f = s.userData.from;
              s.position.x = lerp(f.x, 0, t);
              s.position.y = lerp(f.y, -0.12, t) + Math.sin(performance.now() / 380 + i) * 0.14 * (1 - t);
              s.rotation.z = lerp(f.rz, 0, t);
              m.emissiveIntensity = 0.15 + k * 0.5;
            }), 6),
          },
        };
      },

      // Arms up to lift the sunk middle stone, then two jumps drop the others into place.
      bridge2() {
        const root = crossing();
        const sunkMat = glowMat('#ffd447');
        const sunk = outlined(stoneGeo, sunkMat, 0, -0.14, -9, 1.06); // just its tilted edge shows
        root.add(sunk);
        const m = glowMat('#ffe9a8');
        const drops = [-7, -11].map(z => {
          const s = outlined(stoneGeo, m, 0, 3, z, 1.06);
          root.add(s);
          return s;
        });
        return {
          root, shot: SIDE_SHOT, cheerAt: [0, 1, -9],
          enter: () => showNutty(0, -14.6),
          exit: hideNutty,
          nuttyAway: g => floatAway(g),
          does: {
            lift: smooth(k => {
              sunk.position.y = lerp(-0.14, 0.02, k);
              sunk.rotation.z = lerp(0.22, 0, k);
              sunkMat.emissiveIntensity = 0.2 + k * 1.3;
            }, 4),
            settle: smooth(k => drops.forEach((s, i) => {
              const t = clamp01(k * 2 - i);
              s.position.y = lerp(3, -0.12, t * t);
            }), 6),
          },
        };
      },

      // Step left, right, left to push three planks across; then a big jump to Nutty.
      lastBridge() {
        const root = crossing();
        const plankMat = glowMat('#f2b880');
        const planks = [-2.2, 0, 2.2].map((x, i) => {
          const p = outlined(new THREE.BoxGeometry(1.7, 0.22, 7.2), plankMat, x, 0, -9, 1.03);
          p.userData.x = x;
          p.userData.from = (i % 2 ? 1 : -1) * 8;
          root.add(p);
          return p;
        });
        const pointer = mesh(new THREE.SphereGeometry(0.35, 20, 14), new THREE.MeshBasicMaterial({ color: '#8ff0ff' }), 0, 1.3, -4.4, false);
        root.add(pointer);
        const padMat = glowMat('#8ff0ff');
        const pad = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.06, 24), padMat, 1.1, 0.03, -14.4, false);
        root.add(pad);
        let drifting = false;
        return {
          root, cheerAt: [0.2, 1.4, -13.8],
          shot: { pos: [0, 5.8, 5.4], look: [0, -0.7, -8] }, // from behind, so left is left
          landing: new THREE.Vector3(1.1, 0, -14.4),
          enter: () => {
            drifting = false;
            pointer.visible = true;
            showNutty(-1, -14.8);
          },
          does: {
            push: smooth((k, info) => {
              if (drifting) return;
              planks.forEach((p, i) => {
                const t = clamp01(k * 3 - i);
                p.position.x = lerp(p.userData.from, p.userData.x, t);
                p.position.y = lerp(-0.5, 0, t);
                p.position.z = -9;
                p.rotation.set(0, 0, 0);
              });
              pointer.position.x = (info.aim ?? 0) * LANE;
              pointer.visible = k < 1;
            }, 5),
            leap: smooth(k => { padMat.emissiveIntensity = 0.2 + k * 1.6; }, 6),
          },
          // The finish: the planks float away behind them.
          async driftAway(g) {
            drifting = true;
            const from = planks.map(p => p.position.clone());
            await g.tween(3, k => planks.forEach((p, i) => {
              p.position.set(from[i].x + (i - 1) * k * 3, from[i].y - k * 0.4, from[i].z + k * 6 * (1 + i * 0.3));
              p.rotation.y = k * (i - 1) * 0.6;
            }));
          },
        };
      },
    };

    // ---- Story helpers (run-scenes.js) ------------------------------------------------
    const bunMesh = new THREE.Mesh(stage.runner.bun.geometry, stage.runner.bun.material);
    const flying = Array.from({ length: 5 }, () => {
      const b = bunMesh.clone();
      b.visible = false;
      scene.add(b);
      return b;
    });
    stage.river = {
      // At the start: Nutty floats away ahead on his raft (about 7 s, while they talk).
      async nuttyAhead(g) {
        showNutty(1.4, -18);
        await g.wait(4.5);
        await floatAway(g, 2.5);
      },
      // Poppy and Nutty on the far side of the last bridge, looking back at it.
      async endShot(g) {
        await moveCamera(g, camera, { pos: [-2.6, 2.7, -21.5], look: [0.3, 0.7, -11.5] }, 1.4);
      },
      // Nutty's buns fly back to him from Poppy.
      async bunsTo(g, hero, buddy) {
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        await g.tween(1.8, k => flying.forEach((m, i) => {
          const t = clamp01(k * 1.8 - i * 0.18);
          m.visible = t > 0 && t < 1;
          a.set(hero.x, 1.2, hero.z);
          b.set(buddy.x, 1.1, buddy.z);
          m.position.lerpVectors(a, b, t);
          m.position.y += Math.sin(t * Math.PI) * 1.4;
        }));
        flying.forEach(m => { m.visible = false; });
      },
      driftAway: g => stage.setPieceProps?.lastBridge?.driftAway(g),
      // Keep going: Nutty waits off-stage, and the camera is back behind Poppy.
      resetForRun() {
        hideNutty();
      },
    };

    stage.riverTex = riverTex;
  },

  update(stage, dt) {
    stage.riverTex.offset.y = (stage.riverTex.offset.y + dt * 0.35) % 1;
  },
};

// Eases the camera to a shot ({ pos, look }) over `seconds`.
async function moveCamera(g, camera, shot, seconds) {
  const fromPos = camera.position.clone();
  const fromQ = camera.quaternion.clone();
  const toPos = new THREE.Vector3(...shot.pos);
  const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(toPos, new THREE.Vector3(...shot.look), camera.up));
  await g.tween(seconds, k => {
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(fromPos, toPos, e);
    camera.quaternion.slerpQuaternions(fromQ, toQ, e);
  });
}

// Soft ripple lines for the river, drawn once.
function rippleTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 64, 256);
  x.strokeStyle = 'rgba(255,255,255,0.0)';
  for (let i = 0; i < 14; i++) {
    const y = (i * 256) / 14 + (i % 3) * 4;
    x.fillStyle = `rgba(200, 220, 230, ${0.25 + (i % 4) * 0.08})`;
    x.fillRect(4 + (i % 5) * 9, y, 18 + (i % 3) * 10, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One alien tree as a few meshes instead of dozens: its parts merged by material, colours
// softened toward the background (by `soften`, 0..1) so it never competes with obstacles.
function bake(group, soften = 0) {
  group.updateMatrixWorld(true);
  const parts = new Map();
  const grey = new THREE.Color('#d9d4e2');
  group.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    const key = `${m.type}|${m.color?.getHex()}|${m.emissive?.getHex()}|${m.emissiveIntensity}|${m.roughness}`;
    if (!parts.has(key)) {
      const copy = m.clone();
      copy.color?.lerp(grey, soften);
      parts.set(key, { material: copy, geos: [] });
    }
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    parts.get(key).geos.push(geo);
  });
  const out = new THREE.Group();
  for (const { material, geos } of parts.values()) {
    out.add(new THREE.Mesh(mergeGeometries(geos), material));
  }
  return out;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
