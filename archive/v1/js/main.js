import { MotionInput } from './input.js';
import { BubbleHop } from './games/hop.js';
import { FreezeDance } from './games/freeze.js';
import { W, H, COLORS, drawStarSquare } from './draw.js';
import { audio } from './audio.js';

const GAMES = { hop: BubbleHop, freeze: FreezeDance };

const $ = sel => document.querySelector(sel);
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const input = new MotionInput($('#cam'));

let age = 'little';
let game = null;
let gameId = null;
let resultsShown = false;
let lostFor = 0;
let paused = false;

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

// ---- Screens ---------------------------------------------------------------

for (const chip of document.querySelectorAll('[data-age]')) {
  chip.addEventListener('click', () => {
    age = chip.dataset.age;
    for (const c of document.querySelectorAll('[data-age]')) c.classList.toggle('on', c === chip);
  });
}

$('#btn-camera').addEventListener('click', async () => {
  const btn = $('#btn-camera');
  const status = $('#start-status');
  audio();
  if (input.camera) return goPick();
  btn.disabled = true;
  status.className = 'status';
  status.textContent = 'Waking up the camera…';
  try {
    await input.startCamera();
    $('#preview').hidden = false;
    status.textContent = '';
    goPick();
  } catch (err) {
    status.className = 'status error';
    status.textContent = `The camera didn't start (${err.message || err.name}). You can still play with the keyboard.`;
  } finally {
    btn.disabled = false;
  }
});

$('#btn-keys').addEventListener('click', () => {
  audio();
  goPick();
});

$('#btn-back').addEventListener('click', () => show('screen-start'));

for (const card of document.querySelectorAll('[data-game]')) {
  card.addEventListener('click', () => startGame(card.dataset.game));
}

$('#btn-again').addEventListener('click', () => startGame(gameId));
$('#btn-menu').addEventListener('click', quitGame);
$('#btn-quit').addEventListener('click', quitGame);
addEventListener('keydown', e => {
  if (e.key === 'Escape' && game && !resultsShown) quitGame();
});

function goPick() {
  $('#controls-hint').textContent = input.camera
    ? 'Jump for real to hop. Dance with your whole body. (Space bar works too.)'
    : 'Keyboard: Space to jump. Hold ← or → (or wiggle the mouse) to dance, let go to freeze.';
  show('screen-pick');
}

function startGame(id) {
  game?.dispose();
  input.setAge(age);
  input.consumeJump();
  gameId = id;
  game = new GAMES[id](age);
  resultsShown = false;
  lostFor = 0;
  setPaused(false);
  show(null);
  $('#btn-quit').hidden = false;
}

function quitGame() {
  game?.dispose();
  game = null;
  setPaused(false);
  $('#btn-quit').hidden = true;
  goPick();
}

function showResults(r) {
  resultsShown = true;
  game.dispose();
  setPaused(false);
  $('#btn-quit').hidden = true;
  $('#results-title').textContent = r.title;
  $('#results-stars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= r.stars ? 'lit' : ''}">★</span>`).join('');
  $('#results-stars').setAttribute('aria-label', `${r.stars} of 3 stars`);
  $('#results-lines').innerHTML = r.lines.map(l => `<li>${l}</li>`).join('');
  $('#results-message').textContent = r.message;
  show('screen-results');
}

// Pause when the camera loses the child, so stepping out of frame never costs anything.
function setPaused(p) {
  if (p === paused) return;
  paused = p;
  $('#lost-banner').hidden = !p;
  game?.onPause?.(p);
}

// ---- Rendering -------------------------------------------------------------

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);

  const active = game && !resultsShown;
  lostFor = active && input.camera && !input.tracking ? lostFor + dt : 0;
  setPaused(lostFor > 0.6);

  // Letterbox the 1280x720 world into the window.
  const scale = Math.min(canvas.width / W, canvas.height / H);
  const ox = (canvas.width - W * scale) / 2;
  const oy = (canvas.height - H * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  if (game) {
    if (active && !paused) game.update(dt, input);
    else input.consumeJump();
    game.draw(ctx);
    if (game.done && !resultsShown) showResults(game.result);
  } else {
    drawStarSquare(ctx, now / 1000);
  }
  ctx.restore();

  if (input.camera) input.drawPreview($('#preview-canvas'), $('#track-chip'));
  requestAnimationFrame(frame);
}

document.fonts.ready.finally(() => requestAnimationFrame(frame));
