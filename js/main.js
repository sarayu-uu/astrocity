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
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { buildWorld } from './world/world.js';
import { Buddy } from './world/buddies.js';
import { MotionInput } from './core/input.js';
import { UI } from './core/ui.js';
import { CameraRig } from './core/camera.js';
import { setVolume } from './core/audio.js';
import { createGame } from './core/game.js';
import { playChapter, loadProgress, saveProgress, runActivity } from './core/director.js';
import { CHAPTERS } from './chapters/index.js';
import { startSessionLog, downloadSessions, clearSessions, loadSessions } from './core/session-log.js';

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
// Edge smoothing: the post-processing chain loses the browser's own anti-aliasing.
const smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
composer.addPass(smaa);
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
  ao.scene = renderPass.scene; // in case a stage opened before AO finished loading
  ao.camera = renderPass.camera;
  composer.insertPass(ao, 1);
  composer.setSize(innerWidth, innerHeight);
  setLowQuality(lowQuality);
}).catch(err => console.warn('Ambient occlusion unavailable:', err));

// What the renderer draws: the island, or an open activity stage (js/core/stage.js).
let viewCamera = camera;
function setView(s, c) {
  const toScene = s ?? scene;
  viewCamera = c ?? camera;
  renderPass.scene = toScene;
  renderPass.camera = viewCamera;
  if (ao) {
    ao.scene = toScene;
    ao.camera = viewCamera;
  }
  resize();
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  smaa.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 55 : 38;
  camera.updateProjectionMatrix();
  if (viewCamera !== camera) {
    viewCamera.aspect = innerWidth / innerHeight;
    viewCamera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize);
resize();

const W = buildWorld(scene);
W.setToon(false); // smooth shading everywhere, to match the glossy alien props
const B = {};
for (const kind of ['poppy', 'nutty', 'lumi', 'mimi', 'zuzu']) {
  B[kind] = new Buddy(kind);
  scene.add(B[kind].root);
}

const input = new MotionInput($('#cam'));
const ui = new UI();
const rig = new CameraRig(camera, canvas);
const g = createGame({ scene, camera, W, B, input, ui, rig });
g.setView = setView;
// Dialogue animates whichever buddies are in play: the island's, or a stage's copies.
ui.onSpeak = (who, on) => { if (who && g.cast[who]) g.cast[who].talking = on; };
ui.isCast = b => Object.values(g.cast).includes(b);
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
  // The movement games (runner and fly mode), playable any time: the story before them is
  // fast-forwarded, so the world is set up right.
  const games = $('#story-games');
  games.innerHTML = '';
  chapter.steps.forEach((step, i) => {
    if (!['runner', 'trials'].includes(step.activity?.engine)) return;
    const b = document.createElement('button');
    b.textContent = step.name;
    // Same as replaying a part: the title then offers "Continue · <game>".
    b.onclick = () => {
      saveProgress(chapter.id, { ...loadProgress(chapter.id), resume: i, reached: Math.max(reached, i) });
      location.reload();
    };
    games.appendChild(b);
  });
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

// ---- Play records (session log): Settings › Record play sessions, or ?log / ?debug -------
// ?kid=A1 labels a session for a playtest sheet.
const params = new URLSearchParams(location.search);
const RECORD_KEY = 'astra.record';
const recordSetting = () => { try { return localStorage.getItem(RECORD_KEY) === '1'; } catch { return false; } };
let sessionLog = null;
const startRecording = () => {
  sessionLog ??= startSessionLog(g, { kid: params.get('kid'), step: params.get('step') });
};
if (params.has('debug') || params.has('log') || recordSetting()) startRecording();

const refreshRecords = () => { $('#records-count').textContent = loadSessions().length; };
$('#set-record').checked = !!sessionLog;
$('#set-record').onchange = e => {
  try { localStorage.setItem(RECORD_KEY, e.target.checked ? '1' : '0'); } catch { /* no storage */ }
  if (e.target.checked) startRecording();
  else if (sessionLog) {
    sessionLog.save();
    g.log = () => {}; // stop adding to this session
    sessionLog = null;
  }
  refreshRecords();
};
$('#records-download').onclick = () => {
  sessionLog?.save();
  downloadSessions();
};
$('#records-clear').onclick = () => {
  if (!confirm('Delete all play records on this computer? Download them first if you need them.')) return;
  clearSessions();
  sessionLog?.save(); // keep the one recording now
  refreshRecords();
};
$('#btn-settings').addEventListener('click', refreshRecords);
refreshRecords();

// ---- Main loop -------------------------------------------------------------------
const clock = new THREE.Clock();
const RESUME_COUNT = 3; // seconds of 3-2-1 after the child steps back into view
let lostFor = 0;
let paused = false;
let pauseWhy = null; // 'tracking' | 'menu', for the session log
let resumeIn = 0;

function frame() {
  const realDt = Math.min(0.05, clock.getDelta());
  const dt = realDt * g.timeScale; // much faster while a scene is skipped
  const t = clock.elapsedTime;
  input.update(realDt);

  // Movement missions pause (gently) whenever the child steps out of view, and pick up again
  // with a 3-2-1 once they are back.
  // Opening Settings, Map or Story during a movement activity pauses it too. Whatever paused
  // it, play resumes after a 3-2-1, and g.onResume lets the activity clear the way ahead.
  lostFor = g.needsBody && input.camera && !input.tracking ? lostFor + realDt : 0;
  const sheetOpen = g.needsBody && ['#settings', '#map', '#story'].some(s => !$(s).hidden);
  if (lostFor > 0.6 || sheetOpen) {
    if (!paused) pauseWhy = lostFor > 0.6 ? 'tracking' : 'menu';
    paused = true;
    ui.lost(lostFor > 0.6);
    resumeIn = RESUME_COUNT;
    ui.countdown(null);
  } else if (paused && lostFor === 0) {
    ui.lost(false);
    resumeIn -= realDt;
    ui.countdown(resumeIn > 0 ? Math.ceil(resumeIn) : null);
    if (resumeIn <= 0) {
      paused = false;
      g.onResume?.();
    }
  }
  sessionLog?.tick(realDt, { input, needsBody: g.needsBody, isPaused: paused, pauseWhy });

  // The island is paused (kept as it was) while an activity stage is open.
  if (g.stage) {
    g.stage.update(dt, t);
  } else {
    W.update(dt, t);
    for (const b of Object.values(B)) b.update(dt, camera);
    rig.update(dt);
  }
  ui.update(viewCamera);

  if (hoverXY && g.onPick && !g.stage) {
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
  debugTick?.(realDt);

  if (!paused) g.tick(dt);
  requestAnimationFrame(frame);
}

window.astra = g; // handy for poking at the world from the dev console
g.renderer = renderer; // for memory and draw-call checks (?debug, tests)

// ?debug in the URL: live sliders for the look of the world, and the Moves panel for testing
// body tracking (js/core/debug-moves.js).
let debugTick = null;
if (new URLSearchParams(location.search).has('debug')) {
  aoReady.then(() => import('three/addons/libs/lil-gui.module.min.js')).then(async ({ default: GUI }) => {
    const gui = new GUI({ title: 'Debug' });
    const lookF = gui.addFolder('Look');
    lookF.add({ toon: false }, 'toon').name('Toon shading').onChange(on => W.setToon(on));
    lookF.add(scene.fog, 'near', 0, 1000, 10).name('Fog near');
    lookF.add(scene.fog, 'far', 100, 1400, 10).name('Fog far');
    if (ao) {
      lookF.add(ao, 'enabled').name('AO').onChange(on => { renderPass.enabled = !on; });
      lookF.add(ao.configuration, 'intensity', 0.5, 6, 0.1).name('AO intensity'); // N8AO glitches at 0
      lookF.add(ao.configuration, 'aoRadius', 0.2, 6, 0.1).name('AO radius');
      lookF.add(ao.configuration, 'halfRes').name('AO half resolution');
      lookF.add({ view: 'Combined' }, 'view', ['Combined', 'AO', 'No AO', 'Split']).name('AO view')
        .onChange(mode => ao.setDisplayMode(mode));
    }
    lookF.close();
    const { createMovesPanel } = await import('./core/debug-moves.js');
    debugTick = createMovesPanel(input, gui, { age: () => g.settings.age });

    // Session log: every playtest session saved on this computer (Shift + L downloads too).
    const logF = gui.addFolder('Session log');
    const logInfo = { saved: '' };
    const refresh = () => { logInfo.saved = `${loadSessions().length} saved`; };
    refresh();
    logF.add(logInfo, 'saved').name('Sessions').listen().disable();
    logF.add({ download: () => { sessionLog?.save(); downloadSessions(); refresh(); } }, 'download').name('Download sessions (JSON)');
    logF.add({
      clear: () => {
        if (!confirm('Delete every saved session on this computer? Download them first.')) return;
        clearSessions();
        sessionLog?.save(); // keep the one running now
        refresh();
      },
    }, 'clear').name('Clear saved sessions');
    setInterval(refresh, 5000);

    // Stages: enter / leave the test stage, and a 10-round-trip memory check.
    const { enterStage, exitStage } = await import('./core/stage.js');
    const { default: testStage } = await import('./stages/test-stage.js');
    const stageF = gui.addFolder('Stages');
    const report = { result: '' };
    const counts = () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0 });
    const frames = n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    stageF.add({ enter: () => enterStage(g, testStage) }, 'enter').name('Enter test stage');
    stageF.add({ leave: () => exitStage(g) }, 'leave').name('Leave');
    stageF.add({
      run: async () => {
        const rows = [{ trip: 0, ...counts() }];
        for (let i = 1; i <= 10; i++) {
          report.result = `round trip ${i} / 10…`;
          await enterStage(g, testStage, { instant: i > 1 });
          await frames(3);
          await exitStage(g, { instant: i > 1 });
          await frames(3);
          rows.push({ trip: i, ...counts() });
        }
        console.table(rows);
        // Pass: counts level off by the 2nd round trip and stay flat after it.
        const flat = rows.slice(2).every(r => r.geometries === rows[2].geometries && r.textures === rows[2].textures && r.programs === rows[2].programs);
        const last = rows.at(-1);
        report.result = `${flat ? 'PASS' : 'FAIL'} · geo ${rows[0].geometries}→${last.geometries} · tex ${rows[0].textures}→${last.textures} · prog ${rows[0].programs}→${last.programs}`;
        window.astraStageReport = rows;
      },
    }, 'run').name('×10 enter / leave');
    stageF.add(report, 'result').name('Result').listen().disable();

    // Runner: play the test run on the test track (Phase 3).
    const { testRun } = await import('./stages/test-track.js');
    stageF.add({ run: () => runActivity(g, testRun) }, 'run').name('Runner test');
    stageF.add(g, 'debugAutoplay').name('Autoplay runs (bot)');
  });
}

document.fonts.ready.finally(() => {
  requestAnimationFrame(frame);
  // ?step=stone-run (any step id in chapter.js) jumps straight to that step, for testing.
  const jumpTo = new URLSearchParams(location.search).get('step');
  playChapter(g, chapter, { onStep: i => { currentStep = i; }, jumpTo }).catch(err => console.error(err));
});
