// Chapter 1 · The First Starway · the story scenes (camera, staging, who walks where).
// The words live in lines.js; the movement games live in activities.js.
// Every scene is a plain async function of the game context `g`. They can be skipped, because
// skipping just runs them very fast behind a curtain (see core/director.js).

import * as THREE from 'three';
import { sfx } from '../../core/audio.js';
import { LINES } from './lines.js';
import { bunGeometry, bunMaterial } from '../../world/bun.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const say = (g, [who, text, opts]) => g.ui.say(who, text, opts);
const talk = async (g, lines) => { for (const line of lines) await say(g, line); };
const props = {};

// ---------------------------------------------------------------- Before the title
// The opening picture, already alive behind the title screen.
export function setup(g) {
  const { B, rig, W } = g;
  const { poppy, nutty, lumi, mimi, zuzu } = B;
  // Poppy stands right over the stuck stone, bent down to it, heaving (it wiggles as she tugs).
  poppy.place(-7.22, 8.62).faceNow(W.relic.position.x, W.relic.position.z + 2);
  poppy.state = 'pull';
  W.relic.userData.tug = 1;
  nutty.place(-5.3, 9.7).faceNow(-7, 9);
  nutty.state = 'eat';
  props.bun = new THREE.Mesh(bunGeometry(0.17), bunMaterial());
  props.bun.castShadow = true;
  nutty.hold(props.bun);
  lumi.place(16.9, 8.9).faceNow(18.2, 8);
  lumi.state = 'work';
  mimi.place(2.8, 3).faceNow(10, 12);
  mimi.state = 'dance';
  zuzu.place(5.9, 13.4).faceNow(7, 15);
  zuzu.state = 'sleep';
  rig.set([-62, 34, 96], [2, -3, 0]);
}

// ---------------------------------------------------------------- Poppy finds a stone
export async function arrival(g) {
  const { ui, rig, B, W, scene } = g;
  const { poppy, nutty } = B;
  const L = LINES.arrival;

  ui.cinematic(true);
  const flight = rig.flyThrough(
    [[-62, 34, 96], [-48, 28, 78], [-32, 20, 56], [-19, 12, 37], [-9, 6.5, 23], [-4.6, 3, 14.2]],
    [[2, -3, 0], [-3, -1, 4], [-6, 0, 8], [-7, 0.4, 9], [-7, 0.6, 8.9], [-7.1, 0.55, 8.6]],
    6.5,
  );
  await g.wait(4.5);
  ui.hud(true);
  ui.place('Star Square', 'Home');
  await flight;

  await say(g, L.nuttyTeases);
  await say(g, L.poppyPulls);

  // The stone pops free and Poppy falls over.
  sfx.pop();
  W.relic.userData.tug = 0;
  poppy.state = 'sit';
  const from = W.relic.position.clone();
  await g.tween(0.9, k => {
    W.relic.position.lerpVectors(from, V(-7.3, 1.1, 8.6), k);
    W.relic.position.y += Math.sin(k * Math.PI) * 1.6;
  });
  poppy.hold(W.relic);
  W.relic.position.set(0, -0.04, 0.08);
  W.relic.scale.setScalar(0.45);
  W.relic.userData.glow = 0.15;
  await g.wait(0.6);

  // While everyone looks at the glow, Nutty sees something far away and wanders off.
  scene.attach(props.bun);
  props.bun.position.set(-5.2, 0.09, 9.9);
  nutty.state = 'idle';
  nutty.walkPath([[-2, 8.5], [6, 6], [14, 4.5], [19, 4]], 2.2);

  poppy.state = 'wave';
  poppy.face(rig.pos.x, rig.pos.z);
  await say(g, L.hello);
  poppy.state = 'idle';
  await say(g, L.itGlows);
  poppy.face(-5.2, 9.9);
  await rig.go([-3.6, 1.6, 12.6], [-5.2, 0.2, 9.9], 1.8);
  await say(g, L.bun);
  await rig.go([-4.6, 3, 14.2], [-7.1, 0.55, 8.6], 1.2);
  poppy.face(rig.pos.x, rig.pos.z);
  await say(g, L.letsAsk);

  ui.hud(true);
  nutty.target = null;
  nutty.place(38.6, 5.4).faceNow(30, 4);
  nutty.state = 'scared';
}

// ---------------------------------------------------------------- Where is Nutty?
// Explore Star Square and click friends. Talking to Zuzu ends it.
export async function askAround(g) {
  const { ui, rig, B } = g;
  const { poppy, lumi, mimi, zuzu } = B;
  const L = LINES.askAround;

  ui.cinematic(false);
  ui.hideDialogue();
  ui.place('Star Square', 'Home');
  ui.objective(L.goal);
  rig.startExplore([-3, 0, 6]);
  poppy.walkTo(-2.5, 5.5, 2.6);
  for (const b of [lumi, mimi, zuzu]) b.badge.visible = true;

  const talked = new Set();
  let busy = false;
  let found;
  const foundNutty = new Promise(r => { found = r; });

  // Poppy walks over to the friend you picked, and the camera frames them both.
  const meet = async b => {
    const dx = b.x - poppy.x, dz = b.z - poppy.z;
    const d = Math.hypot(dx, dz) || 1;
    const px = b.x - (dx / d) * 1.4, pz = b.z - (dz / d) * 1.4;
    const mx = (px + b.x) / 2, mz = (pz + b.z) / 2;
    let nx = -(b.z - pz) / 1.4, nz = (b.x - px) / 1.4;
    if ((rig.pos.x - mx) * nx + (rig.pos.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
    const cx = mx + nx * 4.4 + (dx / d) * 0.6, cz = mz + nz * 4.4 + (dz / d) * 0.6;
    // Both turn to each other, a little toward the camera so we see their faces.
    const cheat = (who, other) => who.face(other.x + (cx - other.x) * 0.45, other.z + (cz - other.z) * 0.45);
    if (b.state === 'dance') b.state = 'idle';
    b.face(px, pz);
    await Promise.all([
      poppy.walkTo(px, pz, 3.2).then(() => { cheat(poppy, b); cheat(b, { x: px, z: pz }); }),
      rig.go([cx, 1.9, cz], [mx, 0.85, mz], 1.5),
    ]);
  };

  const after = {
    mimi: () => { mimi.state = 'dance'; },
    zuzu: () => { zuzu.state = 'sleep'; },
  };

  g.onPick = async target => {
    if (busy) return;
    const b = target.userData.buddy;
    if (!b) {
      rig.focusOn(target.position.x || poppy.x, target.position.z || poppy.z, 0.8);
      ui.bark(poppy, target.userData.line, 3.2);
      return;
    }
    if (b === poppy || talked.has(b.kind)) {
      ui.bark(b, L.again[b.kind], 2.4);
      return;
    }
    busy = true;
    talked.add(b.kind);
    b.badge.visible = false;
    await meet(b);
    if (b === zuzu) zuzu.state = 'sit';
    await talk(g, L[b.kind]);
    after[b.kind]?.();
    ui.hideDialogue();
    rig.startExplore([b.x, 0, b.z + 1]);
    busy = false;
    if (b === zuzu) found();
  };

  // A small hint if nobody has found Zuzu after a while.
  g.wait(40).then(() => {
    if (!talked.has('zuzu') && !busy && g.onPick) {
      ui.bark(poppy, L.hint, 4.5);
      rig.focusOn(zuzu.x, zuzu.z, 0.8);
    }
  });

  await Promise.race([foundNutty, g.untilSkip()]);
  g.onPick = null;
  for (const b of [lumi, mimi, zuzu]) b.badge.visible = false;
}

// ---------------------------------------------------------------- To the old bridge
export async function toBridge(g) {
  const { ui, rig, B } = g;
  const { poppy, nutty } = B;
  const L = LINES.toBridge;

  ui.objective(L.goal);
  poppy.face(rig.pos.x, rig.pos.z);
  await say(g, L.letsGo);

  rig.followWith(() => ({ pos: [poppy.x - 5, 4.5, poppy.z + 9], look: [poppy.x + 2, 0.8, poppy.z] }), 2);
  await poppy.walkPath([[1, 6.5], [8, 5], [14, 4.3], [19.8, 4]], 3.4);
  ui.place('The Old Bridge', 'Edge of Star Square');
  ui.objective(null);
  ui.cinematic(true);
  await rig.go([23.5, 3.4, 13], [33, 0.8, 4], 2.8);
  nutty.state = 'wave';
  await say(g, L.overHere);
  await say(g, L.how);
  nutty.state = 'scared';
  await say(g, L.stones);
  await say(g, L.help);
  await rig.go([21.4, 1.7, 7.6], [20, 1.1, 4], 1.8);
  poppy.face(rig.pos.x, rig.pos.z);
  await say(g, L.letsHop);
  ui.hideDialogue();
}

// ---------------------------------------------------------------- Gate Rock
export async function gateRock(g) {
  const { ui, rig, B, W, scene } = g;
  const { poppy, nutty, lumi } = B;
  const L = LINES.gateRock;

  ui.place('Gate Rock', 'Across the old bridge');
  ui.cinematic(true);
  nutty.state = 'idle';
  nutty.walkTo(37.6, 5, 2);
  await poppy.walkTo(37.2, 3.4, 2.5);
  poppy.face(nutty.x, nutty.z);
  nutty.face(poppy.x, poppy.z);
  await rig.go([35, 2.3, 9], [38.5, 1, 4.2], 1.6);
  await say(g, L.bothStuck);
  await say(g, L.look);
  await rig.go([35.8, 2.9, 8.2], [41, 1.9, 4], 2);
  await say(g, L.fits);

  // Poppy puts the magic stone into the gate. It flickers... and goes dark.
  await poppy.walkTo(39.6, 4, 2);
  poppy.faceNow(41, 4);
  scene.attach(W.relic);
  W.relic.scale.setScalar(1);
  W.relic.userData.glow = 1;
  const from = W.relic.position.clone();
  await g.tween(1, k => {
    W.relic.position.lerpVectors(from, W.gate.slot, k);
    W.relic.position.y += Math.sin(k * Math.PI) * 0.8;
  });
  sfx.clunk();
  for (let i = 0; i < 3; i++) {
    W.gate.setPower(0.6);
    await g.wait(0.12);
    W.gate.setPower(0);
    await g.wait(0.18);
  }
  nutty.state = 'scared';
  await say(g, L.broke);

  // Lumi shouts from the workshop.
  ui.place("Lumi's Workshop", 'Star Square');
  lumi.state = 'idle';
  await rig.go([14.6, 3.2, 3.9], [17.7, 1.3, 8.5], 2.2);
  lumi.face(rig.pos.x, rig.pos.z);
  await say(g, L.notPotato);
  await say(g, L.needsPower);
  await say(g, L.askHelp);
  ui.hideDialogue();
}

// ---------------------------------------------------------------- The beam wakes the gate
export async function beam(g) {
  const { ui, rig, B, W } = g;
  const { poppy, nutty, lumi } = B;
  const L = LINES.beam;

  ui.cinematic(true);
  ui.place('Gate Rock', 'Across the old bridge');
  await rig.go([29, 6, 16], [32, 1.5, 5], 1.6);
  await g.tween(1.2, k => W.beam.show(k));
  W.gate.setPower(1);
  sfx.rumble();
  for (let i = 0; i < W.gate.glyphs.length; i++) W.gate.setGlyph(i, 0.25);
  await g.wait(1);
  await g.tween(0.8, k => W.beam.fade(0.85 * (1 - k)));
  W.beam.show(0);
  W.beam.fade(0.85);
  lumi.state = 'work';

  poppy.place(39.1, 5.5).faceNow(34, 4.5);
  nutty.place(39.1, 2.5).faceNow(34, 3.5);
  await rig.go([33.2, 2.7, 4], [40.6, 1.6, 4], 2);
  await say(g, L.pictures);
  await say(g, L.copy);
  ui.hideDialogue();
}

// ---------------------------------------------------------------- The Starway comes back
export async function starway(g) {
  const { ui, rig, B, W } = g;
  const { poppy, nutty } = B;
  const L = LINES.starway;

  ui.cinematic(true);
  W.gate.setPower(1.6);
  sfx.rumble();
  await rig.go([28, 7.5, 15], [27.5, 0, 4], 2.4);
  W.bridge.drift = 0;
  await g.tween(2.2, k => { W.bridge.settled = k; });
  sfx.whoosh();
  await g.tween(2.4, k => W.homeway.setProgress(k));
  sfx.chime();
  ui.place('The First Starway', 'Fixed!');

  // Poppy runs home over the new bridge. Nutty follows, trips, and lands in a hug.
  poppy.state = 'idle';
  nutty.state = 'idle';
  rig.followWith(() => ({ pos: [poppy.x + 1, 3.6, 11], look: [poppy.x - 1.5, 0.8, 4] }), 2.5);
  await poppy.walkPath([[35, 4], [22.4, 4]], 4.2);
  poppy.faceNow(30, 4);
  await nutty.walkPath([[35, 4], [25, 4]], 4.6);
  sfx.wobble();
  await nutty.hop(V(23, 0, 4), 0.5, 0.45);
  sfx.land();
  poppy.state = nutty.state = 'hug';
  poppy.face(23 + (23.4 - 23) * 0.5, 4 + (7.4 - 4) * 0.5);
  nutty.face(22.4 + (23.4 - 22.4) * 0.5, 4 + (7.4 - 4) * 0.5);
  await rig.go([23.4, 1.7, 7.4], [22.7, 0.95, 4], 1.4);
  await talk(g, [L.oof, L.meantIt, L.tripped, L.meantTrip]);
  poppy.state = nutty.state = 'idle';
  ui.hideDialogue();

  // Pull back: a second Starway lights up toward a forest nobody has seen in years.
  await rig.go([12, 30, 46], [52, 2, -12], 4.5);
  sfx.discover();
  g.tween(3.6, k => W.forestway.setProgress(k));
  await g.tween(4, k => W.forest.reveal(k));
  g.discover('forest');
  ui.toast('New path found', 'Glow Forest');
  await g.wait(1.5);
  await talk(g, [L.newPath, L.food, L.pack]);
  ui.hideDialogue();
  await ui.chapterCard('Chapter 1 complete', 'The First Starway');
}

// ---------------------------------------------------------------- Back to the living world
// Free play after the chapter. Never ends; click anyone for a line.
export async function freeRoam(g) {
  const { ui, rig, B } = g;
  const { poppy, nutty, lumi, mimi } = B;
  const L = LINES.freeRoam;

  ui.hud(true);
  ui.cinematic(false);
  ui.place('Star Square', 'Home');
  ui.objective(L.goal);
  lumi.state = 'work';
  mimi.state = 'dance';
  poppy.place(20.5, 5.2).faceNow(30, 4);
  nutty.place(20.3, 2.9).faceNow(30, 4);
  rig.startExplore([16, 0, 4.5]);
  g.onPick = target => {
    const b = target.userData.buddy;
    if (b) ui.bark(b, L.barks[b.kind], 3);
    else {
      rig.focusOn(target.position.x, target.position.z, 0.8);
      ui.bark(poppy, target.userData.line, 3.2);
    }
  };
  await new Promise(() => {});
}
