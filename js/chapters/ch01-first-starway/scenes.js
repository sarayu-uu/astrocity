// Chapter 1: The First Starway.
// One continuous adventure: the relic in Poppy's garden, a missing Nutty, the broken bridge,
// Lumi's Sky Crank, the pose-locked gate, and the first glimpse of Glow Forest.

import * as THREE from 'three';
import { sfx, startAmbient } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const POSES = {
  star: { arms: [2.6, 2.6], text: 'Make a star: both arms up high', key: 'Hold 1' },
  bridge: { arms: [1.5, 1.5], text: 'Make a bridge: arms out wide', key: 'Hold 2' },
  moon: { arms: [0.35, 2.6], text: 'Make a moon: one arm up', key: 'Hold 3' },
};

export async function story(g) {
  const { ui, rig, B, W, input, scene } = g;
  const { poppy, nutty, lumi, mimi, zuzu } = B;
  const say = (who, text, opts) => ui.say(who, text, opts);

  // ---------------------------------------------------------------- Opening tableau
  poppy.place(-7.3, 8.3).faceNow(-7.2, 12);
  poppy.state = 'pull';
  nutty.place(-5.3, 9.7).faceNow(-7, 9);
  nutty.state = 'eat';
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: '#d9893d', roughness: 0.8 }));
  bun.scale.set(1.25, 0.8, 1);
  bun.castShadow = true;
  nutty.hold(bun);
  lumi.place(16.9, 8.9).faceNow(18.2, 8);
  lumi.state = 'work';
  mimi.place(2.8, 3).faceNow(10, 12);
  mimi.state = 'dance';
  zuzu.place(5.9, 13.4).faceNow(7, 15);
  zuzu.state = 'sleep';

  rig.set([-62, 34, 96], [2, -3, 0]);
  await g.title();
  startAmbient();

  // ---------------------------------------------------------------- Arriving in Astra
  ui.cinematic(true);
  const flight = rig.flyThrough(
    [[-62, 34, 96], [-48, 28, 78], [-32, 20, 56], [-19, 12, 37], [-9, 6.5, 23], [-4.6, 3, 14.2]],
    [[2, -3, 0], [-3, -1, 4], [-6, 0, 8], [-7, 0.4, 9], [-7, 0.6, 8.9], [-7.1, 0.55, 8.6]],
    12,
  );
  await g.wait(8.5);
  ui.hud(true);
  ui.place('Star Square', 'Home');
  await flight;

  await say('nutty', "You've been pulling that thing all morning.", { auto: 3 });
  await say('poppy', "It's... stuck... on... PURPOSE!", { auto: 2.6 });

  // The relic pops free and Poppy tumbles backwards.
  sfx.pop();
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

  // While everyone stares at the glow, Nutty notices something in the distance and wanders off.
  scene.attach(bun);
  bun.position.set(-5.2, 0.09, 9.9);
  nutty.state = 'idle';
  nutty.walkPath([[-2, 8.5], [6, 6], [14, 4.5], [19, 4]], 2.2);

  poppy.state = 'wave';
  poppy.face(rig.pos.x, rig.pos.z);
  await say('poppy', "Hey! You're finally here. I found something!", { choices: ['Join Poppy'] });
  poppy.state = 'idle';
  await say('poppy', "Look, it's glowing! Like the old Starway stones in Lumi's books. Nutty, look at... Nutty?");
  poppy.face(-5.2, 9.9);
  await rig.go([-3.6, 1.6, 12.6], [-5.2, 0.2, 9.9], 1.8);
  await say('poppy', 'He left half a bun behind. Nutty NEVER leaves half a bun behind.');
  await rig.go([-4.6, 3, 14.2], [-7.1, 0.55, 8.6], 1.2);
  poppy.face(rig.pos.x, rig.pos.z);
  await say('poppy', "Something's up. Come on, let's ask around the square.");

  nutty.target = null;
  nutty.place(38.6, 5.4).faceNow(30, 4);
  nutty.state = 'scared';

  // ---------------------------------------------------------------- Exploring Star Square
  ui.cinematic(false);
  ui.hideDialogue();
  ui.objective('Find Nutty: ask around Star Square');
  rig.startExplore([-3, 0, 6]);
  poppy.walkTo(-2.5, 5.5, 2.6);
  for (const b of [lumi, mimi, zuzu]) b.badge.visible = true;

  const talked = new Set();
  let busy = false;
  let found;
  const foundNutty = new Promise(r => { found = r; });

  // Poppy trots over to whoever you picked, and the camera sets up a proper two-shot.
  const meet = async b => {
    const dx = b.x - poppy.x, dz = b.z - poppy.z;
    const d = Math.hypot(dx, dz) || 1;
    const px = b.x - (dx / d) * 1.4, pz = b.z - (dz / d) * 1.4;
    const mx = (px + b.x) / 2, mz = (pz + b.z) / 2;
    let nx = -(b.z - pz) / 1.4, nz = (b.x - px) / 1.4;
    if ((rig.pos.x - mx) * nx + (rig.pos.z - mz) * nz < 0) { nx = -nx; nz = -nz; }
    const cx = mx + nx * 4.4 + (dx / d) * 0.6, cz = mz + nz * 4.4 + (dz / d) * 0.6;
    // Both turn toward each other, cheated a little toward the camera so we see their faces.
    const cheat = (who, other) => who.face(other.x + (cx - other.x) * 0.45, other.z + (cz - other.z) * 0.45);
    if (b.state === 'dance') b.state = 'idle';
    b.face(px, pz);
    await Promise.all([
      poppy.walkTo(px, pz, 3.2).then(() => { cheat(poppy, b); cheat(b, { x: px, z: pz }); }),
      rig.go([cx, 1.9, cz], [mx, 0.85, mz], 1.5),
    ]);
  };

  const conversations = {
    lumi: async () => {
      await say('lumi', 'Poppy! Is that... Starway stone?! Where did you DIG that up?');
      await say('poppy', 'My garden! Have you seen Nutty?');
      await say('lumi', "Nope. I've been fixing my Sky Crank since breakfast. It's very nearly almost working.");
    },
    mimi: async () => {
      await say('mimi', "Darlings! You're just in time for my rehearsal!");
      await say('poppy', 'Mimi, have you seen Nutty?');
      await say('mimi', 'He shuffled past the fountain ages ago. No rhythm at all. Heading east, I think.');
      mimi.state = 'dance';
    },
    zuzu: async () => {
      await say('poppy', 'Zuzu? ...ZUZU!');
      zuzu.state = 'sit';
      await say('zuzu', 'Mmh... five more minutes...');
      await say('poppy', 'Have you seen Nutty?');
      await say('zuzu', 'He went to the old bridge. Said he saw a giant potato. I saw it too. With one eye.');
      await say('poppy', 'The old bridge? But it broke before we were even born!');
      zuzu.state = 'sleep';
    },
  };
  const repeats = {
    lumi: 'Sky Crank. Very nearly almost working.',
    mimi: 'And five, six, seven, eight!',
    zuzu: 'Zzz... potato...',
    poppy: 'Nutty, where ARE you?',
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
      ui.bark(b, repeats[b.kind], 2.4);
      return;
    }
    busy = true;
    talked.add(b.kind);
    b.badge.visible = false;
    await meet(b);
    await conversations[b.kind]();
    ui.hideDialogue();
    rig.startExplore([b.x, 0, b.z + 1]);
    busy = false;
    if (b === zuzu) found();
  };

  // A gentle nudge for anyone who hasn't found Zuzu after a while.
  g.wait(40).then(() => {
    if (!talked.has('zuzu') && !busy) {
      ui.bark(poppy, 'Zuzu sees everything. Mostly with his eyes closed. He naps under the big tree.', 4.5);
      rig.focusOn(zuzu.x, zuzu.z, 0.8);
    }
  });

  await foundNutty;
  g.onPick = null;
  ui.objective('Follow Poppy to the old bridge');
  poppy.face(rig.pos.x, rig.pos.z);
  await say('poppy', "The old bridge is past Lumi's workshop. Come on!", { choices: ['Follow Poppy'] });

  // ---------------------------------------------------------------- To the old bridge
  rig.followWith(() => ({ pos: [poppy.x - 5, 4.5, poppy.z + 9], look: [poppy.x + 2, 0.8, poppy.z] }), 2);
  await poppy.walkPath([[1, 6.5], [8, 5], [14, 4.3], [19.8, 4]], 3.4);
  ui.place('The Old Bridge', 'Edge of Star Square');
  ui.cinematic(true);
  await rig.go([23.5, 3.4, 13], [33, 0.8, 4], 2.8);
  nutty.state = 'wave';
  await say('nutty', 'Poppy! Over here! I found the giant potato!');
  await say('poppy', 'Nutty! How did you get all the way over there?');
  nutty.state = 'scared';
  await say('nutty', 'The stones were all lined up, so I hopped across. Then they... un-lined.');
  await say('nutty', "I'd hop back, but they keep wobbling. And I'm very delicate.");
  await rig.go([21.4, 1.7, 7.6], [20, 1.1, 4], 1.8);
  poppy.face(rig.pos.x, rig.pos.z);
  await say('poppy', "Nutty's stuck! Think you can help us get across?", { choices: ['Help Poppy'] });
  ui.hideDialogue();

  // ---------------------------------------------------------------- Mission 1: the floating stones
  await g.ensureInput();
  ui.place('The Old Bridge', 'Edge of Star Square');
  ui.objective('Help Poppy cross the floating stones');
  await bridgeMission(g);

  // ---------------------------------------------------------------- Gate Rock
  ui.hideCoach();
  g.needsBody = false;
  ui.place('Gate Rock', 'Across the old bridge');
  ui.objective(null);
  nutty.state = 'idle';
  nutty.walkTo(37.6, 5, 2);
  await poppy.walkTo(37.2, 3.4, 2.5);
  poppy.face(nutty.x, nutty.z);
  nutty.face(poppy.x, poppy.z);
  await rig.go([35, 2.3, 9], [38.5, 1, 4.2], 1.6);
  await say('nutty', 'You made it! ...Wait. Now we are BOTH stuck.');
  await say('poppy', "Not for long. Take a closer look at your 'potato', Nutty.");
  await rig.go([35.8, 2.9, 8.2], [41, 1.9, 4], 2);
  await say('poppy', "There's a hole on top. It's exactly the same shape as my stone!");

  await poppy.walkTo(39.6, 4, 2);
  poppy.faceNow(41, 4);
  scene.attach(W.relic);
  W.relic.scale.setScalar(1);
  W.relic.userData.glow = 1;
  const rFrom = W.relic.position.clone();
  await g.tween(1, k => {
    W.relic.position.lerpVectors(rFrom, W.gate.slot, k);
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
  await say('nutty', 'Did we just break the potato?');

  // Lumi calls over from the workshop.
  ui.place("Lumi's Workshop", 'Star Square');
  lumi.state = 'idle';
  await rig.go([14.6, 3.2, 3.9], [17.7, 1.3, 8.5], 2.2);
  lumi.face(rig.pos.x, rig.pos.z);
  await say('lumi', "Poppy! That's not a potato. It's a STARWAY GATE! It just needs power!");
  await say('lumi', 'My Sky Crank can make power. Lots of it. Probably.');
  await say('lumi', "But I can't crank it on my own. Will you help me?", { choices: ['Help Lumi'] });
  ui.hideDialogue();

  // ---------------------------------------------------------------- Mission 2: the Sky Crank
  ui.objective("Power up Lumi's Sky Crank");
  await crankMission(g);

  // ---------------------------------------------------------------- Mission 3: the gate's poses
  ui.place('Gate Rock', 'Across the old bridge');
  ui.objective('Copy the shapes on the gate');
  await poseMission(g);

  // ---------------------------------------------------------------- The Starway returns
  g.needsBody = false;
  ui.hideCoach();
  ui.objective(null);
  ui.cinematic(true);
  W.gate.setPower(1.6);
  sfx.rumble();
  await rig.go([28, 7.5, 15], [27.5, 0, 4], 2.4);
  W.bridge.drift = 0;
  await g.tween(2.2, k => { W.bridge.settled = k; });
  sfx.whoosh();
  await g.tween(2.4, k => W.homeway.setProgress(k));
  sfx.chime();
  ui.place('The First Starway', 'Restored');

  // Poppy dashes home across the new bridge; Nutty follows, trips, and lands in a hug.
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
  // Hug faces each other, cheated toward the camera.
  poppy.face(23 + (23.4 - 23) * 0.5, 4 + (7.4 - 4) * 0.5);
  nutty.face(22.4 + (23.4 - 22.4) * 0.5, 4 + (7.4 - 4) * 0.5);
  await rig.go([23.4, 1.7, 7.4], [22.7, 0.95, 4], 1.4);
  await say('poppy', 'Oof!');
  await say('nutty', 'I meant to do that.');
  await say('poppy', 'You tripped.');
  await say('nutty', 'I meant to trip.');
  poppy.state = nutty.state = 'idle';
  ui.hideDialogue();

  // Pull back: the next Starway lights up toward a forest nobody has seen in years.
  await rig.go([12, 30, 46], [52, 2, -12], 4.5);
  sfx.discover();
  g.tween(3.6, k => W.forestway.setProgress(k));
  await g.tween(4, k => W.forest.reveal(k));
  g.discover('forest');
  ui.toast('New route discovered', 'Glow Forest');
  await g.wait(1.5);
  await say('poppy', "Glow Forest... nobody's been there in years.");
  await say('nutty', 'Is there food there?');
  await say('lumi', "Only one way to find out. I'll pack the gadgets!");
  ui.hideDialogue();
  await ui.chapterCard('Chapter 1 complete', 'The First Starway');

  // ---------------------------------------------------------------- Back to the living world
  ui.cinematic(false);
  ui.place('Star Square', 'Home');
  ui.objective('Glow Forest awaits. Chapter 2 is coming soon');
  lumi.state = 'work';
  mimi.state = 'dance';
  poppy.place(20.5, 5.2).faceNow(30, 4);
  nutty.place(20.3, 2.9).faceNow(30, 4);
  rig.startExplore([16, 0, 4.5]);
  g.onPick = target => {
    const b = target.userData.buddy;
    const lines = {
      poppy: 'Tomorrow: Glow Forest. Today: snacks.',
      nutty: "I'm bringing three buns. For emergencies.",
      lumi: 'If I add a second crank, I get double the power. Right?',
      mimi: 'A forest! The acoustics will be MAGNIFICENT.',
      zuzu: 'Zzz... glow... forest...',
    };
    if (b) ui.bark(b, lines[b.kind], 3);
    else {
      rig.focusOn(target.position.x, target.position.z, 0.8);
      ui.bark(poppy, target.userData.line, 3.2);
    }
  };
}

// ==========================================================================================
// Mission 1: Poppy hops across drifting stones when the child jumps. One stone has sunk;
// raising both arms lifts it. Mistimed jumps just make Poppy wobble; nothing is ever lost.

async function bridgeMission(g) {
  const { ui, rig, B, W, input } = g;
  const poppy = B.poppy;
  const little = g.settings.age === 'little';
  const tol = little ? 0.7 : 0.4;
  const bridge = W.bridge;
  bridge.drift = little ? 0.55 : 1.25;

  const keys = !input.camera;
  ui.coach('jump', 'Jump to make Poppy jump!', keys ? 'Press Space. Wait for the stone to glow.' : 'Wait until the next stone glows, then jump!');
  g.needsBody = true;
  ui.cinematic(false);
  rig.followWith(() => ({ pos: [poppy.x + 1.2, 4, 13.5], look: [poppy.x + 2.6, 0.4, 4] }), 2.2);
  await poppy.walkTo(bridge.start.x, bridge.start.z, 2);
  poppy.faceNow(30, 4);
  input.consumeJump();

  let at = -1;
  let hopping = false;
  let lift = 0;
  let liftIntro = false;
  const n = bridge.stones.length;
  const targetOf = i => (i >= n ? bridge.landing.clone() : bridge.top(i));

  for (;;) {
    await g.frame();
    if (at >= n) break;
    if (at >= 0 && !hopping) poppy.root.position.copy(bridge.top(at));
    const next = at + 1;

    // The sunken stone: raise both arms to lift it.
    if (next < n && bridge.stones[next].userData.sunk && !hopping) {
      if (!liftIntro) {
        liftIntro = true;
        ui.coach('star', 'Raise both arms to lift the stone!', keys ? 'Hold W (or ↑).' : 'Reach up high and hold it!');
        ui.bark(poppy, 'Oh no, that one sank!', 2.2);
        sfx.wobble();
      }
      const s = bridge.stones[next];
      lift = input.armsUp ? Math.min(1, lift + g.dt / 1.4) : Math.max(0, lift - g.dt * 0.6);
      s.userData.raise = lift * 0.85;
      ui.setCoachProgress(lift);
      if (lift >= 1) {
        s.userData.raise = 1;
        s.userData.sunk = false;
        sfx.rumble();
        sfx.chime();
        ui.setCoachProgress(0);
        ui.bark(poppy, 'You lifted it!', 2);
        ui.coach('jump', 'Now jump again!', keys ? 'Press Space when it glows.' : 'Wait for the glow, then jump!');
        input.consumeJump();
      }
      bridge.highlight(-1, false);
      input.consumeJump();
      continue;
    }

    const aligned = next >= n || bridge.aligned(next, tol);
    bridge.highlight(next < n ? next : -1, aligned);

    if (!hopping && input.consumeJump()) {
      hopping = true;
      sfx.jump();
      if (aligned) {
        poppy.hop(() => targetOf(next), 1.3, 0.62).then(() => {
          at = next;
          hopping = false;
          sfx.land();
          if (next === 1) ui.bark(poppy, 'Wheee!', 1.4);
          if (next === n - 1) ui.bark(poppy, 'Almost there!', 1.6);
        });
      } else {
        // Too early: Poppy hops on the spot and windmills her arms.
        poppy.hop(() => poppy.root.position.clone(), 0.5, 0.4).then(() => {
          hopping = false;
          sfx.wobble();
          ui.bark(poppy, 'Whoa! Wait for the glow!', 1.8);
        });
      }
    }
  }
  bridge.highlight(-1, false);
  sfx.chime();
}

// ==========================================================================================
// Mission 2: pump your arms (up, then down) to crank Lumi's machine and charge the core.

async function crankMission(g) {
  const { ui, B, W, input } = g;
  const lumi = B.lumi;
  const need = g.settings.age === 'little' ? 5 : 8;
  const keys = !input.camera;
  ui.coach('pump', 'Arms up high, then down low!', keys ? 'Tap W (or ↑) again and again.' : 'Up... and down! Keep going!');
  g.needsBody = true;
  lumi.state = 'cheer';

  let pumps = 0;
  let up = false;
  const cheers = ['More!', 'Faster!', "It's working!", 'Bzzt! Good bzzt!', 'Keep going!', 'Almost!', 'So close!'];
  while (pumps < need) {
    await g.frame();
    if (!up && input.armsUp) up = true;
    else if (up && input.armsDown) {
      up = false;
      pumps++;
      W.crank.kick();
      W.crank.setCharge(pumps / need);
      sfx.charge(pumps / need);
      ui.setCoachProgress(pumps / need);
      if (pumps < need) ui.bark(lumi, cheers[(pumps - 1) % cheers.length], 1.2);
    }
  }
  g.needsBody = false;
  ui.hideCoach();
  ui.setCoachProgress(0);
  ui.cinematic(true);
  ui.bark(lumi, 'FULL POWER!', 1.6);
  sfx.whoosh();
  await g.wait(0.8);

  // The beam leaps across the gap to the gate.
  await g.rig.go([29, 6, 16], [32, 1.5, 5], 1.6);
  await g.tween(1.2, k => W.beam.show(k));
  W.gate.setPower(1);
  sfx.rumble();
  for (let i = 0; i < 3; i++) W.gate.setGlyph(i, 0.25);
  await g.wait(1);
  await g.tween(0.8, k => W.beam.fade(0.85 * (1 - k)));
  W.beam.show(0);
  lumi.state = 'work';
}

// ==========================================================================================
// Mission 3: the gate's three carved glyphs are poses. Copy each one and hold it.

async function poseMission(g) {
  const { ui, rig, B, W, input } = g;
  const { poppy, nutty } = B;
  const little = g.settings.age === 'little';
  const holdFor = little ? 0.8 : 1.3;
  const keys = !input.camera;

  poppy.place(39.1, 5.5).faceNow(34, 4.5);
  nutty.place(39.1, 2.5).faceNow(34, 3.5);
  await rig.go([33.2, 2.7, 4], [40.6, 1.6, 4], 2);
  await say(g, 'poppy', "The gate has pictures on it. They look like... people doing poses?");
  await say(g, 'mimi', 'Did someone say POSES? Copy the shapes, darlings! Big and proud!');
  ui.hideDialogue();
  ui.cinematic(false);
  g.needsBody = true;

  for (let i = 0; i < W.gate.glyphs.length; i++) {
    const kind = W.gate.glyphs[i];
    const P = POSES[kind];
    ui.coach(kind, P.text, keys ? P.key : 'Hold it still...');
    let hold = 0;
    while (hold < holdFor) {
      await g.frame();
      const t = performance.now() / 1000;
      W.gate.setGlyph(i, 0.7 + Math.sin(t * 5) * 0.3);
      hold = input.pose === kind ? hold + g.dt : Math.max(0, hold - g.dt * 1.5);
      ui.setCoachProgress(hold / holdFor);
    }
    W.gate.setGlyph(i, 3);
    sfx.chime();
    ui.setCoachProgress(0);
    // Poppy and Nutty copy the pose too; Nutty gets the moon slightly wrong.
    poppy.state = nutty.state = 'pose';
    poppy.pose = P.arms;
    nutty.pose = kind === 'moon' ? [2.6, 0.35] : P.arms;
    ui.bark(i === 2 ? nutty : poppy, ['Like a star!', 'A bridge!', 'Is this a moon? I feel like a moon.'][i], 2);
    await g.wait(1.6);
    poppy.state = nutty.state = 'idle';
  }
}

function say(g, who, text, opts) { return g.ui.say(who, text, opts); }
