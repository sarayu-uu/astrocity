// The Crystal Arena: inside the sleeping gate, where Gate Trials happens. A round floor of dark
// violet crystal with three rings of tiles (one tile per card of a round), Mimi's round stage in
// the middle, and Poppy and Nutty at the sides. Every card won lights a tile; a ring fully lit
// wakes its floating crystals and adds a layer to the music. Three crystal locks (the gate's
// carved pictures: star, bridge, moon) rise behind Mimi between rounds.
//
// What it provides:
//   stage.arena       tiles and rings for the trials engine (lightTile, celebrateRing, ...)
//   stage.setPieces   lockStar, lockBridge, lockMoon: what each lock's poses change
//   stage.crystal     story helpers used by run-scenes.js (wake the whole arena)

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stageMusicLayer } from '../core/audio.js';

const RINGS = [{ r: 4.8, color: '#7ff3ff' }, { r: 7.2, color: '#ff9df0' }, { r: 9.6, color: '#ffe680' }];
const TILES_PER_RING = 8;
const DARK = new THREE.Color('#3b2d63');
const OUTLINE_COLOR = '#1b1236';

export default {
  id: 'crystal-arena',
  cast: ['mimi', 'poppy', 'nutty'],
  music: 'crystal-arena',

  build(stage) {
    const { scene, camera, cast } = stage;
    stage.useSharedEnvironment();
    scene.background = new THREE.Color('#1e1838');
    scene.fog = new THREE.Fog('#1e1838', 26, 70);
    const hemi = new THREE.HemisphereLight('#c9b8ff', '#2a1f4a', 0.9);
    const key = new THREE.DirectionalLight('#ffe9ff', 1.3);
    key.position.set(4, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 50 });
    scene.add(hemi, key);

    camera.position.set(0, 6.8, 15.5);
    camera.lookAt(0, 1.4, -1);

    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
    const glow = (color, k = 0.6) => mat(color, { emissive: color, emissiveIntensity: k, roughness: 0.35 });
    const mesh = (geo, material, x = 0, y = 0, z = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = shadow;
      return m;
    };
    const outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    const outlined = (geo, material, x, y, z, rim = 1.06) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(mesh(geo, material));
      const o = new THREE.Mesh(geo, outline);
      o.scale.setScalar(rim);
      g.add(o);
      return g;
    };
    const rand = seeded(5);

    // ---- The floor, Mimi's stage, the walls -------------------------------------------
    scene.add(mesh(new THREE.CylinderGeometry(13, 13.5, 0.6, 64), mat('#2a2050', { roughness: 0.4, metalness: 0.2 }), 0, -0.3, 0));
    const stageTop = mat('#5a3f9a', { roughness: 0.3, metalness: 0.2 });
    scene.add(mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.5, 40), stageTop, 0, 0.25, -2.5));
    const stageRing = glow('#ff9df0', 0.4);
    scene.add(mesh(new THREE.TorusGeometry(2.25, 0.06, 8, 60).rotateX(Math.PI / 2), stageRing, 0, 0.5, -2.5, false));
    // Crystal walls all round (one mesh).
    const wallGeo = mergeGeometries(Array.from({ length: 26 }, (_, i) => {
      const a = (i / 26) * Math.PI * 2;
      const r = 15 + rand() * 2;
      return new THREE.OctahedronGeometry(1, 0).scale(1.4 + rand(), 4 + rand() * 4, 1.4 + rand())
        .rotateY(rand() * Math.PI).translate(Math.cos(a) * r, 2 + rand() * 2, Math.sin(a) * r);
    }));
    scene.add(mesh(wallGeo, mat('#3b2f6e', { roughness: 0.5 }), 0, 0, 0, false));

    // ---- Tiles: one instanced mesh per ring, 8 tiles each, dark until a card is won ------
    const tileGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.08, 6);
    const tiles = RINGS.map((ring, ri) => {
      const m = new THREE.InstancedMesh(tileGeo, mat('#ffffff', { roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.05 }), TILES_PER_RING);
      const tmp = new THREE.Object3D();
      for (let i = 0; i < TILES_PER_RING; i++) {
        // The tiles run round the front half of the ring, left to right, facing the child.
        const a = Math.PI * (0.08 + (i / (TILES_PER_RING - 1)) * 0.84);
        tmp.position.set(-Math.cos(a) * ring.r, 0.04, -2.5 + Math.sin(a) * ring.r * 0.75);
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
        m.setColorAt(i, DARK);
      }
      m.receiveShadow = true;
      scene.add(m);
      return { mesh: m, lit: Array(TILES_PER_RING).fill(0), color: new THREE.Color(ring.color), positions: Array.from({ length: TILES_PER_RING }, (_, i) => {
        const a = Math.PI * (0.08 + (i / (TILES_PER_RING - 1)) * 0.84);
        return new THREE.Vector3(-Math.cos(a) * ring.r, 0.2, -2.5 + Math.sin(a) * ring.r * 0.75);
      }) };
    });
    const setTile = (ri, i, k) => {
      const t = tiles[ri];
      t.lit[i] = k;
      t.mesh.setColorAt(i, DARK.clone().lerp(t.color, k));
      t.mesh.instanceColor.needsUpdate = true;
    };

    // ---- Floating crystals: one group per ring, asleep (dim, low) until the ring wakes ----
    const sleepers = RINGS.map((ring, ri) => {
      const m = glow(ring.color, 0.05);
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.1 + ri * 0.25 + i * 0.32);
        g.add(outlined(new THREE.OctahedronGeometry(0.5 + rand() * 0.3, 0), m, Math.cos(a) * (11 + ri), 1 + rand() * 2, Math.sin(a) * (8 + ri) - 3, 1.1));
      }
      scene.add(g);
      return { group: g, mat: m, awake: 0 };
    });

    // ---- Sparkles for tiles and combos (one cloud, reused) -------------------------------
    const N = 60;
    const sparkPos = new Float32Array(N * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({ color: '#fff3b0', size: 0.22, transparent: true, depthWrite: false });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.visible = false;
    scene.add(sparks);
    let sparkT = 1, sparkAt = new THREE.Vector3(), sparkSpread = 1;
    const burst = (at, spread = 1) => {
      sparkAt.copy(at);
      sparkSpread = spread;
      sparkT = 0;
      sparks.visible = true;
    };

    // ---- The cast: Mimi on her stage, Poppy and Nutty at the sides, facing the child ------
    const hostSpot = new THREE.Vector3(0, 0.5, -2.5);
    const places = { mimi: [0, -2.5, 0.5], poppy: [-3.4, 0.8, 0], nutty: [3.4, 0.8, 0] };
    const resetCast = () => {
      for (const [k, [x, z, y]] of Object.entries(places)) {
        cast[k].place(x, z, y).faceNow(x, z + 10);
        cast[k].state = 'idle';
        cast[k].root.rotation.z = 0;
      }
      cast.mimi.seatY = 0.5;
    };
    resetCast();

    stage.arena = {
      hostSpot,
      reset() {
        resetCast();
        tiles.forEach((t, ri) => t.lit.forEach((_, i) => setTile(ri, i, 0)));
        sleepers.forEach(s => {
          s.awake = 0;
          s.mat.emissiveIntensity = 0.05;
        });
        stageMusicLayer(0);
      },
      lightTile(ri, i) {
        if (!tiles[ri]) return;
        setTile(ri, i, 1);
        burst(tiles[ri].positions[i], 0.8);
      },
      // Dance Party: the ring's tiles twinkle (never judged).
      sparkleRing(ri) {
        const t = tiles[ri];
        if (!t) return;
        const now = performance.now() / 200;
        t.lit.forEach((k, i) => {
          t.mesh.setColorAt(i, DARK.clone().lerp(t.color, Math.max(k, 0.5 + Math.sin(now + i) * 0.5)));
        });
        t.mesh.instanceColor.needsUpdate = true;
      },
      combo(n) {
        burst(hostSpot.clone().setY(2.5), 1 + Math.min(n, 10) * 0.15);
      },
      // End of a round: every dark tile lights up too, the ring's crystals wake, and the music
      // gains a layer. (Stars and score still use the real hit rate.)
      async celebrateRing(g, ri, endless) {
        const t = tiles[ri];
        const dark = t.lit.map((k, i) => (k < 1 ? i : -1)).filter(i => i >= 0);
        for (const i of dark) {
          setTile(ri, i, 1);
          burst(t.positions[i], 0.8);
          await g.wait(0.12);
        }
        if (endless) {
          await g.wait(0.6);
          t.lit.forEach((_, i) => setTile(ri, i, 0)); // a fresh round in endless mode
          return;
        }
        const s = sleepers[ri];
        await g.tween(1.4, k => {
          s.awake = k;
          s.mat.emissiveIntensity = 0.05 + k * 1.4;
          s.group.position.y = k * 1.5;
        });
        stageMusicLayer(ri + 1);
        burst(new THREE.Vector3(0, 3, -2.5), 2);
        await g.wait(0.6);
      },
    };

    // ---- The three crystal locks (set pieces) -------------------------------------------
    const smooth = stage.smooth.bind(stage);
    const lockShape = kind => {
      const s = new THREE.Shape();
      if (kind === 'star') {
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 0.5 : 1.2, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
          s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
      } else if (kind === 'bridge') {
        s.moveTo(-1.3, -0.6);
        s.lineTo(-1.3, 0.1);
        s.absarc(0, 0.1, 1.3, Math.PI, 0, true);
        s.lineTo(1.3, -0.6);
        s.lineTo(0.8, -0.6);
        s.absarc(0, 0.1, 0.8, 0, Math.PI, false);
        s.lineTo(-0.8, -0.6);
      } else {
        s.absarc(0, 0, 1.1, Math.PI * 0.35, Math.PI * 1.65, false);
        s.absarc(0.45, 0, 0.85, Math.PI * 1.55, Math.PI * 0.45, true);
      }
      return new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false });
    };
    const POSE_ARMS = { star: [2.6, 2.6], bridge: [1.5, 1.5], moon: [0.35, 2.6] };
    // Poppy and Nutty copy the pose the lock wants.
    const copyAlong = (want, k) => {
      for (const b of [cast.poppy, cast.nutty]) {
        if (want?.pose && k > 0.05) {
          b.state = 'pose';
          b.pose = POSE_ARMS[want.pose];
        } else if (b.state === 'pose') b.state = 'idle';
      }
    };
    const makeLock = (kind, color) => () => {
      const root = new THREE.Group();
      const crystalMat = glow(color, 0.15);
      const crystal = outlined(new THREE.OctahedronGeometry(1.8, 0).scale(1, 1.5, 0.7), mat('#4b3a86', { roughness: 0.3, metalness: 0.3 }), 0, 0, 0, 1.04);
      const glyph = mesh(lockShape(kind), crystalMat, 0, 0.2, 1.0, false);
      glyph.position.x = kind === 'moon' ? -0.2 : 0;
      const lock = new THREE.Group();
      lock.add(crystal, glyph);
      lock.position.set(0, -4, -6.5);
      root.add(lock);
      const shards = Array.from({ length: 10 }, (_, i) => {
        const s = mesh(new THREE.TetrahedronGeometry(0.35), crystalMat, 0, 0, 0, false);
        s.visible = false;
        s.userData.dir = new THREE.Vector3(Math.cos(i * 0.63) * (1 + (i % 3) * 0.4), 1 + (i % 4) * 0.5, Math.sin(i * 0.63) * 0.6 + 0.6);
        root.add(s);
        return s;
      });
      return {
        root,
        shot: { pos: [0, 4.6, 9.5], look: [0, 2.6, -4] },
        cheerAt: [0, 3.2, -6.5],
        enter: () => {
          lock.visible = true;
          lock.position.y = -4;
          shards.forEach(s => { s.visible = false; });
          crystalMat.emissiveIntensity = 0.15;
        },
        // The lock rises as the child holds the pose; the carved picture fills with light.
        does: {
          glow: smooth((k, info) => {
            lock.position.y = -4 + Math.min(1, 0.35 + k) * 7.2;
            crystalMat.emissiveIntensity = 0.15 + k * 2.2;
            copyAlong(info.want, k);
          }, 5),
        },
        // It shatters into light.
        async shatter(g) {
          const from = lock.position.clone();
          shards.forEach(s => {
            s.visible = true;
            s.position.copy(from);
          });
          lock.visible = false;
          await g.tween(1.2, k => shards.forEach(s => {
            s.position.copy(from).addScaledVector(s.userData.dir, k * 4);
            s.position.y -= k * k * 2;
            s.scale.setScalar(1 - k * 0.8);
          }));
          shards.forEach(s => { s.visible = false; });
          copyAlong(null, 0);
        },
      };
    };
    stage.setPieces = {
      lockStar: makeLock('star', '#7ff3ff'),
      lockBridge: makeLock('bridge', '#ff9df0'),
      lockMoon: makeLock('moon', '#ffe680'),
    };

    // ---- Story helpers (run-scenes.js) ------------------------------------------------
    stage.crystal = {
      cast,
      // The whole arena wakes: every tile and crystal at full glow, and a big burst.
      async wakeAll(g) {
        tiles.forEach((t, ri) => t.lit.forEach((_, i) => setTile(ri, i, 1)));
        await g.tween(1.2, k => sleepers.forEach(s => { s.mat.emissiveIntensity = Math.max(s.mat.emissiveIntensity, 1.4 * k); }));
        stageRing.emissiveIntensity = 1.6;
        burst(new THREE.Vector3(0, 3, -2.5), 3);
        stageMusicLayer(3);
      },
    };

    stage.arenaTick = dt => {
      if (sparkT < 1) {
        sparkT = Math.min(1, sparkT + dt / 0.9);
        for (let i = 0; i < N; i++) {
          const a = i * 2.4, up = 1 + (i % 5) * 0.5;
          sparkPos[i * 3] = sparkAt.x + Math.cos(a) * sparkT * 1.6 * sparkSpread;
          sparkPos[i * 3 + 1] = sparkAt.y + up * sparkT * sparkSpread - 1.5 * sparkT * sparkT;
          sparkPos[i * 3 + 2] = sparkAt.z + Math.sin(a) * sparkT * 1.6 * sparkSpread;
        }
        sparkGeo.attributes.position.needsUpdate = true;
        sparkMat.opacity = 1 - sparkT;
        if (sparkT >= 1) sparks.visible = false;
      }
      // Awake crystals float and turn.
      const t = performance.now() / 1000;
      sleepers.forEach((s, ri) => s.group.children.forEach((c, i) => {
        c.rotation.y = t * 0.4 + i;
        c.position.y += Math.sin(t * 1.3 + i + ri) * 0.002 * s.awake;
      }));
    };
  },

  update(stage, dt) {
    stage.arenaTick(dt);
  },
};

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
