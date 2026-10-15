// Activity stages: small separate worlds an activity runs in (the Sky River, the crystal
// arena...). The island is kept in memory and paused while a stage is open, never rebuilt.
//
// A stage definition (js/stages/*.js):
//   {
//     id: 'sky-river',
//     cast: ['poppy', 'nutty'],            // buddies to copy into the stage
//     build(stage, g) { ... },             // fill stage.scene, place stage.camera and stage.cast
//     update(stage, dt, t) { ... },        // optional, every frame while open
//   }
//
//   await withStage(g, def, async stage => { ...play... })   enter, run, always exit
//   enterStage(g, def) / exitStage(g, { instant })           the same, by hand
//
// While a stage is open: g.stage is it, g.cast is its buddy copies (so dialogue animates them),
// and the renderer draws its scene and camera. On exit, everything the stage created is
// disposed; anything the island also uses (shared geometries, materials, its environment) is
// left alone, so the island is exactly as it was.

import * as THREE from 'three';
import { Buddy } from '../world/buddies.js';

const FLASH = 0.5; // seconds Poppy's stone flashes before the portal

export async function withStage(g, def, run, opts = {}) {
  let failed = false;
  try {
    const stage = await enterStage(g, def, opts);
    return await run(stage);
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    // Always back to the island, even on an error (then without the portal, straight away).
    await exitStage(g, { instant: failed || opts.instant });
  }
}

export async function enterStage(g, def, { instant = false } = {}) {
  if (g.stage) await exitStage(g, { instant: true });
  instant = instant || g.skipping;
  if (!instant) {
    await flashStone(g);
    await g.ui.portal(true);
  }
  const stage = buildStage(g, def);
  g.stage = stage;
  g.cast = stage.cast;
  g.setView(stage.scene, stage.camera);
  if (!instant) await g.ui.portal(false);
  return stage;
}

export async function exitStage(g, { instant = false } = {}) {
  const stage = g.stage;
  if (!stage) return;
  instant = instant || g.skipping;
  if (!instant) await g.ui.portal(true);
  g.stage = null;
  g.cast = g.B;
  g.setView(null);
  g.ui.hideDialogue();
  disposeStage(g, stage);
  if (!instant) await g.ui.portal(false);
}

function buildStage(g, def) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600);
  const stage = {
    id: def.id,
    def,
    scene,
    camera,
    cast: {},
    // Use the island's soft environment lighting. It is shared, so clean-up leaves it alone.
    useSharedEnvironment(intensity = g.scene.environmentIntensity) {
      scene.environment = g.scene.environment;
      scene.environmentIntensity = intensity;
    },
    // A value that eases toward what it is told, so camera jitter never shakes the scene:
    //   const lift = stage.smooth(k => { stone.position.y = k })   then lift(k), lift(1, { instant: true })
    smoothers: [],
    smooth(apply, rate) {
      const s = smoothed(apply, rate);
      stage.smoothers.push(s);
      return s;
    },
    update(dt, t) {
      for (const s of stage.smoothers) s.update(dt);
      def.update?.(stage, dt, t);
      for (const b of Object.values(stage.cast)) b.update(dt, camera);
    },
  };
  // Fresh buddies from the same code: what happens in the stage never touches the island's.
  for (const kind of def.cast ?? []) {
    stage.cast[kind] = new Buddy(kind);
    scene.add(stage.cast[kind].root);
  }
  def.build(stage, g);
  return stage;
}

// The set-piece `does(k, info)` a stage provides: k is eased toward (damped), and `apply(shown,
// info)` draws it every frame. { instant: true } jumps straight there (Skip, reset).
export function smoothed(apply, rate = 5) {
  let shown = 0, target = 0, info = {};
  const fn = (k, opts = {}) => {
    target = k;
    info = opts;
    if (opts.instant) {
      shown = k;
      apply(shown, info);
    }
  };
  fn.update = dt => {
    shown += (target - shown) * (1 - Math.exp(-rate * dt));
    if (Math.abs(target - shown) < 1e-4) shown = target;
    apply(shown, info);
  };
  return fn;
}

// Poppy's stone glows bright for a moment: it is what carries the buddies between places.
async function flashStone(g) {
  const relic = g.W.relic;
  if (!relic) return;
  const from = relic.userData.glow ?? 1;
  await g.tween(FLASH, k => { relic.userData.glow = from + Math.sin(k * Math.PI) * 3; });
  relic.userData.glow = from;
}

// ---- Clean-up ------------------------------------------------------------------------

// Everything the island scene uses (or that is marked shared) is kept; the rest goes.
function islandResources(g) {
  const keep = new Set();
  const addMaterial = m => {
    keep.add(m);
    for (const v of Object.values(m)) if (v?.isTexture) keep.add(v);
  };
  g.scene.traverse(o => {
    if (o.geometry) keep.add(o.geometry);
    if (o.material) [].concat(o.material).forEach(addMaterial);
  });
  for (const v of [g.scene.environment, g.scene.background]) if (v?.isTexture) keep.add(v);
  for (const r of g.sharedResources ?? []) keep.add(r);
  return keep;
}

function disposeStage(g, stage) {
  const keep = islandResources(g);
  const done = new Set();
  const dispose = r => {
    if (!r || keep.has(r) || done.has(r)) return;
    done.add(r);
    r.dispose?.();
  };
  stage.scene.traverse(o => {
    dispose(o.geometry);
    for (const m of [].concat(o.material ?? [])) {
      for (const v of Object.values(m)) if (v?.isTexture) dispose(v);
      dispose(m);
    }
    if (o.isLight) {
      o.shadow?.map?.dispose();
      o.shadow?.dispose?.();
      o.dispose?.();
    }
  });
  for (const v of [stage.scene.environment, stage.scene.background]) if (v?.isTexture) dispose(v);
  stage.def.dispose?.(stage);
  stage.scene.clear();
}
