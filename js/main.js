// Boots Astra: renderer, world, buddies, input and UI, then hands over to the director, which
// plays the chapter. Nothing in here is specific to one chapter.
//
//   js/core/        shared systems (game context, director, input, UI, camera, audio)
//   js/world/       the 3D world and the five buddies
//   js/activities/  reusable movement-activity engines
//   js/chapters/    each chapter: running order, scenes, lines, activity settings

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './world/world.js';
import { Buddy } from './world/buddies.js';
import { MotionInput } from './core/input.js';
import { UI } from './core/ui.js';
import { CameraRig } from './core/camera.js';
import { setVolume } from './core/audio.js';
import { createGame } from './core/game.js';
import { playChapter, loadProgress, saveProgress } from './core/director.js';
import { CHAPTERS } from './chapters/index.js';

const $ = s => document.querySelector(s);
const canvas = $('#view');

// ---- Renderer & scene --------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Neutral keeps the pastels bright; ACES darkened and desaturated them.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1400);

// Passes: N8AO (soft shadows where things touch, so the world looks grounded; it draws the
// scene itself) or a plain RenderPass, then a soft bloom so the Starway, the relic and lit
// windows glow. N8AO loads separately, so the game still runs if it fails to load.
// "Low quality" in Settings turns off AO and bloom for slow laptops.
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let ao = null;
let lowQuality = false;
try { lowQuality = localStorage.getItem('astra.lowQuality') === '1'; } catch { /* no storage */ }

function setLowQuality(on) {
  lowQuality = on;
  bloom.enabled = !on;
  if (ao) ao.enabled = !on;
  renderPass.enabled = !ao || on;
  try { localStorage.setItem('astra.lowQuality', on ? '1' : '0'); } catch { /* no storage */ }
}

const aoReady = import('n8ao').then(({ N8AOPass }) => {
  ao = new N8AOPass(scene, camera, innerWidth, innerHeight);
  // gammaCorrection off: the OutputPass at the end already converts colours for the screen.
  // transparencyAware keeps the see-through clouds from turning grey; lavender instead of black
  // keeps the shading soft.
  Object.assign(ao.configuration, {
    aoRadius: 2, distanceFalloff: 1, intensity: 1.6, halfRes: true, gammaCorrection: false,
    transparencyAware: true, color: new THREE.Color('#4a3a6e'),
  });
  composer.insertPass(ao, 1);
  composer.setSize(innerWidth, innerHeight);
  setLowQuality(lowQuality);
}).catch(err => console.warn('Ambient occlusion unavailable:', err));

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

const g = createGame({ scene, camera, W, B, input, ui, rig });
g.onDiscover = () => renderMap();

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
const panel = id => { for (const p of ['#settings', '#map', '#story']) $(p).hidden = p !== id || !$(p).hidden; };
$('#btn-settings').onclick = () => panel('#settings');
$('#btn-map').onclick = () => panel('#map');
$('#btn-story').onclick = () => { renderStory(); panel('#story'); };
for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = () => panel(null);
$('#set-voice').onchange = e => { ui.voice = e.target.checked; if (!ui.voice) speechSynthesis?.cancel(); };
$('#set-volume').oninput = e => setVolume(Number(e.target.value));
$('#set-low').checked = lowQuality;
$('#set-low').onchange = e => setLowQuality(e.target.checked);
setLowQuality(lowQuality);
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

// ---- Story panel: replay any step you've reached --------------------------------------
const chapter = CHAPTERS[0];
let currentStep = 0;

function renderStory() {
  const { reached } = loadProgress(chapter.id);
  $('#story-chapter').textContent = `Chapter ${chapter.number} · ${chapter.title}`;
  const list = $('#story-list');
  list.innerHTML = '';
  chapter.steps.forEach((step, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.textContent = step.name;
    b.className = step.activity ? 'activity' : 'scene';
    b.disabled = i > reached;
    if (i === currentStep) b.classList.add('now');
    // Replaying reloads the page and fast-forwards to the step, so the world is set up right.
    b.onclick = () => {
      saveProgress(chapter.id, { ...loadProgress(chapter.id), resume: i });
      location.reload();
    };
    li.appendChild(b);
    list.appendChild(li);
  });
}

// ---- Main loop -------------------------------------------------------------------
const clock = new THREE.Clock();
let lostFor = 0;
let paused = false;

function frame() {
  const realDt = Math.min(0.05, clock.getDelta());
  const dt = realDt * g.timeScale; // much faster while a scene is skipped
  const t = clock.elapsedTime;
  input.update(realDt);

  // Movement missions pause (gently) whenever the child steps out of view.
  lostFor = g.needsBody && input.camera && !input.tracking ? lostFor + realDt : 0;
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

  if (input.camera && !$('#coach').hidden) input.drawPreview($('#coach-cam'), ui.preview ?? {});
  $('#coach-cam').hidden = !input.camera;

  // While a scene fast-forwards the curtain hides the screen, so don't spend time drawing.
  if (!g.skipping) composer.render();

  if (!paused) g.tick(dt);
  requestAnimationFrame(frame);
}

window.astra = g; // handy for poking at the world from the dev console

// ?debug in the URL: live sliders for the look of the world.
if (new URLSearchParams(location.search).has('debug')) {
  aoReady.then(() => import('three/addons/libs/lil-gui.module.min.js')).then(({ default: GUI }) => {
    const gui = new GUI({ title: 'Look' });
    const look = { toon: true };
    gui.add(look, 'toon').name('Toon shading').onChange(on => W.setToon(on));
    gui.add(scene.fog, 'near', 0, 1000, 10).name('Fog near');
    gui.add(scene.fog, 'far', 100, 1400, 10).name('Fog far');
    if (ao) {
      gui.add(ao, 'enabled').name('AO').onChange(on => { renderPass.enabled = !on; });
      gui.add(ao.configuration, 'intensity', 0.5, 6, 0.1).name('AO intensity'); // N8AO glitches at 0
      gui.add(ao.configuration, 'aoRadius', 0.2, 6, 0.1).name('AO radius');
      gui.add(ao.configuration, 'halfRes').name('AO half resolution');
      gui.add({ view: 'Combined' }, 'view', ['Combined', 'AO', 'No AO', 'Split']).name('AO view')
        .onChange(mode => ao.setDisplayMode(mode));
    }
  });
}

document.fonts.ready.finally(() => {
  requestAnimationFrame(frame);
  playChapter(g, chapter, { onStep: i => { currentStep = i; } }).catch(err => console.error(err));
});
