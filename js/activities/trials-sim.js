// The rules of Gate Trials, with no 3D: rounds of "copy me" cards. trials.js draws it in a
// stage; the headless tests (tools/test-trials.mjs, test-games.mjs) play it with scripted input.
//
// A card goes: ready (back to neutral, so a held move can't carry over) → demo (Mimi shows it)
// → window (the child copies it) → hit or miss. Window time only runs while the body is
// tracked, so losing tracking pauses a card and never passes it.
//
// Card types:
//   jump    Little 1 jump; Big 2–3 jumps, counted in the window (not on the beat)
//   squat   Little hold 0.6 s; Big hold 1 s, or 3 quick squats
//   lean    Little either side; Big the side shown (the child's own side)
//   freeze  hold still (Little 2 s, Big 3 s; Big dances a moment first). Never judged as a
//           miss for moving during the dance part; stillness only counts while tracked
//   step    Little the side shown; Big 2–3 sides in a row
//   reach   Little arms up, hold 1 s; Big arms up then down, ×3
//   pose    Little one pose; Big two poses in a row
//   dance   free dance, 6–8 s, never judged, always a hit
//   choice  "Mimi's choice": a random type already taught
//
// Help: after 3 misses in a row, the next card's window is doubled and Mimi demos it twice
// (event 'struggle', with trackingPoor when tracking was weak). The first time a type
// appears its window is doubled too.

import { holdMeter, pumpCounter, isNeutral } from './moves.js';
import { mulberry32 } from './runner-sim.js';

export const TRIAL_DEFAULTS = {
  little: { window: 3.5, demo: 1.1, poseHold: 0.8, freeze: 2, squatHold: 0.6, reachHold: 1 },
  big: { window: 2.2, demo: 0.8, poseHold: 1.3, freeze: 3, squatHold: 1, reachHold: 1 },
};
const READY = { min: 0.2, neutral: 0.2 };
const SIDE_HOLD = 0.4; // seconds in a third of the picture to count a step
const DANCE_BURST = 2; // Big freeze: seconds of dancing before "Freeze!"
const STILL_FROM = 0.15; // stillFor above this = holding still this frame
const POSES = ['star', 'bridge', 'moon'];
const SIDES = ['left', 'right'];
const JUDGED = ['jump', 'squat', 'lean', 'freeze', 'step', 'reach', 'pose'];

// config: { rounds: [{ cards: [types] }], age, seed, tune: { window, demo, ... }, windowScale: [per round] }
export function createTrialsSim(config) {
  const age = config.age ?? 'little';
  const big = age === 'big';
  const T = { ...TRIAL_DEFAULTS[age], ...config.tune };
  const rng = mulberry32(config.seed ?? 1);
  const pick = list => list[Math.floor(rng() * list.length)];
  const rounds = config.rounds;

  const sim = {
    round: 0, index: 0, // card index in the round
    phase: 'ready', // 'ready' | 'demo' | 'window' | 'roundEnd' | 'done'
    card: null, // the card now: { type, ... }
    events: [],
    endless: false,
    stats: { hits: 0, misses: 0, dances: 0, combo: 0, bestCombo: 0, score: 0, tiles: [] },
    progress: 0, // of the current card's move, 0..1
    timeLeft: 0, // in the window (seconds)
    get item() { return st?.item ?? 0; }, // which side or pose of the card the child is on
    get judged() { return sim.stats.hits + sim.stats.misses; },
    get hitRate() { return sim.judged ? sim.stats.hits / sim.judged : 1; },
    get multiplier() { return big ? 1 + Math.min(4, Math.floor(sim.stats.combo / 3)) * 0.5 : 1; },
  };
  rounds.forEach((r, i) => { sim.stats.tiles[i] = r.cards.map(() => false); });

  const seen = new Set();
  const taught = new Set();
  let missesInRow = 0, struggling = false;
  let readyT = 0, neutralT = 0, phaseT = 0, demoReps = 1;
  let st = null; // the running card's state
  let trackedFrames = 0, frames = 0; // tracking quality over the recent cards
  const emit = e => sim.events.push(e);

  const roundCards = () => (sim.round < rounds.length ? rounds[sim.round].cards : endlessCards());
  let endlessList = null;
  function endlessCards() {
    // Endless: mixed rounds of 8 (5 active, freeze, choice, dance), each a little faster.
    if (!endlessList || endlessList.round !== sim.round) {
      const active = Array.from({ length: 5 }, () => pick(JUDGED.filter(t => t !== 'freeze')));
      endlessList = { round: sim.round, cards: [...active, 'freeze', 'choice', 'dance'] };
    }
    return endlessList.cards;
  }
  const windowScale = () => {
    if (sim.round < rounds.length) return config.windowScale?.[sim.round] ?? 1;
    return Math.max(0.6, (config.windowScale?.at(-1) ?? 1) * 0.95 ** (sim.round - rounds.length + 1));
  };

  // Make the card: what exactly the child must do this time.
  function makeCard(type) {
    if (type === 'choice') type = pick([...taught].filter(t => JUDGED.includes(t) && t !== 'freeze')) ?? 'jump';
    const c = { type };
    if (type === 'jump') c.need = big ? 2 + Math.floor(rng() * 2) : 1;
    if (type === 'squat') {
      c.variant = big && rng() < 0.5 ? 'quick' : 'hold';
      c.need = c.variant === 'quick' ? 3 : 1;
      c.hold = T.squatHold;
    }
    if (type === 'lean') c.side = big ? pick(SIDES) : null; // null: either side
    if (type === 'freeze') c.hold = T.freeze;
    if (type === 'step') {
      const n = big ? 2 + Math.floor(rng() * 2) : 1;
      c.sides = [];
      for (let i = 0; i < n; i++) c.sides.push(i === 0 ? pick(SIDES) : c.sides[i - 1] === 'left' ? 'right' : 'left');
    }
    if (type === 'reach') {
      c.variant = big ? 'pumps' : 'hold';
      c.need = big ? 3 : 1;
      c.hold = T.reachHold;
    }
    if (type === 'pose') {
      c.poses = big ? [pick(POSES), null] : [pick(POSES)];
      if (big) c.poses[1] = pick(POSES.filter(p => p !== c.poses[0]));
      c.hold = T.poseHold;
    }
    if (type === 'dance') c.seconds = 6 + Math.floor(rng() * 3);
    let win = T.window * windowScale();
    if (type === 'freeze') win = Math.max(win, c.hold + 2) + (big ? DANCE_BURST : 0);
    if (type === 'step' || type === 'pose' || type === 'reach') win += (c.sides?.length ?? c.poses?.length ?? c.need ?? 1) * 0.8;
    if (type === 'jump') win += (c.need - 1) * 0.6;
    if (type === 'squat') win += c.variant === 'quick' ? 1.5 : c.hold;
    if (!seen.has(type)) win *= 2; // first time: twice as long
    if (struggling) win *= 2;
    c.window = type === 'dance' ? c.seconds : win;
    c.first = !seen.has(type);
    // Mimi's demo: longer for cards with several parts, so she can show all of them.
    const parts = c.sides?.length ?? c.poses?.length ?? (type === 'jump' || c.variant === 'quick' || c.variant === 'pumps' ? c.need : 1);
    c.demo = T.demo + (parts - 1) * 0.4;
    return c;
  }

  function startCard() {
    const type = roundCards()[sim.index];
    sim.card = makeCard(type);
    sim.phase = 'ready';
    sim.progress = 0;
    readyT = neutralT = 0;
    demoReps = struggling ? 2 : 1;
    emit({ type: 'card', card: sim.card, round: sim.round, index: sim.index, struggling });
  }

  function startDemo() {
    sim.phase = 'demo';
    phaseT = 0;
    emit({ type: 'demo', card: sim.card, reps: demoReps });
  }

  function startWindow() {
    const c = sim.card;
    sim.phase = 'window';
    sim.timeLeft = c.window;
    st = { count: 0, item: 0, meter: null, pump: pumpCounter(), wasDuck: false, burst: c.type === 'freeze' && big ? DANCE_BURST : 0 };
    if (c.type === 'squat' && c.variant === 'hold') st.meter = holdMeter(c.hold);
    if (c.type === 'reach' && c.variant === 'hold') st.meter = holdMeter(c.hold);
    if (c.type === 'pose') st.meter = holdMeter(c.hold);
    if (c.type === 'step') st.meter = holdMeter(SIDE_HOLD, { drain: 3 });
    if (c.type === 'freeze') st.still = 0;
    emit({ type: 'go', card: c });
  }

  function finishCard(hit) {
    const c = sim.card;
    seen.add(c.type);
    if (JUDGED.includes(c.type)) taught.add(c.type);
    const s = sim.stats;
    if (c.type === 'dance') {
      s.dances++;
    } else if (hit) {
      s.hits++;
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += Math.round(10 * sim.multiplier);
      missesInRow = 0;
      struggling = false;
    } else {
      s.misses++;
      s.combo = 0;
      missesInRow++;
    }
    const lit = c.type === 'dance' || hit;
    if (lit && sim.round < rounds.length) s.tiles[sim.round][sim.index] = true;
    // Three misses in a row: help on the next card.
    const help = !hit && c.type !== 'dance' && missesInRow >= 3;
    if (help) {
      struggling = true;
      missesInRow = 0;
    }
    emit({ type: hit || c.type === 'dance' ? 'hit' : 'miss', card: c, round: sim.round, index: sim.index, lit, combo: s.combo });
    if (help) emit({ type: 'struggle', trackingPoor: frames > 0 && trackedFrames / frames < 0.85 });
    trackedFrames = frames = 0;
    sim.index++;
    if (sim.index >= roundCards().length) {
      sim.phase = 'roundEnd';
      emit({ type: 'roundEnd', round: sim.round, tiles: sim.round < rounds.length ? [...s.tiles[sim.round]] : null });
    } else {
      startCard();
    }
  }

  // After the round's celebration (and lock), the engine calls this.
  sim.nextRound = () => {
    sim.round++;
    sim.index = 0;
    if (sim.round >= rounds.length && !sim.endless) {
      sim.phase = 'done';
      emit({ type: 'done' });
      return;
    }
    startCard();
  };
  sim.continueEndless = () => {
    sim.endless = true;
    sim.index = 0;
    startCard();
  };

  // One frame: input = { zone, jump, duck, lean, armsUp, armsDown, pose, stillFor, tracking }.
  sim.update = (input, dt) => {
    if (sim.phase === 'done' || sim.phase === 'roundEnd') return;
    frames++;
    if (input.tracking) trackedFrames++;

    if (sim.phase === 'ready') {
      readyT += dt;
      neutralT = isNeutral(input) || sim.card.type === 'dance' ? neutralT + dt : 0;
      if (readyT >= READY.min && neutralT >= READY.neutral) startDemo();
      return;
    }
    if (sim.phase === 'demo') {
      phaseT += dt;
      if (sim.card.type === 'dance' || phaseT >= sim.card.demo * demoReps) startWindow();
      return;
    }

    // The window: time only runs while the body is tracked.
    if (!input.tracking) return;
    const c = sim.card;
    sim.timeLeft -= dt;
    let done = false;
    switch (c.type) {
      case 'dance':
        sim.progress = 1 - sim.timeLeft / c.window;
        if (sim.timeLeft <= 0) return finishCard(true);
        return;
      case 'jump':
        if (input.jump) {
          st.count++;
          emit({ type: 'count', n: st.count });
        }
        sim.progress = st.count / c.need;
        done = st.count >= c.need;
        break;
      case 'squat':
        if (c.variant === 'quick') {
          if (input.duck && !st.wasDuck) {
            st.count++;
            emit({ type: 'count', n: st.count });
          }
          st.wasDuck = !!input.duck;
          sim.progress = st.count / c.need;
          done = st.count >= c.need;
        } else {
          st.meter.update(!!input.duck, dt);
          sim.progress = Math.min(1, st.meter.k);
          done = st.meter.done;
        }
        break;
      case 'lean':
        sim.progress = input.lean && (!c.side || input.lean === c.side) ? 1 : 0;
        done = sim.progress === 1;
        break;
      case 'freeze':
        if (st.burst > 0) {
          st.burst -= dt;
          sim.progress = 0;
          if (st.burst <= 0) emit({ type: 'freezeNow' });
          break;
        }
        st.still = (input.stillFor ?? 0) > STILL_FROM ? st.still + dt : 0;
        sim.progress = Math.min(1, st.still / c.hold);
        done = st.still >= c.hold;
        break;
      case 'step': {
        st.meter.update(input.zone === c.sides[st.item], dt);
        if (st.meter.done) {
          st.item++;
          emit({ type: 'count', n: st.item });
          st.meter = holdMeter(SIDE_HOLD, { drain: 3 });
        }
        sim.progress = Math.min(1, (st.item + Math.min(1, st.meter.k)) / c.sides.length);
        done = st.item >= c.sides.length;
        break;
      }
      case 'reach':
        if (c.variant === 'pumps') {
          if (st.pump.update(input)) {
            st.count++;
            emit({ type: 'count', n: st.count });
          }
          sim.progress = st.count / c.need;
          done = st.count >= c.need;
        } else {
          st.meter.update(!!input.armsUp, dt);
          sim.progress = Math.min(1, st.meter.k);
          done = st.meter.done;
        }
        break;
      case 'pose':
        st.meter.update(input.pose === c.poses[st.item], dt);
        if (st.meter.done) {
          st.item++;
          emit({ type: 'count', n: st.item });
          st.meter = holdMeter(c.hold);
        }
        sim.progress = Math.min(1, (st.item + Math.min(1, st.meter.k)) / c.poses.length);
        done = st.item >= c.poses.length;
        break;
    }
    if (done) finishCard(true);
    else if (sim.timeLeft <= 0) finishCard(false);
  };

  // 1 star for finishing, 2 for at least 60% of judged cards, 3 for at least 85%.
  sim.starsEarned = () => (sim.hitRate >= 0.85 ? 3 : sim.hitRate >= 0.6 ? 2 : 1);
  sim.skipAll = () => {
    sim.round = rounds.length;
    sim.phase = 'done';
  };

  startCard();
  return sim;
}

// The test bot: copies each card a little after the window opens, like a keen child on the
// keyboard. `delay` is its reaction time; `pace` stretches repeated moves; `miss` is the chance
// it ignores a card.
export function createTrialsBot(sim, { delay = 0.5, pace = 1, miss = 0, seed = 3 } = {}) {
  const rng = mulberry32(seed);
  let since = 0, key = '', skip = false;
  return (dt = 1 / 60) => {
    const c = sim.card;
    const k = `${sim.round}:${sim.index}:${sim.phase}`;
    if (k !== key) {
      key = k;
      since = 0;
      if (sim.phase === 'window') skip = rng() < miss;
    }
    since += dt;
    const input = { zone: 'center', jump: false, duck: false, lean: null, armsUp: false, armsDown: true, pose: null, stillFor: 0, tracking: true };
    if (sim.phase !== 'window' || !c || since < delay) {
      input.stillFor = sim.phase === 'window' ? 0 : 1;
      return input;
    }
    if (skip) return input;
    const t = since - delay;
    const tick = period => Math.floor(t / period) !== Math.floor((t - dt) / period);
    switch (c.type) {
      case 'dance':
        input.zone = Math.floor(t * 2) % 2 ? 'left' : 'right';
        break;
      case 'jump':
        input.jump = tick(0.5 * pace) || t < dt;
        break;
      case 'squat':
        input.duck = c.variant === 'quick' ? Math.floor(t / (0.35 * pace)) % 2 === 0 : true;
        break;
      case 'lean':
        input.lean = c.side ?? 'left';
        break;
      case 'freeze':
        input.stillFor = t; // still the whole time (the dance part before "Freeze!" doesn't judge)
        break;
      case 'step':
        input.zone = c.sides[Math.min(c.sides.length - 1, sim.item)];
        break;
      case 'reach':
        if (c.variant === 'pumps') {
          const up = Math.floor(t / (0.35 * pace)) % 2 === 0;
          input.armsUp = up;
          input.armsDown = !up;
          input.pose = up ? 'star' : null;
        } else {
          input.armsUp = true;
          input.armsDown = false;
          input.pose = 'star';
        }
        break;
      case 'pose': {
        const want = c.poses[Math.min(c.poses.length - 1, sim.item)];
        input.pose = want;
        input.armsUp = want === 'star';
        input.armsDown = false;
        break;
      }
    }
    return input;
  };
}
