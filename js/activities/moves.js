// How a move is counted, shared by every engine: hold meters, pumps and following the body
// left and right. The original four engines and the set-piece steps all use these, so a move
// feels the same wherever it appears. No 3D and no browser here (the headless tests use it).

// A meter that fills while a move is held and drains when it isn't.
//   holdMeter(seconds, { drain })   drain: seconds lost per second when let go (default 1.5)
//   meter.update(active, dt)        then meter.k (0..1 shown), meter.done
// With `fraction: true` it counts in fractions of the hold instead of seconds and `drain` is
// fraction per second: hop-stones' original maths, kept so its timing is frame-for-frame the
// same. (The two ways reach "full" on different frames for some holds, e.g. 1.3 s.)
export function holdMeter(seconds, { drain = 1.5, fraction = false } = {}) {
  let v = 0; // seconds held, or fraction held
  return {
    get k() { return fraction ? v : v / seconds; },
    get done() { return fraction ? v >= 1 : v >= seconds; },
    get seconds() { return seconds; },
    update(active, dt) {
      if (fraction) v = active ? Math.min(1, v + dt / seconds) : Math.max(0, v - dt * drain);
      else v = active ? v + dt : Math.max(0, v - dt * drain);
      return this;
    },
    // Make what is left shorter (help for a child who is stuck): keep at least `min` seconds.
    shorten(factor = 0.5, min = 0.3) {
      if (fraction) return;
      const left = seconds - v;
      if (left > min) seconds = v + Math.max(min, left * factor);
    },
    reset() { v = 0; },
  };
}

// Arm pumps: both arms up, then down again, is one pump. update() is true on each full pump.
export function pumpCounter() {
  let up = false;
  return {
    update(input) {
      if (!up && input.armsUp) up = true;
      else if (up && input.armsDown) {
        up = false;
        return true;
      }
      return false;
    },
    reset() { up = false; },
  };
}

// Something that follows the child left and right: -1 (left third of the picture) to 1 (right),
// eased so it glides rather than jumps between thirds.
export const AIM = { left: -1, center: 0, right: 1 };
export function zoneFollower(start = 0) {
  let aim = start;
  return {
    get aim() { return aim; },
    update(zone, dt) {
      aim += (AIM[zone] - aim) * (1 - Math.exp(-4 * dt));
      return aim;
    },
    set(v) { aim = v; },
  };
}

// The "ready" position between steps: arms down, standing in the middle, no pose, not ducking.
// A set piece waits for it before a new step counts, so a held move can't carry over.
export function isNeutral(input) {
  return !!input.armsDown && !input.armsUp && !input.pose && !input.duck && input.zone === 'center';
}
