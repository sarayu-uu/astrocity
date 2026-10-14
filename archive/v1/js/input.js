// Turns a child's body (via the webcam) or the keyboard into simple game signals:
//   consumeJump()  - true once per detected jump
//   energy         - how much the body is moving, in torso-lengths per second (smoothed)
//   tracking       - whether a body is currently visible
//
// Uses MediaPipe Pose Landmarker, which runs fully in the browser; no video leaves the device.

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Landmarks used to measure overall movement: nose, shoulders, elbows, wrists, hips, knees, ankles.
const MOTION_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const SKELETON = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28]];

// Movement is compared against the pose from this long ago. A longer window than one
// frame keeps landmark jitter from looking like dancing.
const MOTION_WINDOW_MS = 250;

const JUMP_SENSITIVITY = { little: 0.10, big: 0.16 }; // hip rise, as a fraction of torso length
const DANCE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'KeyD']);

const visible = p => p && (p.visibility ?? 1) > 0.5;

export class MotionInput {
  constructor(video) {
    this.video = video;
    this.camera = false;
    this.landmarks = null;
    this.tracking = false;
    this.energy = 0;
    this.debug = false;
    this.jumpSensitivity = JUMP_SENSITIVITY.little;

    this._landmarker = null;
    this._lastVideoTime = -1;
    this._jumpQueued = false;
    this._airborne = false;
    this._airTime = 0;
    this._hipBase = null;
    this._history = [];
    this._danceKeys = new Set();
    this._mouseMotion = 0;

    addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (!e.repeat) this._jumpQueued = true;
      }
      if (DANCE_KEYS.has(e.code)) this._danceKeys.add(e.code);
      if (e.key === '?') this.debug = !this.debug;
    });
    addEventListener('keyup', e => this._danceKeys.delete(e.code));
    addEventListener('blur', () => this._danceKeys.clear());
    addEventListener('mousemove', () => { this._mouseMotion = 0.15; });
  }

  setAge(age) {
    this.jumpSensitivity = JUMP_SENSITIVITY[age];
  }

  async startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    const { PoseLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
    const options = delegate => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    try {
      this._landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      this._landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
    }
    this.camera = true;
  }

  consumeJump() {
    const jumped = this._jumpQueued;
    this._jumpQueued = false;
    return jumped;
  }

  update(dt) {
    if (this.camera) {
      this._detect(dt);
      return;
    }
    // Keyboard mode: holding a dance key or wiggling the mouse counts as dancing.
    this._mouseMotion = Math.max(0, this._mouseMotion - dt);
    const moving = this._danceKeys.size > 0 || this._mouseMotion > 0;
    this.energy += ((moving ? 2 : 0) - this.energy) * Math.min(1, dt * 10);
  }

  _detect(dt) {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = v.currentTime;

    const now = performance.now();
    const lm = this._landmarker.detectForVideo(v, now).landmarks?.[0];
    this.landmarks = lm || null;

    if (!lm || ![11, 12, 23, 24].every(i => visible(lm[i]))) {
      this.tracking = false;
      this._history = [];
      this._hipBase = null;
      this.energy *= 0.8;
      return;
    }
    this.tracking = true;

    const shoulderY = (lm[11].y + lm[12].y) / 2;
    const hipY = (lm[23].y + lm[24].y) / 2;
    const torso = Math.max(0.05, hipY - shoulderY);

    // Jump: hips rise well above their recent resting height. (Image y grows downward.)
    if (this._hipBase === null) this._hipBase = hipY;
    const rise = (this._hipBase - hipY) / torso;
    if (!this._airborne) {
      if (rise > this.jumpSensitivity) {
        this._airborne = true;
        this._airTime = 0;
        this._jumpQueued = true;
      } else {
        this._hipBase += (hipY - this._hipBase) * 0.05;
      }
    } else {
      this._airTime += dt;
      // Land when hips come back down; if they never do (child stepped back), re-baseline.
      if (rise < this.jumpSensitivity * 0.4 || this._airTime > 1.2) {
        this._airborne = false;
        if (this._airTime > 1.2) this._hipBase = hipY;
      }
    }

    // Energy: average landmark travel over the last ~250ms, normalised by torso size.
    this._history.push({ t: now, pts: lm.map(p => ({ x: p.x, y: p.y, vis: visible(p) })) });
    while (this._history.length > 2 && this._history[1].t <= now - MOTION_WINDOW_MS) this._history.shift();
    const ref = this._history[0];
    const span = (now - ref.t) / 1000;
    if (span > 0.1) {
      let sum = 0;
      let count = 0;
      for (const i of MOTION_POINTS) {
        const a = lm[i];
        const b = ref.pts[i];
        if (!visible(a) || !b.vis) continue;
        sum += Math.hypot(a.x - b.x, a.y - b.y);
        count++;
      }
      if (count) {
        const instant = sum / count / torso / span;
        this.energy += (instant - this.energy) * 0.3;
      }
    }
  }

  drawPreview(canvas, chip) {
    const c = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    c.save();
    c.translate(w, 0);
    c.scale(-1, 1); // mirror, so moving left moves left on screen
    if (this.video.readyState >= 2) c.drawImage(this.video, 0, 0, w, h);
    const lm = this.landmarks;
    if (lm && this.tracking) {
      c.strokeStyle = '#7ED957';
      c.lineWidth = 4;
      c.lineCap = 'round';
      for (const [a, b] of SKELETON) {
        if (!visible(lm[a]) || !visible(lm[b])) continue;
        c.beginPath();
        c.moveTo(lm[a].x * w, lm[a].y * h);
        c.lineTo(lm[b].x * w, lm[b].y * h);
        c.stroke();
      }
    }
    c.restore();
    if (this.debug) {
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(0, h - 28, w, 28);
      c.fillStyle = '#fff';
      c.font = 'bold 16px system-ui';
      c.fillText(`energy ${this.energy.toFixed(2)}  airborne ${this._airborne}`, 8, h - 9);
    }
    chip.textContent = this.tracking ? 'I can see you!' : 'Step into view';
    chip.classList.toggle('ok', this.tracking);
  }
}
