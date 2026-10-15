// Chapter 1 · the story moments inside the movement games (the Star Stone Run on the Sky River,
// Sky Power above the clouds). Only the start, the bridges and the finish stop for dialogue;
// lines during a run are short barks spoken over the action (see each runner's `text`).
// Kept free of three.js so the headless tests can load the chapter's activities.

import { sfx } from '../../core/audio.js';
import { LINES } from './lines.js';

const R = LINES.starStoneRun;
const P = LINES.skyPower;
const say = (g, [who, text, opts]) => g.ui.say(who, text, opts);

// ---- Star Stone Run ------------------------------------------------------------------

// Poppy lands on the river; Nutty floats away ahead on a stone, calling back.
export async function starStoneStart(g, stage, { hero }) {
  hero.state = 'idle';
  const away = stage.river.nuttyAhead(g);
  for (const line of R.start) await say(g, line);
  g.ui.hideDialogue();
  await away;
}

// After bridges 1 and 2: Nutty's stone drifts on down the river.
export async function nuttyDriftsOn(g, stage, props) {
  g.ui.bark(stage.cast.nutty, R.further, 2.2, { voice: true });
  await props.nuttyAway(g);
}

// The last bridge: one big hop across to land beside Nutty.
export async function poppyLeapsToNutty(g, stage, props, hero) {
  const nutty = stage.cast.nutty;
  sfx.jump();
  await hero.hop(props.landing, 1.8, 0.8);
  sfx.land();
  hero.faceNow(nutty.x, nutty.z);
  nutty.faceNow(hero.x, hero.z);
}

// Nutty gets his buns back. Behind them the bridge drifts away, so they are both stuck.
export async function starStoneEnd(g, stage, { hero }) {
  const nutty = stage.cast.nutty;
  await stage.river.endShot(g);
  hero.state = 'cheer';
  nutty.state = 'cheer';
  await stage.river.bunsTo(g, hero, nutty);
  nutty.state = 'eat';
  await say(g, R.found);
  hero.state = 'idle';
  const drift = stage.river.driftAway(g);
  nutty.state = 'scared';
  await say(g, R.drift);
  await drift;
  g.ui.hideDialogue();
}

// Keep going (endless): Nutty waits off-stage while Poppy runs on.
export function starStoneResume(g, stage) {
  stage.river.resetForRun();
}

// ---- Sky Power -------------------------------------------------------------------------

// The dish lifts off through the clouds with Lumi and Poppy on it.
export async function skyPowerStart(g, stage) {
  const rise = stage.sky.liftOff(g);
  for (const line of P.start) await say(g, line);
  g.ui.hideDialogue();
  await rise;
}

// The beam shoots across the sky to the gate.
export async function skyPowerEnd(g, stage) {
  stage.sky.cast.lumi.state = 'cheer';
  stage.sky.cast.poppy.state = 'cheer';
  const beam = stage.sky.beamToGate(g);
  await say(g, P.fire);
  await beam;
  g.ui.hideDialogue();
}
