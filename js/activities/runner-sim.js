// The runner's rules, with no 3D or page code: a seeded, fixed-timestep simulation that the
// runner engine draws, and that tools/test-runner.mjs plays headless with a bot.
//
// Units: distance along the track (the hero runs toward +distance), seconds, lanes -1 / 0 / 1.
//
//   const sim = createRunSim(config)
//   sim.step(input)        one fixed step (STEP seconds). input = { zone, jump, duck, armsUp, tracking }
//                          (zone 'left' | 'center' | 'right'; jump true on the step it happens)
//   sim.events             what happened since you last emptied it (telegraph, clear, hit, bun, ...)
//   sim.clearAhead(2)      keep the next 2 s free of obstacles (after a pause or 3-2-1)
//   sim.continueEndless()  after the goal: keep running with rising difficulty
//
// Judging uses move windows: each obstacle opens WINDOW_BEFORE s before the hero reaches it and
// closes WINDOW_AFTER s after. A jump anywhere in the window clears a gap (and is buffered so the
// hero jumps right at it); a duck or arms-up held at any moment clears a branch or sunk stone.
// Lane obstacles are judged at the moment the hero reaches them.

import { PATTERNS, MOVE_OF, isObstacle } from './runner-patterns.js';

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
//   maxJumpsInRow (Little: 6), forceSpeed (tests: always this speed), adaptive: true
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
  const laneTime = LANE_TIME[play][age];
  const reaction = REACTION[age];
  const byAge = v => (v && typeof v === 'object' && !Array.isArray(v) && ('little' in v || 'big' in v) ? v[age] : v);
  const avgSpeed = (config.speed.start + config.speed.max) / 2;
  const legs = config.legs.map(l => {
    const leg = { ...l, patterns: byAge(l.patterns), seconds: byAge(l.seconds) };
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
  let lastLaneItem = 0, lastWall = null;
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
  function neededGap(safe) {
    if (!lastObstacle) return 0;
    let travel = 0;
    if (safe) for (const from of possibleLanes) travel = Math.max(travel, lanesTo(from, safe));
    return Math.max(reaction, travel ? travel * laneTime + 0.5 : 0);
  }

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
        // At least the pattern's own gap, and at least what fairness needs.
        const want = (item.at ?? 0) * v;
        const need = neededGap(safe) * v;
        D = lastObstacle ? Math.max(D + want, lastObstacle.D + need) : D + want;
        // A bun line may have pulled the child sideways: give them time to walk back.
        if (safe && lure) D = Math.max(D, lure.D + (lanesTo(lure.lane, safe) * laneTime + 0.5) * v);
        sim.objects.push({ id: ++objectId, kind: item.kind, move: MOVE_OF[item.kind], D, blocked, safe, judged: false, cleared: false, telegraphed: false, untracked: false, pattern: name });
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
        for (let i = 0; i < count; i++) {
          sim.objects.push({ id: ++objectId, kind: item.kind, lane, D: D + i * (item.every ?? 0.25) * v, arc: item.arc ? Math.sin(((i + 0.5) / count) * Math.PI) : 0, taken: false, passed: false });
        }
        D += (count - 1) * (item.every ?? 0.25) * v;
        lure = { D, lane };
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

    // Lanes: the hero heads for the child's zone and slides there over ~0.18 s.
    sim.lane = LANE_OF_ZONE[input.zone] ?? 0;
    sim.laneX += (sim.lane - sim.laneX) * (1 - Math.exp(-dt / 0.06));
    if (Math.abs(sim.lane - sim.laneX) < 0.01) sim.laneX = sim.lane;
    const heroLane = Math.round(sim.laneX);

    sim.duck = !!input.duck;
    sim.armsUp = !!input.armsUp;
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
      if (!isObstacle(o.kind)) {
        // Collectibles: picked up when passed in the same lane.
        if (!o.passed && o.D <= sim.dist) {
          o.passed = true;
          if (o.kind === 'bun') sim.stats.bunsSeen++;
          if (o.lane === heroLane) {
            o.taken = true;
            if (o.kind === 'bun') sim.stats.buns++;
            else sim.stats.stars++;
            sim.events.push({ type: o.kind, obj: o });
            if (o.kind === 'bun') teachProgress(o.lane);
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
      if (o.move === 'lane' && a <= 0) {
        judge(o, !o.blocked.includes(heroLane));
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
  let zoneLane = 0, moving = 0, moveLeft = 0;
  const zoneName = l => (l < 0 ? 'left' : l > 0 ? 'right' : 'center');
  const jumped = new Set();
  return function input() {
    const arrival = o => (o.D - sim.dist) / Math.max(sim.speed, 0.1);
    const ahead = sim.objects.filter(o => !o.judged && !o.passed && arrival(o) > -0.1).sort((a, b) => a.D - b.D);
    // Where to be: the free lane of the next lane obstacle (nearest to where we are).
    let want = zoneLane;
    const lane = ahead.find(o => o.move === 'lane');
    if (lane) want = lane.safe.reduce((b, l) => (Math.abs(l - zoneLane) < Math.abs(b - zoneLane) ? l : b), lane.safe[0]);
    else {
      const bun = ahead.find(o => o.kind === 'bun' && arrival(o) < 2.5);
      if (bun) want = bun.lane;
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
    return { zone: zoneName(zoneLane), jump, duck: near('duck', 0.6, -0.1), armsUp: near('armsUp', 0.8, 0), tracking: true };
  };
}
