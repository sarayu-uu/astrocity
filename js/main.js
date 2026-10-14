import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './world.js';
import { Buddy } from './buddies.js';
import { MotionInput } from './input.js';
import { UI } from './ui.js';
import { CameraRig } from './camera.js';
import { story } from './story.js';
import { audio, setVolume, sfx } from './audio.js';

const $ = s => document.querySelector(s);
const canvas = $('#view');

// ---- Renderer & scene --------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1400);

// A soft bloom so the Starway, the relic and lit windows actually glow.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 55 : 38;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const W = buildWorld(scene);
const B = {};
for (const kind of ['poppy', 'nutty', 'lumi', 'mimi', 'zuzu']) {
  B[kind] = new Buddy(kind);
  scene.add(B[kind].root);
}

const input = new MotionInput($('#cam'));
const ui = new UI();
const rig = new CameraRig(camera, canvas);
ui.onSpeak = (who, on) => { if (who && B[who]) B[who].talking = on; };

// ---- The shared game context the story drives ----------------------------------
let waiters = [];
const g = {
  scene, camera, W, B, input, ui, rig,
  settings: { age: 'little' },
  dt: 0,
  needsBody: false,
  onPick: null,
  discovered: new Set(['square', 'gate']),

  // Resolves on the next unpaused frame. Movement missions are built from these.
  frame() { return new Promise(r => waiters.push(r)); },

  async tween(duration, fn) {
    let t = 0;
    while (t < duration) {
      await g.frame();
      t += g.dt;
      fn(Math.min(1, t / duration));
    }
  },

  wait(seconds) { return g.tween(seconds, () => {}); },

  title() {
    $('#title').hidden = false;
    return new Promise(resolve => {
      $('#btn-enter').onclick = () => {
        audio();
        $('#title').classList.add('leaving');
        setTimeout(() => { $('#title').hidden = true; }, 1200);
        resolve();
      };
    });
  },

  async ensureInput() {
    if (input.mode) return;
    for (;;) {
      const how = await ui.chooseInput();
      if (how === 'keyboard') {
        input.useKeyboard();
        return;
      }
      ui.setupStatus('Waking up the camera…');
      try {
        await input.startCamera();
        break;
      } catch (err) {
        ui.setupStatus(`The camera didn't start (${err.message || err.name}). The keyboard works too.`, true);
      }
    }
    ui.hideSetup();
    ui.coach('stand', 'Step back until Poppy can see all of you', 'Head to knees, with room to jump');
    let seen = 0;
    while (seen < 1.5) {
      await g.frame();
      seen = input.tracking ? seen + g.dt : 0;
      ui.setCoachProgress(seen / 1.5);
    }
    ui.setCoachProgress(0);
    ui.coach('stand', 'Perfect! Poppy can see you.', '');
    sfx.chime();
    await g.wait(1.2);
  },

  discover(id) {
    g.discovered.add(id);
    renderMap();
  },
};

// ---- Pointing at things in the world ---------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoverXY = null;

function pickAt(x, y) {
  pointer.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [...Object.values(B).map(b => b.root), ...W.clickable];
  for (const hit of raycaster.intersectObjects(targets, true)) {
    let o = hit.object;
    while (o && !o.userData.buddy && !o.userData.label) o = o.parent;
    if (o) return o;
  }
  return null;
}

canvas.addEventListener('pointermove', e => { hoverXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerleave', () => { hoverXY = null; });
canvas.addEventListener('click', e => {
  if (!g.onPick || rig.dragged) return;
  const target = pickAt(e.clientX, e.clientY);
  if (target) g.onPick(target);
});

// ---- Settings & map ------------------------------------------------------------
const panel = id => { for (const p of ['#settings', '#map']) $(p).hidden = p !== id || !$(p).hidden; };
$('#btn-settings').onclick = () => panel('#settings');
$('#btn-map').onclick = () => panel('#map');
for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = () => panel(null);
$('#set-voice').onchange = e => { ui.voice = e.target.checked; if (!ui.voice) speechSynthesis?.cancel(); };
$('#set-volume').oninput = e => setVolume(Number(e.target.value));
for (const r of document.querySelectorAll('[name=age]')) {
  r.onchange = () => {
    g.settings.age = r.value;
    input.setAge(r.value);
  };
}

function renderMap() {
  for (const el of document.querySelectorAll('#map [data-region]')) {
    const known = g.discovered.has(el.dataset.region);
    el.classList.toggle('known', known);
    const name = el.querySelector('text');
    if (name) name.textContent = known ? el.dataset.name : '???';
  }
}
renderMap();

// ---- Main loop -------------------------------------------------------------------
const clock = new THREE.Clock();
let lostFor = 0;
let paused = false;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  input.update(dt);

  // Movement missions pause (gently) whenever the child steps out of view.
  lostFor = g.needsBody && input.camera && !input.tracking ? lostFor + dt : 0;
  if ((lostFor > 0.6) !== paused) {
    paused = lostFor > 0.6;
    ui.lost(paused);
  }

  W.update(dt, t);
  for (const b of Object.values(B)) b.update(dt, camera);
  rig.update(dt);
  ui.update(camera);

  if (hoverXY && g.onPick) {
    const o = pickAt(...hoverXY);
    const label = o ? (o.userData.buddy?.name ?? o.userData.label) : null;
    ui.tooltip(label, hoverXY[0] + 14, hoverXY[1] + 14);
    canvas.style.cursor = o ? 'pointer' : 'grab';
  } else {
    ui.tooltip(null);
    canvas.style.cursor = '';
  }

  if (input.camera && !$('#coach').hidden) input.drawPreview($('#coach-cam'));
  $('#coach-cam').hidden = !input.camera;

  composer.render();

  if (!paused) {
    g.dt = dt;
    const ready = waiters;
    waiters = [];
    for (const r of ready) r(dt);
  }
  requestAnimationFrame(frame);
}

window.astra = g; // handy for poking at the world from the dev console

document.fonts.ready.finally(() => {
  requestAnimationFrame(frame);
  story(g).catch(err => console.error(err));
});
