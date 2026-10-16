// Turns the child's body (webcam + MediaPipe Pose, all on-device) or the keyboard into a few
// reliable signals:
//   consumeJump()  true once per real jump
//   pose           'star' (both arms up) | 'bridge' (arms out wide) | 'moon' (one arm up) | null
//   armsUp / armsDown
//   zone           'left' | 'center' | 'right': which third of the (mirrored) camera picture
//                  the child's hips are in, so "left" is the child's own left
//   duck           squatting down (held)
//   lean           'left' | 'right' | null: the torso tilts to that side
//   stillFor       seconds the body has been held still (freeze)
//   wingsOut       both arms held out wide, like a plane's wings
//   wingsTilt      -1..1: how far the "wings" tilt, like a plane banking. Left hand lower
//                  (the child's own left) = negative = steer left. 0 inside a small dead zone.
//   tracking       a body is in view
// Keys: Space jump, W/↑ arms up, ←/→ step (and steer the wings), S/↓ duck, A/D lean,
//       1/2/3 poses, nothing = freeze.
//
// Every camera frame (or recorded frame, in replay) goes through _process(), so a recording of
// real kids can be fed back through exactly the same detection.

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const SKELETON = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const MOTION_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // shoulders, elbows, wrists, hips, knees, ankles
const JUMP_SENSITIVITY = { little: 0.1, big: 0.15 }; // hip rise, in torso-lengths
const visible = p => p && (p.visibility ?? 1) >= 0.5;

// Tunable thresholds (the ?debug panel has sliders). Duck numbers depend on the age setting.
export const TUNE_DEFAULTS = {
  // wingsDead: degrees of tilt that do nothing (steady hands); wingsMax: degrees for a full turn.
  little: { duckDrop: 0.18, duckHold: 0.15, leanDeg: 10, freezeK: 3, wingsDead: 8, wingsMax: 30 },
  big: { duckDrop: 0.22, duckHold: 0.1, leanDeg: 10, freezeK: 3, wingsDead: 5, wingsMax: 25 },
};

const CALIBRATE_FULL = 1.5; // seconds, during "Step back so Poppy can see you"
const CALIBRATE_REGAIN = 0.5; // seconds of steady tracking before re-capturing after a loss
const AFTER_LANDING = 0.3; // no duck right after a jump lands
const MIN_JITTER = 0.03; // torso-lengths per second: floor for the measured noise

// The picture is split into three equal parts. A child has to cross a line by ZONE_MARGIN
// before the zone changes, so standing right on a line doesn't flicker between two zones.
const ZONE_LINES = [1 / 3, 2 / 3];
const ZONE_MARGIN = 0.04;

export class MotionInput {
  constructor(video) {
    this.video = video;
    this.mode = null; // 'camera' | 'keyboard' | 'replay'
    this.landmarks = null;
    this.tracking = false;
    this.pose = null;
    this.armsUp = false;
    this.armsDown = true;
    this.zone = 'center';
    this.bodyX = 0.5; // 0 = left edge, 1 = right edge, as the child sees the mirrored picture
    this.duck = false;
    this.lean = null;
    this.stillFor = 0;
    this.wingsOut = false;
    this.wingsTilt = 0;
    this.jumps = 0; // total jumps so far (lets the ?debug panel watch without consuming them)
    this.jumpSensitivity = JUMP_SENSITIVITY.little;
    this.tune = { ...TUNE_DEFAULTS.little };
    // Live numbers for the ?debug panel.
    this.debug = { drop: 0, leanAngle: 0, wingsAngle: 0, speed: 0, stillBelow: 0, jitter: null, calibrating: false, fps: 0, why: '' };

    this._landmarker = null;
    this._lastVideoTime = -1;
    this._lastFrameAt = 0;
    this._jumpQueued = false;
    this._airborne = false;
    this._airTime = 0;
    this._sinceLanding = 9;
    this._sinceDuck = 9; // seconds since the last duck ended
    this._hipBase = null;
    this._duckHeld = 0;
    this._leanHeld = 0;
    this._zoneSteady = 0;
    this._prev = null;
    this._speed = 0;
    this._baseline = null; // { mid, torso }: shoulder-hip midpoint height and torso length, standing
    this._jitter = null;
    this._calib = null;
    this._recording = null;
    this._replay = null;
    this._aspect = 4 / 3;
    this._keys = new Set();

    addEventListener('keydown', e => {
      if (e.target.closest?.('button, input, select, textarea')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          this._jumpQueued = true;
          this.jumps++;
        }
      }
      this._keys.add(e.code);
    });
    addEventListener('keyup', e => this._keys.delete(e.code));
    addEventListener('blur', () => this._keys.clear());
  }

  get camera() { return this.mode === 'camera' || this.mode === 'replay'; }

  setAge(age) {
    this.jumpSensitivity = JUMP_SENSITIVITY[age];
    Object.assign(this.tune, TUNE_DEFAULTS[age]);
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    this.video.srcObject = stream;
    await this.video.play();
    const { PoseLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
    const opts = delegate => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numPoses: 1 });
    try {
      this._landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch {
      this._landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
    }
    this._aspect = (this.video.videoWidth || 640) / (this.video.videoHeight || 480);
    this.mode = 'camera';
  }

  useKeyboard() { this.mode = 'keyboard'; }

  consumeJump() {
    const j = this._jumpQueued;
    this._jumpQueued = false;
    return j;
  }

  // ---- Calibration ---------------------------------------------------------------
  // Collects standing samples, then sets the duck baseline and the freeze noise floor.

  beginCalibration(seconds = CALIBRATE_FULL) {
    this._calib = { seconds, time: 0, mids: [], torsos: [], hips: [], speeds: [] };
    this.debug.calibrating = true;
  }

  get calibrated() { return !!this._baseline; }
  get calibrating() { return !!this._calib; }

  _feedCalibration(mid, torso, hipY, rawSpeed, dt) {
    const c = this._calib;
    c.time += dt;
    c.hips.push(hipY);
    c.mids.push(mid);
    c.torsos.push(torso);
    if (rawSpeed !== null) c.speeds.push(rawSpeed);
    if (c.time < c.seconds) return;
    const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    this._baseline = { mid: median(c.mids), torso: median(c.torsos), hip: median(c.hips) };
    // The quietest quarter of the motion is the camera's own noise, even if the child fidgets.
    if (c.speeds.length > 4) {
      const sorted = [...c.speeds].sort((a, b) => a - b);
      this._jitter = Math.max(MIN_JITTER, sorted[Math.floor(sorted.length * 0.25)]);
    }
    this._calib = null;
    this.debug.calibrating = false;
  }

  // ---- Recording and replay (for testing against real kids) ------------------------

  // Records every processed camera frame for `seconds`, then resolves with the recording.
  record(seconds = 10) {
    return new Promise(resolve => {
      this._recording = { until: seconds, time: 0, frames: [], resolve };
    });
  }

  // Feeds a recording through the detection as if it came from the camera. It calibrates on
  // the first 1.5 s, like the real camera check.
  playRecording(rec, { loop = false } = {}) {
    this.mode = 'replay';
    this._aspect = rec.aspect || 4 / 3;
    this._replay = { rec, loop, clock: 0, next: 0, last: 0, done: false };
    this._resetBody();
    this._baseline = null;
    this.beginCalibration();
  }

  get replayDone() { return !!this._replay?.done; }

  // ---- Per-frame update --------------------------------------------------------------

  update(dt) {
    if (this.mode === 'replay') return this._stepReplay(dt);
    if (this.mode === 'camera') return this._detect();
    const k = this._keys;
    this.tracking = true;
    this.armsUp = k.has('KeyW') || k.has('ArrowUp') || k.has('Digit1');
    this.armsDown = !this.armsUp;
    this.pose = this.armsUp ? 'star' : k.has('Digit2') ? 'bridge' : k.has('Digit3') ? 'moon' : null;
    const left = k.has('ArrowLeft'), right = k.has('ArrowRight');
    this.zone = left === right ? 'center' : left ? 'left' : 'right';
    this.bodyX = { left: 1 / 6, center: 0.5, right: 5 / 6 }[this.zone];
    this.duck = k.has('KeyS') || k.has('ArrowDown');
    const leanL = k.has('KeyA'), leanR = k.has('KeyD');
    this.lean = leanL === leanR ? null : leanL ? 'left' : 'right';
    this.stillFor = k.size ? 0 : this.stillFor + dt;
    // Wings on the keyboard: always "out"; ← / → bank, easing in over about a quarter second.
    this.wingsOut = true;
    const want = left === right ? 0 : left ? -1 : 1;
    this.wingsTilt += (want - this.wingsTilt) * (1 - Math.exp(-dt / 0.12));
  }

  _detect() {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = v.currentTime;
    const now = performance.now();
    const dt = this._lastFrameAt ? Math.min(0.2, (now - this._lastFrameAt) / 1000) : 1 / 30;
    this._lastFrameAt = now;
    const lm = this._landmarker.detectForVideo(v, now).landmarks?.[0] ?? null;
    if (this._recording) this._record(lm, dt);
    this._process(lm, dt);
  }

  _record(lm, dt) {
    const r = this._recording;
    r.time += dt;
    r.frames.push({ t: +r.time.toFixed(4), lm: lm ? lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.z ?? 0).toFixed(4), +(p.visibility ?? 1).toFixed(3)]) : null });
    if (r.time >= r.until) {
      this._recording = null;
      r.resolve({ version: 1, aspect: this._aspect, recordedAt: new Date().toISOString(), frames: r.frames });
    }
  }

  _stepReplay(dt) {
    const rp = this._replay;
    if (!rp || rp.done) return;
    rp.clock += dt;
    const frames = rp.rec.frames;
    while (rp.next < frames.length && frames[rp.next].t <= rp.clock) {
      const f = frames[rp.next++];
      const lm = f.lm ? f.lm.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
      this._process(lm, Math.max(1 / 120, f.t - rp.last));
      rp.last = f.t;
    }
    if (rp.next >= frames.length) {
      if (rp.loop) Object.assign(rp, { clock: 0, next: 0, last: 0 });
      else rp.done = true;
    }
  }

  _resetBody() {
    this.tracking = false;
    this._hipBase = null;
    this._prev = null;
    this.pose = null;
    this.armsUp = false;
    this.duck = false;
    this.lean = null;
    this.stillFor = 0;
    this.wingsOut = false;
    this.wingsTilt = 0;
    this._duckHeld = 0;
    this._leanHeld = 0;
    this._airborne = false;
  }

  _updateZone(x, dt) {
    const before = this.zone;
    this.bodyX = x;
    const [a, b] = ZONE_LINES;
    const m = ZONE_MARGIN;
    if (this.zone === 'left') { if (x > a + m) this.zone = x > b + m ? 'right' : 'center'; }
    else if (this.zone === 'right') { if (x < b - m) this.zone = x < a - m ? 'left' : 'center'; }
    else if (x < a - m) this.zone = 'left';
    else if (x > b + m) this.zone = 'right';
    this._zoneSteady = this.zone === before ? this._zoneSteady + dt : 0;
  }

  // ---- Detection: one frame of landmarks -----------------------------------------------

  _process(lm, dt) {
    this.landmarks = lm;
    this.debug.fps += (1 / dt - this.debug.fps) * (1 - Math.exp(-dt / 1)); // body frames per second
    if (!lm || ![11, 12, 23, 24].every(i => visible(lm[i]))) {
      // Why tracking is off, for the ?debug panel: usually the child is too close to the camera.
      this.debug.why = !lm ? 'no one in view'
        : ![23, 24].every(i => visible(lm[i])) ? 'hips not in view: step back'
        : 'shoulders not in view';
      if (this.tracking) this._resetBody();
      return;
    }
    this.debug.why = '';
    const regained = !this.tracking;
    this.tracking = true;
    const T = this.tune;

    // Mirrored x (the child's own left is on the left) and image y (grows downward).
    const mx = p => 1 - p.x;
    const shoulder = { x: (mx(lm[11]) + mx(lm[12])) / 2, y: (lm[11].y + lm[12].y) / 2 };
    const hip = { x: (mx(lm[23]) + mx(lm[24])) / 2, y: (lm[23].y + lm[24].y) / 2 };
    const torso = Math.max(0.05, Math.hypot((shoulder.x - hip.x) * this._aspect, shoulder.y - hip.y));
    const mid = (shoulder.y + hip.y) / 2;

    // Zone from the hips only, so leaning or waving arms never changes lane.
    this._updateZone(hip.x, dt);

    // Motion (for freeze): mean movement of the visible joints, in torso-lengths per second.
    let rawSpeed = null;
    if (this._prev) {
      let sum = 0, n = 0;
      for (const i of MOTION_POINTS) {
        const a = lm[i], b = this._prev[i];
        if (!visible(a) || !visible(b)) continue;
        sum += Math.hypot((a.x - b.x) * this._aspect, a.y - b.y);
        n++;
      }
      if (n >= 4) rawSpeed = sum / n / torso / dt;
    }
    this._prev = lm;
    if (rawSpeed !== null) this._speed += (rawSpeed - this._speed) * (1 - Math.exp(-dt / 0.2));

    // (Re)capture the standing baseline: on request, or after tracking comes back.
    if (regained && this._baseline && !this._calib) this.beginCalibration(CALIBRATE_REGAIN);
    if (!this._baseline && !this._calib) this.beginCalibration(CALIBRATE_REGAIN);
    if (this._calib) this._feedCalibration(mid, torso, hip.y, rawSpeed, dt);
    const base = this._baseline;

    // Jump: hips rise well above their standing height. While crouching or ducking, that
    // reference stays at standing height (it doesn't follow the hips down), so standing back up
    // from a squat isn't a jump, but a real jump straight out of a crouch still is.
    this._sinceDuck = this.duck ? 0 : this._sinceDuck + dt;
    if (this._hipBase === null) this._hipBase = base?.hip ?? hip.y;
    const crouching = this.duck || this._duckHeld > 0;
    if (crouching && base && this._hipBase > base.hip) this._hipBase = base.hip;
    const rise = (this._hipBase - hip.y) / torso;
    if (!this._airborne) {
      this._sinceLanding += dt;
      if (rise > this.jumpSensitivity) {
        this._airborne = true;
        this._airTime = 0;
        this._jumpQueued = true;
        this.jumps++;
      } else if (!crouching && hip.y < this._hipBase + torso * this.tune.duckDrop * 0.5) {
        this._hipBase += (hip.y - this._hipBase) * (1 - Math.exp(-dt / 0.6));
      }
    } else {
      this._airTime += dt;
      if (rise < this.jumpSensitivity * 0.4 || this._airTime > 1.2) {
        if (this._airTime > 1.2) this._hipBase = hip.y;
        this._airborne = false;
        this._sinceLanding = 0;
      }
    }

    // Arm gestures, measured relative to the shoulders and scaled by torso length.
    const arm = (w, s) => {
      if (!visible(lm[w])) return 'unknown';
      const dy = (lm[w].y - lm[s].y) / torso;
      const dx = Math.abs(lm[w].x - lm[s].x) * this._aspect / torso;
      if (dy < -0.45) return 'up';
      if (Math.abs(dy) < 0.4 && dx > 0.6) return 'out';
      if (dy > 0.2) return 'down';
      return 'mid';
    };
    const L = arm(15, 11);
    const Rt = arm(16, 12);
    this.armsUp = L === 'up' && Rt === 'up';
    this.armsDown = L !== 'up' && Rt !== 'up' && (L === 'down' || Rt === 'down');
    if (this.armsUp) this.pose = 'star';
    else if (L === 'out' && Rt === 'out') this.pose = 'bridge';
    else if ((L === 'up') !== (Rt === 'up')) this.pose = 'moon';
    else this.pose = null;

    // Wings: both wrists out wide from the body (a tilted "bridge"), and the angle of the line
    // between them, like a plane's wings. Mirrored, so the child's own left hand lower = bank
    // left. A dead zone keeps wobbly arms from steering; smoothed so the ship doesn't jitter.
    const wl = lm[15], wr = lm[16];
    let tiltTarget = 0;
    const wasOut = this.wingsOut;
    if (visible(wl) && visible(wr)) {
      const lx = mx(wl), rx = mx(wr);
      const spread = Math.abs(rx - lx) * this._aspect / torso;
      const high = Math.max((wl.y - shoulder.y) / torso, (wr.y - shoulder.y) / torso); // the lower hand
      this.wingsOut = spread > (wasOut ? 1.3 : 1.6) && high < 0.9 && !this.armsUp;
      if (this.wingsOut) {
        // Left hand (screen-left point) lower than the right = negative angle = steer left.
        const left = lx < rx ? wl : wr, right = lx < rx ? wr : wl;
        const deg = Math.atan2(right.y - left.y, Math.abs(rx - lx) * this._aspect) * 180 / Math.PI;
        this.debug.wingsAngle = deg;
        const mag = Math.max(0, Math.abs(deg) - T.wingsDead) / Math.max(1, T.wingsMax - T.wingsDead);
        tiltTarget = Math.sign(deg) * Math.min(1, mag);
      }
    } else {
      this.wingsOut = false;
    }
    this.wingsTilt += (tiltTarget - this.wingsTilt) * (1 - Math.exp(-dt / 0.1));

    // Duck: the shoulder-hip midpoint drops below the standing baseline. Releases at 60% of
    // the trigger, so it doesn't flicker. Never while airborne or just after landing.
    const drop = base ? (mid - base.mid) / base.torso : 0;
    this.debug.drop = drop;
    const duckAllowed = base && !this._airborne && this._sinceLanding >= AFTER_LANDING;
    if (!duckAllowed) {
      this.duck = false;
      this._duckHeld = 0;
    } else if (this.duck) {
      if (drop < T.duckDrop * 0.6) this.duck = false;
    } else {
      this._duckHeld = drop > T.duckDrop ? this._duckHeld + dt : 0;
      if (this._duckHeld >= T.duckHold) this.duck = true;
    }

    // Lean: the torso axis (hips to shoulders) tilts from vertical while the hips stay in one
    // zone. Ignored while the arms are up or a pose is held. Releases at 60% of the angle.
    const angle = Math.atan2((shoulder.x - hip.x) * this._aspect, hip.y - shoulder.y) * 180 / Math.PI;
    this.debug.leanAngle = angle;
    const leanAllowed = !this.armsUp && !this.pose && this._zoneSteady >= 0.3 && !this.duck;
    if (!leanAllowed) {
      this.lean = null;
      this._leanHeld = 0;
    } else if (this.lean) {
      const still = this.lean === 'right' ? angle : -angle;
      if (still < T.leanDeg * 0.6) this.lean = null;
    } else {
      this._leanHeld = Math.abs(angle) > T.leanDeg ? this._leanHeld + dt : 0;
      if (this._leanHeld >= 0.1) this.lean = angle > 0 ? 'right' : 'left';
    }

    // Freeze: smoothed motion below k times the camera's own noise (measured at calibration).
    const floor = (this._jitter ?? MIN_JITTER) * T.freezeK;
    Object.assign(this.debug, { speed: this._speed, stillBelow: floor, jitter: this._jitter });
    this.stillFor = this._speed < floor && !this._airborne ? this.stillFor + dt : 0;

    // Baseline drift: only while standing calmly, and slowly (about 4 s to follow a change).
    if (base && !this._calib && !this.duck && !this._airborne && this._sinceDuck > 1 && this._sinceLanding > 1
      && this._speed < floor * 2 && Math.abs(drop) < T.duckDrop * 0.5) {
      const k = 1 - Math.exp(-dt / 4);
      base.mid += (mid - base.mid) * k;
      base.torso += (torso - base.torso) * k;
      base.hip += (hip.y - base.hip) * k;
    }
  }

  // ---- Drawing -------------------------------------------------------------------------

  // `zones` draws the three-part split; `target` ('left' | 'center' | 'right') lights one part
  // up; `guides` draws the duck baseline and trigger lines (for the ?debug panel).
  drawPreview(canvas, { zones = false, target = null, guides = false } = {}) {
    const c = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    c.save();
    c.fillStyle = '#0b0e1d';
    c.fillRect(0, 0, w, h);
    c.translate(w, 0);
    c.scale(-1, 1);
    if (this.mode === 'camera' && this.video.readyState >= 2) {
      c.globalAlpha = 0.85;
      c.drawImage(this.video, 0, 0, w, h);
      c.globalAlpha = 1;
    }
    const lm = this.landmarks;
    if (lm && this.tracking) {
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.lineWidth = 5;
      c.lineCap = 'round';
      for (const [a, b] of SKELETON) {
        if (!visible(lm[a]) || !visible(lm[b])) continue;
        c.beginPath();
        c.moveTo(lm[a].x * w, lm[a].y * h);
        c.lineTo(lm[b].x * w, lm[b].y * h);
        c.stroke();
      }
      if (visible(lm[0])) {
        c.beginPath();
        c.arc(lm[0].x * w, lm[0].y * h, 14, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
    if (zones) this._drawZones(c, w, h, target);
    if (guides && this._baseline) {
      const line = (y, color) => {
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, y * h);
        c.lineTo(w, y * h);
        c.stroke();
      };
      line(this._baseline.mid, 'rgba(143, 240, 255, 0.8)');
      line(this._baseline.mid + this.tune.duckDrop * this._baseline.torso, 'rgba(255, 212, 71, 0.9)');
    }
  }

  // Drawn after the mirror flip is undone, so 'left' really is on the left.
  _drawZones(c, w, h, target) {
    const parts = ['left', 'center', 'right'];
    const edges = [0, ...ZONE_LINES, 1];
    parts.forEach((zone, i) => {
      const x0 = edges[i] * w, x1 = edges[i + 1] * w;
      if (zone === target) {
        c.fillStyle = 'rgba(255, 212, 71, 0.28)';
        c.fillRect(x0, 0, x1 - x0, h);
      }
      if (this.tracking && zone === this.zone) {
        c.fillStyle = 'rgba(143, 240, 255, 0.22)';
        c.fillRect(x0, 0, x1 - x0, h);
      }
    });
    c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    c.lineWidth = 2;
    c.setLineDash([8, 8]);
    for (const x of ZONE_LINES) {
      c.beginPath();
      c.moveTo(x * w, 0);
      c.lineTo(x * w, h);
      c.stroke();
    }
    c.setLineDash([]);
  }
}
