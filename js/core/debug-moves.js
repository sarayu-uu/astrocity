// The ?debug "Moves" panel: a big camera preview with zones and duck guides, a light for every
// move, sliders for the thresholds, and tools to record a real child and replay it later
// (the replay runs through exactly the same detection, so it also works in headless Chrome).

import { TUNE_DEFAULTS } from './input.js';

const $ = s => document.querySelector(s);

export function createMovesPanel(input, gui, { age = () => 'little' } = {}) {
  const panel = document.createElement('div');
  panel.id = 'moves';
  panel.innerHTML = `
    <header><strong>Moves</strong><span id="mv-mode"></span><button id="mv-size" title="Make the panel smaller (\`)"></button></header>
    <canvas id="mv-cam" width="320" height="240"></canvas>
    <ul id="mv-list"></ul>
    <div class="mv-buttons">
      <button data-act="camera">Camera</button>
      <button data-act="keyboard">Keyboard</button>
      <button data-act="calibrate">Calibrate</button>
      <button data-act="record">Record 10 s</button>
      <label class="mv-file">Replay…<input type="file" accept=".json,application/json" hidden></label>
    </div>
    <p id="mv-status"></p>`;
  document.body.appendChild(panel);

  const rows = ['tracking', 'zone', 'jump', 'arms', 'pose', 'duck', 'lean', 'still', 'baseline', 'speed'];
  const list = $('#mv-list');
  const cells = {};
  for (const r of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<i></i><span class="mv-name">${r}</span><span class="mv-val"></span>`;
    list.appendChild(li);
    cells[r] = li;
  }
  const set = (row, on, text = '') => {
    cells[row].classList.toggle('on', !!on);
    cells[row].querySelector('.mv-val').textContent = text;
  };
  const status = text => { $('#mv-status').textContent = text; };

  // Panel size, so it doesn't hide the game: full → small camera only → title bar only.
  // The header button or the ` key cycles it; the choice is remembered.
  const SIZES = ['full', 'mini', 'closed'];
  let size = 'full';
  try { size = localStorage.getItem('astra.debug.movesSize') || 'full'; } catch {}
  const setSize = s => {
    size = SIZES.includes(s) ? s : 'full';
    panel.dataset.size = size;
    $('#mv-size').textContent = { full: '–', mini: '▁', closed: '+' }[size];
    try { localStorage.setItem('astra.debug.movesSize', size); } catch {}
  };
  setSize(size);
  $('#mv-size').onclick = () => setSize(SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]);
  addEventListener('keydown', e => {
    if (e.code === 'Backquote' && !e.target.closest?.('input, textarea')) $('#mv-size').click();
  });

  // Buttons.
  panel.querySelector('[data-act=camera]').onclick = async () => {
    status('Starting the camera…');
    try {
      await input.startCamera();
      input.beginCalibration();
      status('Stand still in view for 1.5 s to calibrate.');
    } catch (err) {
      status(`Camera failed: ${err.message || err.name}`);
    }
  };
  panel.querySelector('[data-act=keyboard]').onclick = () => {
    input.useKeyboard();
    status('Keys: Space jump, W arms up, ←/→ step, S duck, A/D lean, 1/2/3 poses, nothing = freeze.');
  };
  panel.querySelector('[data-act=calibrate]').onclick = () => {
    input.beginCalibration();
    status('Calibrating: stand still in view for 1.5 s.');
  };
  panel.querySelector('[data-act=record]').onclick = async () => {
    if (input.mode !== 'camera') return status('Start the camera first.');
    status('Recording 10 s… move through every move.');
    const rec = await input.record(10);
    const blob = new Blob([JSON.stringify(rec)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astra-moves-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    status(`Saved ${rec.frames.length} frames.`);
  };
  panel.querySelector('.mv-file input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const rec = JSON.parse(await file.text());
    input.playRecording(rec, { loop: true });
    status(`Replaying ${file.name} (${rec.frames.length} frames, looping).`);
  };

  // Sliders, under the existing ?debug panel.
  const folder = gui.addFolder('Moves');
  folder.add(input.tune, 'duckDrop', 0.05, 0.4, 0.01).name('Duck drop (torso)').listen();
  folder.add(input.tune, 'duckHold', 0, 0.5, 0.01).name('Duck hold (s)').listen();
  folder.add(input.tune, 'leanDeg', 5, 35, 1).name('Lean angle (°)').listen();
  folder.add(input.tune, 'freezeK', 1, 8, 0.1).name('Freeze k × jitter').listen();
  folder.add({ reset: () => Object.assign(input.tune, TUNE_DEFAULTS[age()]) }, 'reset').name('Reset to age defaults');
  folder.add({
    copy: () => {
      const text = JSON.stringify({ age: age(), ...input.tune }, null, 2);
      navigator.clipboard?.writeText(text).then(() => status('Values copied.'), () => status(text));
    },
  }, 'copy').name('Copy values');

  let lastJumps = input.jumps;
  let jumpFlash = 0;
  let renderFps = 60;

  // Call once per frame.
  return function update(dt) {
    $('#mv-mode').textContent = input.mode ?? 'no input yet';
    if (input.mode) input.drawPreview($('#mv-cam'), { zones: true, guides: true });
    if (input.jumps !== lastJumps) {
      lastJumps = input.jumps;
      jumpFlash = 0.4;
    }
    jumpFlash = Math.max(0, jumpFlash - dt);
    if (dt > 0) renderFps += (1 / dt - renderFps) * (1 - Math.exp(-dt / 1));
    const d = input.debug;
    const freezeHold = { little: 2, big: 3 }[age()];
    set('tracking', input.tracking, input.mode === 'replay' && input.replayDone ? 'replay ended' : input.tracking ? '' : input.debug.why);
    set('zone', input.zone !== 'center', input.zone);
    set('jump', jumpFlash > 0, `${input.jumps} total`);
    set('arms', input.armsUp, input.armsUp ? 'up' : input.armsDown ? 'down' : 'mid');
    set('pose', input.pose, input.pose ?? '');
    set('duck', input.duck, input.camera ? `drop ${(d.drop * 100).toFixed(0)}% / ${(input.tune.duckDrop * 100).toFixed(0)}%` : '');
    set('lean', input.lean, input.camera ? `${input.lean ?? ''} ${d.leanAngle.toFixed(0)}°` : (input.lean ?? ''));
    set('still', input.stillFor >= freezeHold, input.camera
      ? `${input.stillFor.toFixed(1)} s · ${d.speed.toFixed(2)} < ${d.stillBelow.toFixed(2)}`
      : `${input.stillFor.toFixed(1)} s`);
    // Body tracking needs ~20+ frames a second to catch a jump; below that, warn.
    const bodyFps = input.camera ? input.debug.fps : null;
    set('speed', bodyFps !== null && bodyFps < 15, `game ${renderFps.toFixed(0)} fps${bodyFps !== null ? ` · body ${bodyFps.toFixed(0)} fps${bodyFps < 15 ? ' (too slow!)' : ''}` : ''}`);
    set('baseline', input.calibrated && !input.calibrating, input.calibrating ? 'calibrating…' : input.calibrated ? `jitter ${(d.jitter ?? 0).toFixed(3)}` : 'none');
  };
}
