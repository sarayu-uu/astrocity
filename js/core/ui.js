// The thin layer of interface on top of the world: subtitles-style dialogue, a place name,
// a quiet objective line, speech barks above characters, the move coach for camera play,
// and the story controls (skip, hear again, play again).

import * as THREE from 'three';
import { CAST } from '../world/buddies.js';
import { audio } from './audio.js';

const $ = s => document.querySelector(s);

const FIG = {
  stand: '<path d="M60 56 L38 92 M60 56 L82 92"/>',
  star: '<path d="M60 56 L30 16 M60 56 L90 16"/>',
  bridge: '<path d="M60 58 L10 58 M60 58 L110 58"/>',
  moon: '<path d="M60 56 L86 12 M60 56 L40 92"/>',
};

// A figure stepping sideways, with an arrow showing which way.
const STEP = {
  left: '<path class="arrow" d="M44 160 L8 160 M20 150 L8 160 L20 170"/>',
  right: '<path class="arrow" d="M76 160 L112 160 M100 150 L112 160 L100 170"/>',
  center: '<path class="arrow" d="M40 160 L80 160"/>',
};

export function figure(kind) {
  const legs = '<path d="M60 96 L44 146 M60 96 L76 146"/>';
  const core = '<circle cx="60" cy="27" r="14"/><path d="M60 42 L60 96"/>';
  if (kind === 'jump') {
    return `<svg viewBox="0 0 120 170" class="fig fig-jump"><g class="hop">${core}<path d="M60 56 L34 26 M60 56 L86 26"/>${legs}</g><path class="ground" d="M24 164 L96 164"/></svg>`;
  }
  if (kind === 'duck') {
    return `<svg viewBox="0 0 120 170" class="fig fig-duck"><circle cx="60" cy="78" r="14"/><path d="M60 93 L60 120 M60 100 L36 112 M60 100 L84 112 M60 120 L40 132 L46 156 M60 120 L80 132 L74 156"/><path class="ground" d="M24 164 L96 164"/></svg>`;
  }
  // Fly mode: arms down (fly low), and lean the way the wind blows.
  if (kind === 'down') {
    return `<svg viewBox="0 0 120 170" class="fig fig-down">${core}<path d="M60 56 L42 96 M60 56 L78 96"/>${legs}<path class="arrow" d="M100 40 L100 90 M90 78 L100 90 L110 78"/></svg>`;
  }
  if (kind === 'lean-left' || kind === 'lean-right') {
    const s = kind === 'lean-left' ? -1 : 1;
    return `<svg viewBox="0 0 120 170" class="fig fig-lean"><g transform="rotate(${s * 16} 60 146)">${core}${FIG.stand}</g>${legs}<path class="arrow" d="M${60 - s * 40} 14 L${60 + s * 40} 14 M${60 + s * 28} 4 L${60 + s * 40} 14 L${60 + s * 28} 24"/></svg>`;
  }
  if (kind === 'armsUp' || kind === 'up') kind = 'star';
  if (kind in STEP) {
    return `<svg viewBox="0 0 120 176" class="fig fig-step fig-step-${kind}"><g class="body">${core}${FIG.stand}${legs}</g>${STEP[kind]}</svg>`;
  }
  if (kind === 'pump') {
    return `<svg viewBox="0 0 120 170" class="fig fig-pump">${core}${legs}<g class="up">${FIG.star}</g><g class="down">${FIG.stand}</g></svg>`;
  }
  return `<svg viewBox="0 0 120 170" class="fig">${core}${FIG[kind] || FIG.stand}${legs}</svg>`;
}

export class UI {
  constructor() {
    this.voice = true;
    this.onSpeak = () => {};
    this.barks = [];
    this.preview = null; // camera preview options during an activity, e.g. { zones: true }
    this.isSkipping = () => false; // set by the game: true while a scene fast-forwards
    this.isCast = () => true; // set by the game: is this buddy in play (island vs stage)?
    this._advance = null;
    this._finish = null;
    this._typing = null;
    this._line = null;

    const dlg = $('#dialogue');
    dlg.addEventListener('click', () => this._next());
    $('#dlg-replay').addEventListener('click', e => {
      e.stopPropagation();
      if (this._line) this._speak(...this._line);
    });
    addEventListener('keydown', e => {
      if ((e.code === 'Enter' || e.code === 'Space') && !$('#dialogue').hidden && !$('#dlg-actions').childElementCount) {
        e.preventDefault();
        this._next();
      }
    });
  }

  // ---- Title -------------------------------------------------------------------

  // Resolves 'new' or 'continue'. Continue only shows when there's somewhere to continue to.
  title({ continueName = null } = {}) {
    const el = $('#title');
    el.hidden = false;
    $('#btn-continue').hidden = !continueName;
    $('#continue-name').textContent = continueName ?? '';
    $('#btn-enter').firstChild.textContent = continueName ? 'Start from the beginning ' : 'Start ';
    $('#btn-enter').classList.toggle('quiet', !!continueName);
    return new Promise(resolve => {
      const go = choice => {
        audio();
        el.classList.add('leaving');
        setTimeout(() => { el.hidden = true; }, 1200);
        resolve(choice);
      };
      $('#btn-enter').onclick = () => go('new');
      $('#btn-continue').onclick = () => go('continue');
    });
  }

  // Straight past the title (?step=… for testing).
  hideTitle() {
    $('#title').hidden = true;
    audio();
  }

  // ---- Framing ---------------------------------------------------------------

  cinematic(on) { document.body.classList.toggle('cinematic', on); }

  hud(on) { $('#hud').hidden = !on; }

  place(name, sub) {
    $('#place-name').textContent = name;
    $('#place-sub').textContent = sub || '';
    const el = $('#place');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  objective(text) {
    const el = $('#objective');
    el.hidden = !text;
    if (text) {
      $('#objective-text').textContent = text;
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }
  }

  // ---- Dialogue --------------------------------------------------------------

  // Resolves when the line is dismissed: with the chosen index when choices are given,
  // or on its own after `auto` seconds (used during movement play, so nobody needs a mouse).
  say(who, text, { choices = null, auto = null } = {}) {
    if (this.isSkipping()) return Promise.resolve(0);
    const P = who ? CAST[who] : null;
    this._line = [who, text];
    const dlg = $('#dialogue');
    dlg.hidden = false;
    dlg.classList.toggle('narration', !P);
    $('#dlg-name').textContent = P ? P.name : '';
    $('#dlg-name').style.color = P ? P.color : '';
    const body = $('#dlg-text');
    const actions = $('#dlg-actions');
    actions.innerHTML = '';
    $('#dlg-next').hidden = !!choices || auto !== null;

    this._speak(who, text);

    // Quick typewriter reveal; clicking finishes it instantly.
    body.textContent = '';
    let i = 0;
    clearInterval(this._typing);
    this._typing = setInterval(() => {
      i += 2;
      body.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(this._typing);
        this._typing = null;
      }
    }, 18);

    return new Promise(resolve => {
      const done = v => {
        clearInterval(this._typing);
        this._typing = null;
        this._advance = null;
        this._finish = null;
        clearTimeout(timer);
        this.onSpeak(who, false);
        resolve(v);
      };
      let timer = null;
      if (choices) {
        choices.forEach((label, idx) => {
          const b = document.createElement('button');
          b.className = 'choice';
          b.innerHTML = `<span>${label}</span><kbd>${idx === 0 ? '↵' : idx + 1}</kbd>`;
          b.addEventListener('click', e => { e.stopPropagation(); this.hideDialogue(); done(idx); });
          actions.appendChild(b);
          if (idx === 0) setTimeout(() => b.focus(), 50);
        });
      } else if (auto !== null) {
        timer = setTimeout(() => done(0), auto * 1000);
      }
      this._finish = () => { this.hideDialogue(); done(0); };
      this._advance = () => {
        if (this._typing) {
          clearInterval(this._typing);
          this._typing = null;
          body.textContent = text;
          return;
        }
        if (!choices && auto === null) done(0);
      };
    });
  }

  _next() { this._advance?.(); }

  // Ends whatever line is showing right away (used by Skip). A choice counts as the first one.
  flush() { this._finish?.(); }

  hideDialogue() {
    $('#dialogue').hidden = true;
    $('#dlg-actions').innerHTML = '';
    speechSynthesis?.cancel();
  }

  _speak(who, text) {
    this.onSpeak(who, true);
    if (!this.voice || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ', '));
    const v = who ? CAST[who].voice : { pitch: 1, rate: 0.95 };
    u.pitch = v.pitch;
    u.rate = v.rate;
    u.onend = () => this.onSpeak(who, false);
    speechSynthesis.speak(u);
  }

  // ---- In-world speech barks ---------------------------------------------------

  // A short line above a buddy's head. It never waits for anyone; { voice: true } also says it
  // aloud (lines during a run, spoken over the action).
  bark(buddy, text, duration = 1.8, { voice = false } = {}) {
    if (this.isSkipping()) return;
    if (voice) this._speak(buddy.kind, text);
    const el = document.createElement('div');
    el.className = 'bark';
    el.textContent = text;
    el.style.setProperty('--c', buddy.color);
    document.body.appendChild(el);
    this.barks.push({ el, buddy, until: performance.now() + duration * 1000 });
  }

  update(camera) {
    const v = new THREE.Vector3();
    const now = performance.now();
    this.barks = this.barks.filter(b => {
      if (now > b.until) {
        b.el.remove();
        return false;
      }
      b.buddy.root.getWorldPosition(v);
      v.y += 2.1;
      v.project(camera);
      b.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
      b.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
      // Barks belong to the world on screen: an island buddy's bark hides while a stage is open.
      b.el.hidden = v.z > 1 || !this.isCast(b.buddy);
      return true;
    });
  }

  tooltip(text, x, y) {
    const t = $('#tooltip');
    t.hidden = !text;
    if (!text) return;
    t.textContent = text;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    // Never sit on top of the place name / objective: drop below them instead.
    const hud = this._hudBox();
    const r = t.getBoundingClientRect();
    if (hud && r.left < hud.right && r.right > hud.left && r.top < hud.bottom && r.bottom > hud.top) {
      t.style.top = `${hud.bottom + 8}px`;
    }
  }

  // The screen box covered by the top-left HUD text, or null when it isn't showing.
  _hudBox() {
    if ($('#hud').hidden) return null;
    const boxes = ['#place', '#objective'].map(s => $(s)).filter(el => !el.hidden).map(el => el.getBoundingClientRect());
    if (!boxes.length) return null;
    return {
      left: Math.min(...boxes.map(b => b.left)) - 8,
      right: Math.max(...boxes.map(b => b.right)) + 8,
      top: Math.min(...boxes.map(b => b.top)) - 8,
      bottom: Math.max(...boxes.map(b => b.bottom)),
    };
  }

  // ---- Discovery moments -------------------------------------------------------

  async toast(kicker, title, seconds = 4.5) {
    if (this.isSkipping()) return;
    const el = $('#toast');
    el.querySelector('small').textContent = kicker;
    el.querySelector('strong').textContent = title;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    await new Promise(r => setTimeout(r, seconds * 1000));
    el.hidden = true;
  }

  async chapterCard(kicker, title) {
    if (this.isSkipping()) return;
    const el = $('#chapter');
    el.querySelector('small').textContent = kicker;
    el.querySelector('strong').textContent = title;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    await new Promise(r => setTimeout(r, 5200));
    el.hidden = true;
  }

  // ---- Move coach (camera setup + which move to make) ---------------------------

  // Shows the child's camera view next to the move they should make.
  coach(move, text, sub = '') {
    const el = $('#coach');
    el.hidden = false;
    $('#coach-fig').innerHTML = figure(move);
    $('#coach-text').textContent = text;
    $('#coach-sub').textContent = sub;
  }

  hideCoach() { $('#coach').hidden = true; }

  setCoachProgress(k) {
    const ring = $('#coach-ring');
    ring.style.setProperty('--k', String(Math.max(0, Math.min(1, k))));
    ring.hidden = k <= 0;
  }

  // Ask how the child will play; resolves 'camera' or 'keyboard'.
  chooseInput() {
    const el = $('#setup');
    el.hidden = false;
    $('#setup-status').textContent = '';
    return new Promise(resolve => {
      $('#setup-camera').onclick = () => resolve('camera');
      $('#setup-keys').onclick = () => { el.hidden = true; resolve('keyboard'); };
    });
  }

  setupStatus(text, isError = false) {
    const s = $('#setup-status');
    s.textContent = text;
    s.classList.toggle('error', isError);
  }

  hideSetup() { $('#setup').hidden = true; }

  lost(on) { $('#lost').hidden = !on; }

  // A big 3, 2, 1 before play picks up again; null hides it.
  countdown(n) {
    const el = $('#countdown');
    el.hidden = !n;
    if (n && el.textContent !== String(n)) {
      el.textContent = n;
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
    }
  }

  // The portal between the island and an activity stage: closes over the screen (on = true)
  // or opens again (false). A plain fade for anyone who prefers reduced motion.
  portal(on) {
    const el = $('#portal');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.classList.toggle('reduced', reduced);
    el.classList.toggle('closed', on);
    return new Promise(r => setTimeout(r, reduced ? 400 : 800));
  }

  // A big arrow at the side of the screen: where to step. null hides it.
  arrow(side) {
    const el = $('#arrow');
    el.hidden = !side;
    if (side) el.dataset.side = side;
  }

  // ---- Runner HUD -------------------------------------------------------------------

  // state: { progress (0..1, or null in endless), count, stars, endless, onStop } or null to hide.
  runHud(state) {
    const el = $('#run-hud');
    if (!state) {
      el.hidden = true;
      $('#run-stop').onclick = null;
      this._meterOn = false;
      $('#run-meter').hidden = true;
      return;
    }
    el.hidden = false;
    if (state.onStop) $('#run-stop').onclick = state.onStop;
    if (state.sparks !== undefined) $('#run-pill').classList.toggle('sparks', state.sparks); // a spark, not a bun
    if (state.endless !== undefined) el.classList.toggle('endless', state.endless);
    if (state.progress !== undefined) {
      $('#run-progress').hidden = state.progress === null;
      if (state.progress !== null) $('#run-fill').style.transform = `scaleX(${state.progress})`;
    }
    if (state.count !== undefined) $('#run-count').textContent = state.count;
    // A charge meter (Sky Power): 0..1, or absent for games without one.
    $('#run-meter').hidden = state.meter === undefined && !this._meterOn;
    if (state.meter !== undefined) {
      this._meterOn = true;
      $('#run-meter-fill').style.transform = `scaleY(${state.meter})`;
      $('#run-meter').classList.toggle('full', state.meter >= 1);
    }
    if (state.stars !== undefined) $('#run-stars').textContent = state.stars ? `★ ${state.stars}` : '';
  }

  // A big picture of the next move, about 1.5 s before it's needed. null hides it.
  moveCue(move) {
    const el = $('#cue');
    clearTimeout(this._cueTimer);
    if (!move) {
      el.hidden = true;
      return;
    }
    el.innerHTML = figure(move);
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this._cueTimer = setTimeout(() => { el.hidden = true; }, 1300);
  }

  breather(on) { $('#breather').hidden = !on; }

  // { title, stars, rows: [[label, value]], more } -> resolves 'more' (Keep going) or 'story'.
  runResult({ title, stars, rows, more }) {
    const el = $('#result');
    $('#result-title').textContent = title;
    $('#result-stars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
    $('#result-rows').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');
    $('#result-more').hidden = !more;
    el.hidden = false;
    return new Promise(resolve => {
      const done = choice => {
        el.hidden = true;
        removeEventListener('keydown', onKey);
        resolve(choice);
      };
      const onKey = e => {
        if (e.code === 'Enter') done('story');
        if (e.code === 'KeyK' && more) done('more');
      };
      addEventListener('keydown', onKey);
      $('#result-more').onclick = () => done('more');
      $('#result-story').onclick = () => done('story');
      setTimeout(() => (more ? $('#result-more') : $('#result-story')).focus(), 50);
    });
  }

  // ---- Story controls ------------------------------------------------------------

  // Shows the Skip button while `onSkip` is set; null hides it.
  skipButton(onSkip) {
    const b = $('#btn-skip');
    b.hidden = !onSkip;
    b.onclick = onSkip ? () => { b.hidden = true; onSkip(); } : null;
  }

  // Covers the screen while a scene fast-forwards, so nobody sees it zip past.
  curtain(on, text = '') {
    const el = $('#curtain');
    $('#curtain-text').textContent = text;
    el.classList.toggle('on', on);
  }

  // After an activity: "Keep going" (also after a few seconds on its own) or "Play again".
  activityDone(title, { again = true, seconds = 8 } = {}) {
    const el = $('#done');
    $('#done-title').textContent = title;
    $('#done-again').hidden = !again;
    el.hidden = false;
    const bar = $('#done-timer');
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = `drain ${seconds}s linear forwards`;
    return new Promise(resolve => {
      const finish = choice => {
        clearTimeout(timer);
        removeEventListener('keydown', onKey);
        el.hidden = true;
        resolve(choice);
      };
      const onKey = e => {
        if (e.code === 'Enter') finish('next');
        if (e.code === 'KeyR' && again) finish('again');
      };
      const timer = setTimeout(() => finish('next'), seconds * 1000);
      addEventListener('keydown', onKey);
      $('#done-next').onclick = () => finish('next');
      $('#done-again').onclick = () => finish('again');
      setTimeout(() => $('#done-next').focus(), 50);
    });
  }
}
