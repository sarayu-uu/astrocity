// The runner's rules, with no 3D or page code: a seeded, fixed-timestep simulation that the
// runner engine draws, and that tools/test-runner.mjs plays headless with a bot.
//
// Units: distance along the track (the hero runs toward +distance), seconds, lanes -1 / 0 / 1.
//
//   const sim = createRunSim(config)
//   sim.step(input)        one fixed step (STEP seconds). input = { zone, jump, duck, armsUp, lean, tracking }
//                          (zone 'left' | 'center' | 'right'; jump true on the step it happens)
//   sim.events             what happened since you last emptied it (telegraph, clear, hit, bun, ...)
//   sim.clearAhead(2)      keep the next 2 s free of obstacles (after a pause or 3-2-1)
//   sim.continueEndless()  after the goal: keep running with rising difficulty
//
// Judging uses move windows: each obstacle opens WINDOW_BEFORE s before the hero reaches it and
// closes WINDOW_AFTER s after. A jump anywhere in the window clears a gap (and is buffered so the
// hero jumps right at it); a duck or arms-up held at any moment clears a branch or sunk stone.
// Lane obstacles are judged at the moment the hero reaches them.

import { PATTERNS, MOVE_OF, isObstacle, isCollectible } from './runner-patterns.js';

export const STEP = 1 / 60;
export const WINDOW_BEFORE = 1.0;
export const WINDOW_AFTER = 0.2;
const TELEGRAPH = 1.5; // seconds ahead the move icon shows
const JUMP_TIME = 0.6; // seconds in the air
const STUMBLE_TIME = 1.5;
const STUMBLE_SLOW = 0.7;
const LOOKAHEAD = 7; // seconds of track generated ahead
const ADAPT_UP = 1.08, ADAPT_DOWN = 0.9, ADAPT_MIN = 0.8, ADAPT_MAX = 1.25;
export const LANE_OF_ZONE = { left: -1, center: 0, right: 1 };

// Seconds a child needs to cross one lane, by how they play.
export const LANE_TIME = { camera: { little: 1.5, big: 1.0 }, keyboard: { little: 0.3, big: 0.3 } };
// Seconds between two obstacles, at minimum, just to see and react.
export const REACTION = { little: 1.6, big: 1.1 };
// Fly mode: seconds a child needs to go from low to high or back (arms up / down), and how long
// arms must stay up (or down) before the height changes, so a flicker doesn't count.
export const HEIGHT_TIME = { camera: { little: 1.0, big: 0.8 }, keyboard: { little: 0.3, big: 0.3 } };
export const HEIGHT_HOLD = 0.15;
// Pilot mode: lanes per second the ship slides at full wing tilt, and the seconds a child needs
// to cross one lane by tilting (react, tip the arms, slide), by how they play.
export const STEER_SPEED = { little: 1.6, big: 2.2 };
export const PILOT_LANE_TIME = { camera: { little: 1.3, big: 0.95 }, keyboard: { little: 0.8, big: 0.6 } };
const SHIP_HALF = 0.32; // the ship's half-width, in lanes
const GLIDE_HOME = 0.35; // lanes per second back to the middle while the wings are down
const LEAN_TIME = 0.6; // seconds to see a gust and lean into it
const RING = 5; // sparks a spark ring is worth

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// config: {
//   age: 'little' | 'big', play: 'camera' | 'keyboard', seed,
//   speed: { start, max }, legs: [leg, ...],
//   patterns: extra pattern definitions, breatherEvery: seconds (0 = never),
//   maxJumpsInRow (Little: 6), forceSpeed (tests: always this speed), adaptive: true,
//   legSeconds (how long a leg lasts when it gives no length or seconds),
//   mode: 'fly' (two heights: arms up flies high, arms down low; legs may say heights: false)
// }
// A leg: { length (distance) or seconds (time at this age's speeds), theme, patterns: [names],
//   tier (lowest pattern tier allowed from the start), teach: { lanes: [-1, 1], timeout } }. Patterns and numbers may differ by age:
//   patterns: { little: [...], big: [...] }. A teach leg ends early once a bun is caught in
//   each of its lanes (or after `timeout` seconds), and is left out when endless mode loops.
export function createRunSim(config) {
  const rng = mulberry32(config.seed ?? 1);
  const age = config.age ?? 'little';
  const play = config.play ?? 'camera';
  const patterns = { ...PATTERNS, ...config.patterns };
  const pilot = config.mode === 'pilot';
  const laneTime = (pilot ? PILOT_LANE_TIME : LANE_TIME)[play][age];
  const reaction = REACTION[age];
  const fly = config.mode === 'fly';
  const steerSpeed = config.steer ?? STEER_SPEED[age];
  const heightTime = HEIGHT_TIME[play][age];
  const byAge = v => (v && typeof v === 'object' && !Array.isArray(v) && ('little' in v || 'big' in v) ? v[age] : v);
  const avgSpeed = (config.speed.start + config.speed.max) / 2;
  const legs = config.legs.map(l => {
    // A leg with no length or seconds of its own lasts config.legSeconds.
    const leg = { ...l, patterns: byAge(l.patterns), seconds: byAge(l.seconds) ?? (l.length == null && !l.teach ? config.legSeconds : undefined) };
    leg.length = byAge(l.length) ?? (leg.teach ? leg.teach.timeout ?? 40 : leg.seconds) * avgSpeed;
    return leg;
  });
  const loopLegs = legs.filter(l => !l.teach);
  const legDef = i => (i < legs.length ? legs[i] : loopLegs[(i - legs.length) % loopLegs.length]);
  const lengths = []; // leg lengths changed while running (a teach leg ending early)
  const legLen = i => lengths[i] ?? legDef(i).length;

  const sim = {
    t: 0, dist: 0, speed: config.speed.start,
    lane: 0, laneX: 0, // target lane, and the hero's sliding position
    fly, high: false, heightX: 0, // fly mode: flying high?, and the eased height (0 low, 1 high)
    lean: null,
    pilot, bank: 0, wingsOut: true, // pilot mode: the wings' tilt (-1..1) and whether they're out
    jumpT: -1, pendingJump: null, duck: false, armsUp: false,
    stumbleT: 0, speedMul: 1, tier: 1,
    leg: 0, legStart: 0, endless: false, goalReached: false,
    objects: [], events: [],
    stats: { buns: 0, bunsSeen: 0, stars: 0, cleared: 0, hits: 0, stumblesPerLeg: legs.map(() => 0), combo: 0, bestCombo: 0 },
    recent: [], // last judged obstacles: true = cleared (for adaptive difficulty)
    runTime: 0, breatherDue: false,
    get airborne() { return this.jumpT >= 0 && this.jumpT < JUMP_TIME; },
    get jumpK() { return this.airborne ? this.jumpT / JUMP_TIME : 0; },
    get progress() { return Math.min(1, this.dist / legEnd(legs.length - 1)); },
    get legInfo() { return this.currentLeg(); },
    teachLanes: new Set(), // lanes a bun was caught in during a teach leg
    get score() { return Math.round(this.dist) + this.stats.buns * 10 + this.stats.stars * 50; },
  };

  // ---- Legs and speed -----------------------------------------------------------------

  sim.legDef = legDef;
  sim.currentLeg = () => legDef(sim.leg);
  const legMax = () => config.speed.max;
  // The speed the generator plans for: the fastest this leg can get, after adaptive bumps.
  const planSpeed = () => config.forceSpeed ?? legMax() * ADAPT_MAX;

  function updateSpeed() {
    if (config.forceSpeed) return (sim.speed = config.forceSpeed);
    const k = Math.min(1, (sim.dist - sim.legStart) / legLen(sim.leg));
    const base = config.speed.start + (config.speed.max - config.speed.start) * k;
    sim.speed = base * sim.speedMul * (sim.stumbleT > 0 ? STUMBLE_SLOW : 1);
  }

  // ---- Generating the track ahead ------------------------------------------------------

  let genD = 25; // where the next pattern may start (distance): a quiet start
  let lastObstacle = null; // { D, kind, safe: [lanes] } the last obstacle placed
  let possibleLanes = [-1, 0, 1]; // where the hero can be after the last obstacle
  let jumpsInRow = 0;
  let lastLaneItem = 0, lastWall = null, lastHeight = 0;
  let lure = null; // { D, lane } the last collectible: it may have drawn the child into its lane

  const pickLane = (spec, item) => {
    if (typeof spec === 'number') return spec;
    if (spec === 'same') return lastLaneItem;
    if (spec === 'free') return lastObstacle?.safe ? lastObstacle.safe[Math.floor(rng() * lastObstacle.safe.length)] : 0;
    if (spec === 'blocked') return lastWall ? lastWall.blocked[Math.floor(rng() * lastWall.blocked.length)] : 0;
    return Math.floor(rng() * 3) - 1;
  };

  // Seconds needed between the previous obstacle and this one: react, then (for a lane
  // obstacle) walk from wherever the hero may be to the nearest free lane.
  const lanesTo = (from, safe) => Math.min(...safe.map(to => Math.abs(to - from)));
  // Fly mode: the height the last height obstacle left the child at (1 high, 0 low, null either),
  // and the last spark line, which may have drawn them to its height.
  let heightAfter = null, lureHeight = null;
  function neededGap(safe, needHeight = null, gust = false) {
    if (!lastObstacle) return 0;
    let travel = 0;
    if (safe) for (const from of possibleLanes) travel = Math.max(travel, lanesTo(from, safe));
    const climb = needHeight !== null && heightAfter !== null && heightAfter !== needHeight ? heightTime + 0.5 : 0;
    return Math.max(reaction, travel ? travel * laneTime + 0.5 : 0, climb, gust ? reaction + LEAN_TIME : 0);
  }
  // Heights are on in this leg (fly mode; a leg can say heights: false, e.g. for Little early on).
  const heightsOn = i => fly && byAge(legDef(i).heights) !== false;
  sim.heightsOn = () => heightsOn(sim.leg);

  function choosePattern(leg) {
    // A leg can open harder tiers from the start (leg.tier), so its new obstacles show up.
    const tier = Math.max(sim.tier, leg.tier ?? 1);
    let names = leg.patterns.filter(n => (patterns[n]?.tier ?? 1) <= tier);
    if (!names.length) names = leg.patterns;
    // Little kids: never more than maxJumpsInRow jumps without something else.
    const maxJumps = config.maxJumpsInRow ?? (age === 'little' ? 6 : Infinity);
    const jumpsIn = n => patterns[n].items.filter(i => MOVE_OF[i.kind] === 'jump').length;
    const ok = names.filter(n => jumpsInRow + jumpsIn(n) <= maxJumps || patterns[n].items.some(i => isObstacle(i.kind) && MOVE_OF[i.kind] !== 'jump'));
    const pool = ok.length ? ok : names.filter(n => !jumpsIn(n));
    return (pool.length ? pool : names)[Math.floor(rng() * (pool.length ? pool : names).length)];
  }

  function placePattern(name) {
    const p = patterns[name];
    const v = planSpeed();
    let D = genD;
    for (const item of p.items) {
      const count = item.count ?? 1;
      if (isObstacle(item.kind)) {
        let safe = null, blocked = [];
        if (item.kind === 'block') {
          const l = pickLane(item.lane, item);
          blocked = [l];
          safe = [-1, 0, 1].filter(x => x !== l);
          lastLaneItem = l;
        } else if (item.kind === 'wall') {
          const open = pickLane(item.lane, item);
          blocked = [-1, 0, 1].filter(x => x !== open);
          safe = [open];
          lastWall = { blocked };
          lastLaneItem = open;
        }
        const move = MOVE_OF[item.kind];
        const needHeight = move === 'up' ? 1 : move === 'down' ? 0 : null;
        // At least the pattern's own gap, and at least what fairness needs.
        const want = (item.at ?? 0) * v;
        const need = neededGap(safe, needHeight, move === 'lean') * v;
        D = lastObstacle ? Math.max(D + want, lastObstacle.D + need) : D + want;
        // A bun line may have pulled the child sideways: give them time to walk back.
        if (safe && lure) D = Math.max(D, lure.D + (lanesTo(lure.lane, safe) * laneTime + 0.5) * v);
        // Sparks may have drawn them up or down: give them time to change height.
        if (needHeight !== null && lureHeight && lureHeight.height !== needHeight) D = Math.max(D, lureHeight.D + (heightTime + 0.5) * v);
        const dir = move === 'lean' ? (item.dir === 'left' || item.dir === 'right' ? item.dir : rng() < 0.5 ? 'left' : 'right') : null;
        sim.objects.push({ id: ++objectId, kind: item.kind, move, dir, D, blocked, safe, judged: false, cleared: false, telegraphed: false, untracked: false, pattern: name });
        if (needHeight !== null) {
          heightAfter = needHeight;
          lureHeight = null;
        }
        lastObstacle = { D, safe };
        if (safe) {
          possibleLanes = safe;
          lure = null;
        }
        jumpsInRow = MOVE_OF[item.kind] === 'jump' ? jumpsInRow + 1 : 0;
      } else {
        const lane = pickLane(item.lane, item);
        lastLaneItem = lane;
        D += (item.at ?? 0) * v;
        // Fly mode: which height (only when this leg has heights; otherwise low).
        let height = 0;
        if (heightsOn(legAt(D))) {
          if (item.height === 'high') height = 1;
          else if (item.height === 'same') height = lastHeight;
          else if (item.height === 'random') height = rng() < 0.5 ? 1 : 0;
        }
        lastHeight = height;
        for (let i = 0; i < count; i++) {
          sim.objects.push({ id: ++objectId, kind: item.kind, lane, height, D: D + i * (item.every ?? 0.25) * v, arc: item.arc ? Math.sin(((i + 0.5) / count) * Math.PI) : 0, taken: false, passed: false });
        }
        D += (count - 1) * (item.every ?? 0.25) * v;
        lure = { D, lane };
        if (fly) lureHeight = { D, height };
        possibleLanes = [-1, 0, 1];
      }
    }
    genD = Math.max(D, lastObstacle?.D ?? D) + reaction * v * 0.5;
  }
  let objectId = 0;

  // Where leg i ends (legs repeat in endless mode).
  const legEnd = i => {
    let end = 0;
    for (let k = 0; k <= i; k++) end += legLen(k);
    return end;
  };
  const legEndD = () => legEnd(sim.leg);
  const legAt = D => {
    let i = 0;
    while (D >= legEnd(i)) i++;
    return i;
  };

  function generate() {
    const v = planSpeed();
    const horizon = sim.dist + LOOKAHEAD * v;
    while (genD < horizon) {
      const i = legAt(genD);
      // Story over (until Keep going): stop just before the end.
      if (!sim.endless && genD >= legEnd(legs.length - 1) - 2 * v) return;
      // Leave 2 s clear either side of every leg boundary (the set piece goes there).
      const end = legEnd(i);
      if (genD > end - 2 * v) {
        genD = end + 2 * v;
        lastObstacle = null;
        lure = null;
        heightAfter = lureHeight = null;
        possibleLanes = [-1, 0, 1];
        continue;
      }
      if (sim.breatherDue) {
        sim.breatherDue = false;
        const D = Math.max(genD, (lastObstacle?.D ?? 0) + reaction * v);
        sim.objects.push({ id: ++objectId, kind: 'breather', D, passed: false });
        genD = D + 2 * v;
        lastObstacle = null;
        lure = null;
        continue;
      }
      placePattern(choosePattern(legDef(i)));
    }
  }

  // ---- Public controls -----------------------------------------------------------------

  // Keep the next `seconds` free: push everything not yet reached further down the track.
  sim.clearAhead = (seconds = 2) => {
    const need = sim.dist + seconds * Math.max(sim.speed, 1);
    const first = sim.objects.filter(o => o.D >= sim.dist && !o.judged && !o.passed).reduce((m, o) => Math.min(m, o.D), Infinity);
    if (first === Infinity || first >= need) return;
    const shift = need - first;
    for (const o of sim.objects) if (o.D >= sim.dist) o.D += shift;
    genD += shift;
    if (lastObstacle) lastObstacle.D += shift;
  };

  let highHold = 0;

  sim.continueEndless = () => {
    sim.endless = true;
    sim.goalReached = true;
  };

  // ---- One fixed step --------------------------------------------------------------------

  sim.step = (input) => {
    const dt = STEP;
    sim.t += dt;
    sim.runTime += dt;
    if (config.breatherEvery && sim.runTime >= config.breatherEvery) {
      sim.runTime = 0;
      sim.breatherDue = true;
    }
    if (sim.stumbleT > 0) sim.stumbleT -= dt;
    updateSpeed();
    const prevDist = sim.dist;
    sim.dist += sim.speed * dt;
    generate();

    if (pilot) {
      // Pilot: the wings steer. The ship slides sideways as fast as the wings tilt, anywhere
      // across the three lanes. Wings down: it glides gently back to the middle.
      const out = input.wingsOut !== false;
      if (out !== sim.wingsOut) {
        sim.wingsOut = out;
        sim.events.push({ type: out ? 'wingsUp' : 'wingsDown' });
      }
      sim.bank = out ? Math.max(-1, Math.min(1, input.wingsTilt ?? 0)) : sim.bank * Math.exp(-dt / 0.2);
      if (out) sim.laneX += sim.bank * steerSpeed * dt;
      else sim.laneX -= Math.sign(sim.laneX) * Math.min(Math.abs(sim.laneX), GLIDE_HOME * dt);
      sim.laneX = Math.max(-1.25, Math.min(1.25, sim.laneX));
      sim.lane = Math.round(sim.laneX);
    } else {
      // Lanes: the hero heads for the child's zone and slides there over ~0.18 s.
      sim.lane = LANE_OF_ZONE[input.zone] ?? 0;
      sim.laneX += (sim.lane - sim.laneX) * (1 - Math.exp(-dt / 0.06));
      if (Math.abs(sim.lane - sim.laneX) < 0.01) sim.laneX = sim.lane;
    }
    const heroLane = Math.round(sim.laneX);
    // In a lane: pilot uses the ship's real width; the others are always in one lane.
    const inLane = l => (pilot ? Math.abs(sim.laneX - l) < 0.5 : heroLane === l);
    const clearOf = l => (pilot ? Math.abs(sim.laneX - l) >= 0.45 + SHIP_HALF : heroLane !== l);

    sim.duck = !!input.duck;
    sim.armsUp = !!input.armsUp;
    sim.lean = input.lean ?? null;

    // Fly mode: arms up (held a moment) flies high, arms down flies low; eased over ~0.25 s.
    if (fly) {
      const wantHigh = sim.heightsOn() && sim.armsUp;
      highHold = wantHigh !== sim.high ? highHold + dt : 0;
      if (highHold >= HEIGHT_HOLD) {
        sim.high = wantHigh;
        highHold = 0;
      }
      sim.heightX += ((sim.high ? 1 : 0) - sim.heightX) * (1 - Math.exp(-dt / 0.08));
    }
    const heroHeight = sim.heightX > 0.5 ? 1 : 0;
    if (sim.jumpT >= 0) sim.jumpT += dt;
    if (sim.jumpT >= JUMP_TIME) sim.jumpT = -1;

    const arrival = o => (o.D - sim.dist) / Math.max(sim.speed, 0.1);

    // A jump clears the nearest open gap; the hero leaves the ground right on time.
    if (input.jump) {
      const gap = sim.objects.find(o => o.move === 'jump' && !o.judged && !o.cleared && arrival(o) <= WINDOW_BEFORE && arrival(o) >= -WINDOW_AFTER);
      if (gap) {
        gap.cleared = true;
        if (arrival(gap) > JUMP_TIME / 2) sim.pendingJump = gap;
        else if (!sim.airborne) sim.jumpT = 0;
      } else if (!sim.airborne) {
        sim.jumpT = 0;
      }
      sim.events.push({ type: 'jumpInput' });
    }
    if (sim.pendingJump && arrival(sim.pendingJump) <= JUMP_TIME / 2) {
      sim.pendingJump = null;
      sim.jumpT = 0;
    }

    for (const o of sim.objects) {
      const a = arrival(o);
      if (o.kind === 'breather') {
        if (!o.passed && a <= 0) {
          o.passed = true;
          sim.events.push({ type: 'breather' });
        }
        continue;
      }
      if (isCollectible(o.kind)) {
        // Collectibles: picked up when passed in the same lane (and at the same height, flying).
        // Buns and sparks count the same; a spark ring is worth RING sparks.
        if (!o.passed && o.D <= sim.dist) {
          o.passed = true;
          const worth = o.kind === 'ring' ? RING : 1;
          if (o.kind !== 'star') sim.stats.bunsSeen += worth;
          if (inLane(o.lane) && (!fly || (o.height ?? 0) === heroHeight)) {
            o.taken = true;
            if (o.kind === 'star') sim.stats.stars++;
            else sim.stats.buns += worth;
            sim.events.push({ type: o.kind, obj: o });
            if (o.kind !== 'star') teachProgress(o.lane);
          }
        }
        continue;
      }
      if (o.judged) continue;
      if (!o.telegraphed && a <= TELEGRAPH) {
        o.telegraphed = true;
        sim.events.push({ type: 'telegraph', obj: o, move: o.move, toward: o.safe ? nearest(o.safe, heroLane) : null });
      }
      const inWindow = a <= WINDOW_BEFORE && a >= -WINDOW_AFTER;
      if (inWindow && !input.tracking) o.untracked = true;
      if (o.move === 'duck' && inWindow && sim.duck) o.cleared = true;
      if (o.move === 'armsUp' && inWindow && sim.armsUp) o.cleared = true;
      if (o.move === 'lean' && inWindow && sim.lean === o.dir) o.cleared = true;
      // Fly mode: be at the right height as you reach it (high over a rock, low under an arch).
      if ((o.move === 'up' || o.move === 'down') && a <= 0) {
        judge(o, heroHeight === (o.move === 'up' ? 1 : 0));
        continue;
      }
      if (o.move === 'lane' && a <= 0) {
        judge(o, o.blocked.every(clearOf));
        continue;
      }
      if (o.move !== 'lane' && a < -WINDOW_AFTER) judge(o, o.cleared);
    }

    // Leg changes.
    if (sim.dist >= legEndD()) {
      sim.events.push({ type: 'legEnd', leg: sim.leg });
      if (!sim.endless && sim.leg >= legs.length - 1 && !sim.goalReached) {
        sim.goalReached = true;
        sim.events.push({ type: 'goal' });
      }
      sim.leg++;
      sim.legStart = legEnd(sim.leg - 1);
      if (sim.endless) sim.tier = Math.min(3, sim.tier + 1);
      sim.teachLanes.clear();
      fitLegToTime(sim.leg);
      sim.events.push({ type: 'legStart', leg: sim.leg, theme: sim.currentLeg().theme, def: sim.currentLeg() });
    }

    // Forget what is well behind.
    if (sim.objects.length > 200) sim.objects = sim.objects.filter(o => o.D > prevDist - 30);
  };

  // A leg given in seconds is sized as it starts, at the speed the child is playing at now
  // (adaptive speed included), so it lasts about that long for any age or skill.
  function fitLegToTime(i) {
    const def = legDef(i);
    if (def.seconds && !config.forceSpeed) lengths[i] = def.seconds * avgSpeed * sim.speedMul;
  }
  fitLegToTime(0);

  // A teach leg ends (2 s later) once a bun has been caught in each of its lanes. What was
  // already laid out further on is cleared, so the next leg starts fresh after a 2 s gap.
  function teachProgress(lane) {
    const teach = sim.currentLeg().teach;
    if (!teach || sim.leg >= legs.length) return;
    sim.teachLanes.add(lane);
    if (!(teach.lanes ?? [-1, 1]).every(l => sim.teachLanes.has(l))) return;
    const v = Math.max(sim.speed, 1);
    const end = sim.dist + 2 * v;
    if (end >= legEnd(sim.leg)) return;
    lengths[sim.leg] = end - sim.legStart;
    sim.objects = sim.objects.filter(o => o.passed || o.judged || o.D < sim.dist);
    genD = end + 2 * planSpeed();
    lastObstacle = null;
    lure = null;
    possibleLanes = [-1, 0, 1];
    sim.events.push({ type: 'teachDone', leg: sim.leg });
  }

  function nearest(lanes, from) {
    return lanes.reduce((best, l) => (Math.abs(l - from) < Math.abs(best - from) ? l : best), lanes[0]);
  }

  function judge(o, cleared) {
    o.judged = true;
    o.cleared = cleared;
    const s = sim.stats;
    if (cleared) {
      s.cleared++;
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      sim.events.push({ type: 'clear', obj: o });
    } else {
      s.hits++;
      s.combo = 0;
      if (sim.leg < legs.length) s.stumblesPerLeg[sim.leg]++;
      sim.stumbleT = STUMBLE_TIME;
      sim.events.push({ type: 'hit', obj: o });
    }
    // Adaptive difficulty, ignoring obstacles where the camera lost the child.
    if (config.adaptive === false || o.untracked) return;
    sim.recent.push(cleared);
    if (sim.recent.length > 10) sim.recent.shift();
    if (sim.recent.length === 10) {
      const rate = sim.recent.filter(Boolean).length / 10;
      if (rate > 0.85) {
        sim.speedMul = Math.min(ADAPT_MAX, sim.speedMul * ADAPT_UP);
        sim.tier = Math.min(3, sim.tier + 1);
        sim.recent = [];
      } else if (rate < 0.55) {
        sim.speedMul = Math.max(ADAPT_MIN, sim.speedMul * ADAPT_DOWN);
        sim.tier = Math.max(1, sim.tier - 1);
        sim.recent = [];
      }
    }
  }

  // 1 = finished; 2 = at least 60% of buns; 3 = at least 85% and no more than 2 stumbles a leg.
  sim.starsEarned = () => {
    const s = sim.stats;
    const share = s.bunsSeen ? s.buns / s.bunsSeen : 1;
    if (share >= 0.85 && s.stumblesPerLeg.every(n => n <= 2)) return 3;
    if (share >= 0.6) return 2;
    return 1;
  };

  return sim;
}

// ---- Autoplay bot ----------------------------------------------------------------------
// Perfect decisions, but it moves between lanes as slowly as a child does on camera, so the
// headless test proves every pattern can be cleared by a real child.

export function createBot(sim, { age = 'little', play = 'camera', seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const laneTime = LANE_TIME[play][age];
  const heightTime = HEIGHT_TIME[play][age];
  let zoneLane = 0, moving = 0, moveLeft = 0;
  let arms = false, armsTarget = false, armsIn = 0; // fly mode: arms up (high) or not
  let tilt = 0, pilotWant = 0, pilotTarget = 0, pilotDelay = 0; // pilot mode: the wings
  const zoneName = l => (l < 0 ? 'left' : l > 0 ? 'right' : 'center');
  const jumped = new Set();
  return function input() {
    const arrival = o => (o.D - sim.dist) / Math.max(sim.speed, 0.1);
    const ahead = sim.objects.filter(o => !o.judged && !o.passed && arrival(o) > -0.1).sort((a, b) => a.D - b.D);
    // Where to be: the free lane of the next lane obstacle (nearest to where we are).
    let want = zoneLane;
    const lane = ahead.find(o => o.move === 'lane');
    const goodie = o => o.kind === 'bun' || o.kind === 'spark' || o.kind === 'ring';
    if (lane) want = lane.safe.reduce((b, l) => (Math.abs(l - zoneLane) < Math.abs(b - zoneLane) ? l : b), lane.safe[0]);
    else {
      const bun = ahead.find(o => goodie(o) && arrival(o) < 2.5);
      if (bun) want = bun.lane;
    }
    // Fly mode: decide on a height when the next rock or arch is announced (or for the next
    // sparks), then take as long as a child does to get the arms there.
    if (sim.fly) {
      const climb = ahead.find(o => (o.move === 'up' || o.move === 'down') && arrival(o) <= TELEGRAPH);
      const spark = ahead.find(o => goodie(o) && arrival(o) < 1.6 && o.lane === want);
      const target = climb ? climb.move === 'up' : spark ? spark.height === 1 : armsTarget;
      if (target !== armsTarget) {
        armsTarget = target;
        armsIn = heightTime * 0.8;
      }
      if (armsIn > 0) armsIn -= STEP;
      else arms = armsTarget;
    }
    // A child crosses one lane every laneTime seconds.
    if (moving) {
      moveLeft -= STEP;
      if (moveLeft <= 0) {
        zoneLane += moving;
        moving = 0;
      }
    } else if (want !== zoneLane) {
      moving = Math.sign(want - zoneLane);
      moveLeft = laneTime;
    }
    // Jump somewhere early in the window (this also exercises the jump buffer).
    let jump = false;
    const gap = ahead.find(o => o.move === 'jump' && !jumped.has(o.id));
    if (gap && arrival(gap) <= 1.0 - rng() * 0.4) {
      jumped.add(gap.id);
      jump = true;
    }
    const near = (move, from, to) => ahead.some(o => o.move === move && arrival(o) <= from && arrival(o) >= to);
    const gust = ahead.find(o => o.move === 'lean' && arrival(o) <= 0.8 && arrival(o) >= -0.1);
    if (sim.pilot) {
      // Steer with the wings: pick a lane like above (nearest free one from where the ship is),
      // notice it a moment late, and tip the arms over about a third of a second.
      const at = sim.laneX;
      let target = pilotTarget;
      // Like a child, it only reacts to an obstacle once it's close enough to notice (~3 s away).
      const seen = lane && arrival(lane) <= 3 ? lane : null;
      if (seen) target = seen.safe.reduce((b, l) => (Math.abs(l - at) < Math.abs(b - at) ? l : b), seen.safe[0]);
      else if (!lane || arrival(lane) > 3) {
        const bun = ahead.find(o => goodie(o) && arrival(o) < 2.5);
        if (bun) target = bun.lane;
      }
      if (target !== pilotWant) {
        pilotWant = target;
        pilotDelay = play === 'camera' ? 0.4 : 0.1;
      }
      if (pilotDelay > 0) pilotDelay -= STEP;
      else pilotTarget = pilotWant;
      const err = pilotTarget - at;
      const goal = Math.abs(err) < 0.04 ? 0 : Math.max(-1, Math.min(1, err * 2.5));
      const slew = STEP / (play === 'camera' ? 0.35 : 0.12);
      tilt += Math.max(-slew, Math.min(slew, goal - tilt));
      return { zone: 'center', jump: false, duck: false, armsUp: false, lean: null, wingsOut: true, wingsTilt: tilt, tracking: true };
    }
    return {
      zone: zoneName(zoneLane), jump, duck: near('duck', 0.6, -0.1),
      armsUp: sim.fly ? arms : near('armsUp', 0.8, 0),
      lean: gust ? gust.dir : null,
      tracking: true,
    };
  };
}
