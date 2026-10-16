// The rules of a set piece, with no 3D: a list of steps played in order, each one a big move.
// set-piece.js draws it in a stage; the headless test (tools/test-set-piece.mjs) plays it with
// scripted input. Each update reads the child's input for one frame and adds events to `events`.
//
// A step:
//   { move: 'jump',   times: 3 }                      jump N times
//   { move: 'armsUp', hold: 1.4 }                     both arms up, held
//   { move: 'step',   sequence: ['left', 'right'] }   stand in that third of the picture
//   { move: 'pump',   times: 5 }                      arms up, then down, N times
//   { move: 'pose',   sequence: ['star'], hold: 1 }   copy each pose and hold it
//   { move: 'tilt',   sequence: ['left', 'right'] }  arms out like wings, tipped to that side
// Any number can differ by age: times: { little: 3, big: 5 }. Also: text, does (what it moves
// in the stage), done (a buddy line when the step is finished).
//
// Before each step counts, the child must come back to neutral (arms down, middle, no pose),
// so a move held from the step before can't fill the next one. Help comes from time WITHOUT
// progress: a buddy shows the move at 12 s, and at 25 s either "Poppy can't see you" (when
// tracking is poor) or what is left gets halved. A step never completes by itself.

import { holdMeter, pumpCounter, zoneFollower, isNeutral } from './moves.js';

export const HELP = { demo: 12, ease: 25, poorTracking: 0.3 };
export const READY = { min: 0.6, neutral: 0.3 };
const DEFAULTS = { jump: { times: 3 }, pump: { times: 5 }, armsUp: { hold: 1.4 }, step: { hold: 0.6, sequence: ['left', 'right'] }, pose: { hold: 1, sequence: ['star'] }, tilt: { hold: 0.8, sequence: ['left', 'right'] } };
const TILT_ON = 0.5; // wings tilted at least this far (of a full turn) count as "to that side"
const CENTER_HOLD = 0.3; // seconds back in the middle between two sides (as in side-step)
const PROGRESS_STEP = 0.02; // a hold has to grow by this much past its best to count as progress

export function createSetPieceSim({ steps, age = 'little' }) {
  const byAge = v => (v && typeof v === 'object' && !Array.isArray(v) && ('little' in v || 'big' in v) ? v[age] : v);
  const resolve = s => {
    const d = DEFAULTS[s.move];
    if (!d) throw new Error(`Set piece: unknown move "${s.move}"`);
    const r = { ...s };
    for (const k of ['times', 'hold', 'sequence']) r[k] = byAge(s[k]) ?? d[k];
    if (s.move === 'pose' && s.pose && !s.sequence) r.sequence = [byAge(s.pose)];
    if (r.sequence) r.sequence = [...r.sequence];
    return r;
  };

  const sim = {
    steps: steps.map(resolve),
    index: 0,
    phase: 'ready', // 'ready' | 'move' | 'done'
    events: [],
    progress: 0, // of the current step, 0..1
    readyK: 0, // how far through the ready beat
    aim: 0, // -1..1, follows the child (step moves)
    want: { move: 'neutral' }, // what the child should do now (for the coach and the bot)
    stall: 0, // seconds without progress
    get step() { return sim.steps[sim.index] ?? null; },
    get count() { return st?.count ?? 0; }, // jumps or pumps so far in this step
    get need() { return st?.need ?? 0; }, // how many this step needs (help can lower it)
  };

  const follower = zoneFollower(0);
  let st = null; // the running step's state
  let readyT = 0, neutralT = 0, readyHintAt = HELP.demo;
  let best = 0, untracked = 0, demoGiven = false;
  let n = 0; // count sounds in this step (they rise in pitch)

  const emit = e => sim.events.push(e);

  function enterReady() {
    sim.phase = 'ready';
    sim.want = { move: 'neutral' };
    readyT = neutralT = 0;
    readyHintAt = HELP.demo;
    sim.readyK = 0;
    emit({ type: 'ready', step: sim.step, index: sim.index });
  }

  function startStep() {
    const s = sim.step;
    sim.phase = 'move';
    sim.progress = 0;
    best = 0;
    sim.stall = untracked = 0;
    demoGiven = false;
    n = 0;
    st = { count: 0, need: s.times, item: 0, center: false, quarter: 0 };
    if (s.move === 'armsUp') st.meter = holdMeter(s.hold, { drain: 1 });
    if (s.move === 'pump') st.pump = pumpCounter();
    if (s.move === 'step' || s.move === 'pose' || s.move === 'tilt') st.meter = holdMeter(s.hold);
    setWant();
    emit({ type: 'go', step: s, index: sim.index });
    if (s.move === 'step' || s.move === 'pose' || s.move === 'tilt') emit({ type: 'item', step: s, item: s.sequence[0], center: false });
  }

  function setWant() {
    const s = sim.step;
    if (s.move === 'step') sim.want = { move: 'step', side: st.center ? 'center' : s.sequence[st.item] };
    else if (s.move === 'tilt') sim.want = { move: 'tilt', side: s.sequence[st.item] };
    else if (s.move === 'pose') sim.want = { move: 'pose', pose: s.sequence[st.item] };
    else sim.want = { move: s.move };
  }

  function count() {
    emit({ type: 'count', n: n++, step: sim.step });
  }

  function finishStep() {
    sim.progress = 1;
    emit({ type: 'stepDone', step: sim.step, index: sim.index });
    sim.index++;
    st = null;
    if (sim.index >= sim.steps.length) {
      sim.phase = 'done';
      sim.want = { move: 'neutral' };
      emit({ type: 'done' });
    } else {
      enterReady();
    }
  }

  // Help for a child who is stuck: make what is left smaller, never zero.
  function ease() {
    const s = sim.step;
    if (s.move === 'jump' || s.move === 'pump') {
      st.need = st.count + Math.max(1, Math.ceil((st.need - st.count) / 2));
    } else if (s.move === 'armsUp') {
      st.meter.shorten(0.5);
    } else {
      const left = s.sequence.length - st.item;
      const keep = Math.max(1, Math.ceil(left / 2));
      const before = s.sequence[st.item];
      s.sequence = s.sequence.slice(0, st.item).concat(s.sequence.slice(s.sequence.length - keep));
      if (s.sequence[st.item] !== before) {
        st.meter.reset();
        st.quarter = 0;
        setWant();
        emit({ type: 'item', step: s, item: s.sequence[st.item], center: st.center });
      } else if (!st.center) {
        st.meter.shorten(0.5);
      }
    }
    emit({ type: 'ease', step: s });
  }

  // Quarter ticks while a hold fills (rising sounds), first time each quarter is reached.
  function quarters(k) {
    const q = Math.min(3, Math.floor(k * 4));
    while (st.quarter < q) {
      st.quarter++;
      count();
    }
  }

  function updateMove(input, dt) {
    const s = sim.step;
    switch (s.move) {
      case 'jump':
        if (input.jump) {
          st.count++;
          count();
        }
        sim.progress = st.count / st.need;
        if (st.count >= st.need) return finishStep();
        break;
      case 'pump':
        if (st.pump.update(input)) {
          st.count++;
          count();
        }
        sim.progress = st.count / st.need;
        if (st.count >= st.need) return finishStep();
        break;
      case 'armsUp':
        st.meter.update(!!input.armsUp, dt);
        quarters(st.meter.k);
        sim.progress = Math.min(1, st.meter.k);
        if (st.meter.done) return finishStep();
        break;
      case 'tilt': {
        // Wings tilted to the side asked (like a plane banking), held a moment; no middle step
        // between sides (going from one side to the other passes through level anyway).
        const side = s.sequence[st.item];
        const tilt = input.wingsOut === false ? 0 : input.wingsTilt ?? 0;
        st.meter.update(side === 'left' ? tilt < -TILT_ON : tilt > TILT_ON, dt);
        if (st.meter.done) {
          st.item++;
          count();
          if (st.item >= s.sequence.length) {
            sim.progress = 1;
            return finishStep();
          }
          st.meter = holdMeter(s.hold);
          setWant();
          emit({ type: 'item', step: s, item: s.sequence[st.item], center: false });
        }
        sim.progress = Math.min(1, (st.item + Math.min(1, st.meter.k)) / s.sequence.length);
        break;
      }
      case 'step':
      case 'pose': {
        const len = s.sequence.length;
        if (s.move === 'step' && st.center) {
          // Back to the middle before the next side (only counts once they are there).
          st.meter.update(input.zone === 'center', dt);
          if (st.meter.done) {
            st.center = false;
            st.meter = holdMeter(s.hold);
            setWant();
            emit({ type: 'item', step: s, item: s.sequence[st.item], center: false });
          }
        } else {
          const target = s.sequence[st.item];
          const on = s.move === 'step' ? input.zone === target : input.pose === target;
          st.meter.update(on, dt);
          if (s.move === 'pose') quarters(st.meter.k);
          if (st.meter.done) {
            st.item++;
            st.quarter = 0;
            count();
            if (st.item >= len) {
              sim.progress = 1;
              return finishStep();
            }
            if (s.move === 'step' && input.zone !== 'center') {
              st.center = true;
              st.meter = holdMeter(CENTER_HOLD);
            } else {
              st.meter = holdMeter(s.hold);
            }
            setWant();
            emit({ type: 'item', step: s, item: st.center ? 'center' : s.sequence[st.item], center: st.center });
          }
        }
        const k = st.center ? 0 : Math.min(1, st.meter.k);
        sim.progress = Math.min(1, (st.item + k) / s.sequence.length);
        break;
      }
    }

    // Help, from time without progress.
    if (sim.progress > best + PROGRESS_STEP) {
      best = sim.progress;
      sim.stall = untracked = 0;
      demoGiven = false;
      return;
    }
    sim.stall += dt;
    if (!input.tracking) untracked += dt;
    if (sim.stall >= HELP.demo && !demoGiven) {
      demoGiven = true;
      emit({ type: 'demo', step: s, want: sim.want });
    }
    if (sim.stall >= HELP.ease) {
      if (untracked / sim.stall > HELP.poorTracking) emit({ type: 'cantSee', step: s });
      else ease();
      sim.stall = untracked = 0;
      demoGiven = false;
      best = sim.progress;
    }
  }

  sim.update = (input, dt) => {
    if (sim.phase === 'done') return;
    // What the scene follows: the wings' tilt in a tilt step, else which third the child is in.
    const tiltStep = sim.step?.move === 'tilt';
    sim.aim = tiltStep ? (sim.aim + ((input.wingsTilt ?? 0) - sim.aim) * (1 - Math.exp(-dt / 0.15))) : follower.update(input.zone ?? 'center', dt);
    if (sim.phase === 'ready') {
      readyT += dt;
      // Ready for a tilt step = wings level (arms may stay out); else the usual neutral.
      const ready = tiltStep ? Math.abs(input.wingsTilt ?? 0) < 0.3 && !input.armsUp && !input.duck : isNeutral(input);
      neutralT = ready ? neutralT + dt : 0;
      sim.readyK = Math.min(1, Math.min(readyT / READY.min, neutralT / READY.neutral));
      if (readyT >= readyHintAt) {
        readyHintAt += HELP.demo;
        emit({ type: 'readyHint' });
      }
      if (readyT >= READY.min && neutralT >= READY.neutral) startStep();
      return; // jumps and moves made while getting ready never count
    }
    updateMove(input, dt);
  };

  // Skip: every remaining step straight to its end state.
  sim.finishAll = () => {
    while (sim.phase !== 'done') {
      if (sim.phase === 'ready') startStep();
      finishStep();
    }
  };

  enterReady();
  return sim;
}

// The test bot: does whatever the set piece asks, a little after it asks, like a keen child
// on the keyboard. Returns the input for one frame each time it is called. `delay` is how long
// it takes to react to a new ask; `pace` stretches its jumps and pumps (2 = half as fast).
export function createSetPieceBot(sim, { delay = 0.4, pace = 1 } = {}) {
  let t = 0, since = 0, lastKey = '';
  return (dt = 1 / 60) => {
    t += dt;
    const w = sim.want;
    const key = `${sim.phase}:${sim.index}:${w.move}:${w.side ?? ''}:${w.pose ?? ''}`;
    if (key !== lastKey) {
      lastKey = key;
      since = 0;
    }
    since += dt;
    const input = { zone: 'center', armsUp: false, armsDown: true, pose: null, duck: false, tracking: true, jump: false };
    if (sim.phase !== 'move' || since < delay) return input;
    switch (w.move) {
      case 'jump':
        input.jump = Math.floor((since - delay) / (0.5 * pace)) !== Math.floor((since - delay - dt) / (0.5 * pace));
        break;
      case 'pump': {
        const up = Math.floor((since - delay) / (0.35 * pace)) % 2 === 0;
        input.armsUp = up;
        input.armsDown = !up;
        input.pose = up ? 'star' : null;
        break;
      }
      case 'armsUp':
        input.armsUp = true;
        input.armsDown = false;
        input.pose = 'star';
        break;
      case 'step':
        input.zone = w.side;
        break;
      case 'tilt':
        input.wingsOut = true;
        input.wingsTilt = w.side === 'left' ? -1 : 1;
        break;
      case 'pose':
        input.pose = w.pose;
        input.armsUp = w.pose === 'star';
        input.armsDown = false;
        break;
    }
    return input;
  };
}
