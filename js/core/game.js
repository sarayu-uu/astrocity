// The shared game context every scene and activity receives as `g`.
// Time only moves on unpaused frames, so scenes and activities are written as plain async code:
//   await g.frame()       next frame        await g.wait(2)      two seconds
//   await g.tween(1, k)   animate k 0 -> 1  await g.untilSkip()  until Skip is pressed
// While `g.skipping` is on, time runs FAST_FORWARD times faster, lines and cards are skipped,
// and sound is muted. That is how Skip and "play from this scene" work without special cases.

import { mute, sfx } from './audio.js';

export const FAST_FORWARD = 40;

export function createGame({ scene, camera, W, B, input, ui, rig }) {
  let waiters = [];
  let skipWaiters = [];

  const g = {
    scene, camera, W, B, input, ui, rig,
    settings: { age: 'little' },
    dt: 0,
    needsBody: false,
    onPick: null,
    skipping: false,
    discovered: new Set(['square', 'gate']),
    onDiscover: () => {},

    get timeScale() { return g.skipping ? FAST_FORWARD : 1; },

    // Called by the main loop on every unpaused frame.
    tick(dt) {
      g.dt = dt;
      const ready = waiters;
      waiters = [];
      for (const r of ready) r(dt);
    },

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

    // Turn fast-forward on or off. Turning it on finishes the current line and wakes untilSkip().
    setSkipping(on) {
      g.skipping = on;
      mute(on);
      if (!on) return;
      ui.flush();
      const ready = skipWaiters;
      skipWaiters = [];
      for (const r of ready) r();
    },

    untilSkip() {
      return g.skipping ? Promise.resolve() : new Promise(r => skipWaiters.push(r));
    },

    // Asks camera or keyboard the first time a movement activity needs it, then checks the
    // child is in view.
    async ensureInput() {
      if (input.mode) return;
      for (;;) {
        const how = await ui.chooseInput();
        if (how === 'keyboard') {
          input.useKeyboard();
          return;
        }
        ui.setupStatus('Starting the camera…');
        try {
          await input.startCamera();
          break;
        } catch (err) {
          ui.setupStatus(`The camera didn't start (${err.message || err.name}). You can use the keyboard.`, true);
        }
      }
      ui.hideSetup();
      ui.coach('stand', 'Step back so Poppy can see you', 'Head to knees. Leave room to jump.');
      let seen = 0;
      while (seen < 1.5) {
        await g.frame();
        seen = input.tracking ? seen + g.dt : 0;
        ui.setCoachProgress(seen / 1.5);
      }
      ui.setCoachProgress(0);
      ui.coach('stand', 'Great! Poppy can see you.', '');
      sfx.chime();
      await g.wait(1.2);
    },

    discover(id) {
      g.discovered.add(id);
      g.onDiscover();
    },
  };

  ui.isSkipping = () => g.skipping;
  return g;
}
