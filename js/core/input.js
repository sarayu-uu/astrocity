// Turns the child's body (webcam + MediaPipe Pose, all on-device) or the keyboard into a few
// reliable signals:
//   consumeJump()  true once per real jump
//   pose           'star' (both arms up) | 'bridge' (arms out wide) | 'moon' (one arm up) | null
//   armsUp / armsDown
//   zone           'left' | 'center' | 'right': which third of the (mirrored) camera picture
//                  the child's body is in, so "left" is the child's own left
//   tracking       a body is in view
// The laptop-camera MVP deliberately sticks to these; no continuous full-body steering.

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const SKELETON = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const JUMP_SENSITIVITY = { little: 0.1, big: 0.15 }; // hip rise, in torso-lengths
const visible = p => p && (p.visibility ?? 1) > 0.5;

// The picture is split into three equal parts. A child has to cross a line by ZONE_MARGIN
// before the zone changes, so standing right on a line doesn't flicker between two zones.
const ZONE_LINES = [1 / 3, 2 / 3];
const ZONE_MARGIN = 0.04;

export class MotionInput {
  constructor(video) {
    this.video = video;
    this.mode = null; // 'camera' | 'keyboard'
    this.landmarks = null;
    this.tracking = false;
    this.pose = null;
    this.armsUp = false;
    this.armsDown = true;
    this.zone = 'center';
    this.bodyX = 0.5; // 0 = left edge, 1 = right edge, as the child sees the mirrored picture
    this.jumpSensitivity = JUMP_SENSITIVITY.little;

    this._landmarker = null;
    this._lastVideoTime = -1;
    this._jumpQueued = false;
    this._airborne = false;
    this._airTime = 0;
    this._hipBase = null;
    this._keys = new Set();

    addEventListener('keydown', e => {
      if (e.target.closest?.('button')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this._jumpQueued = true;
      }
      this._keys.add(e.code);
    });
    addEventListener('keyup', e => this._keys.delete(e.code));
    addEventListener('blur', () => this._keys.clear());
  }

  get camera() { return this.mode === 'camera'; }

  setAge(age) { this.jumpSensitivity = JUMP_SENSITIVITY[age]; }

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
    this.mode = 'camera';
  }

  useKeyboard() { this.mode = 'keyboard'; }

  consumeJump() {
    const j = this._jumpQueued;
    this._jumpQueued = false;
    return j;
  }

  update(dt) {
    if (this.camera) {
      this._detect(dt);
      return;
    }
    const k = this._keys;
    this.tracking = true;
    this.armsUp = k.has('KeyW') || k.has('ArrowUp') || k.has('Digit1');
    this.armsDown = !this.armsUp;
    this.pose = this.armsUp ? 'star' : k.has('Digit2') ? 'bridge' : k.has('Digit3') ? 'moon' : null;
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    this.zone = left === right ? 'center' : left ? 'left' : 'right';
    this.bodyX = { left: 1 / 6, center: 0.5, right: 5 / 6 }[this.zone];
  }

  _updateZone(x) {
    this.bodyX = x;
    const [a, b] = ZONE_LINES;
    const m = ZONE_MARGIN;
    if (this.zone === 'left') { if (x > a + m) this.zone = x > b + m ? 'right' : 'center'; }
    else if (this.zone === 'right') { if (x < b - m) this.zone = x < a - m ? 'left' : 'center'; }
    else if (x < a - m) this.zone = 'left';
    else if (x > b + m) this.zone = 'right';
  }

  _detect(dt) {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = v.currentTime;
    const lm = this._landmarker.detectForVideo(v, performance.now()).landmarks?.[0];
    this.landmarks = lm || null;

    if (!lm || ![11, 12, 23, 24].every(i => visible(lm[i]))) {
      this.tracking = false;
      this._hipBase = null;
      this.pose = null;
      this.armsUp = false;
      return;
    }
    this.tracking = true;

    // Left / centre / right: the middle of the shoulders and hips, flipped to match the mirror.
    this._updateZone(1 - (lm[11].x + lm[12].x + lm[23].x + lm[24].x) / 4);

    const shoulderY = (lm[11].y + lm[12].y) / 2;
    const hipY = (lm[23].y + lm[24].y) / 2;
    const torso = Math.max(0.05, hipY - shoulderY);

    // Jump: hips rise well above their resting height (image y grows downward).
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
      if (rise < this.jumpSensitivity * 0.4 || this._airTime > 1.2) {
        if (this._airTime > 1.2) this._hipBase = hipY;
        this._airborne = false;
      }
    }

    // Arm gestures, measured relative to the shoulders and scaled by torso length.
    const arm = (w, s) => {
      if (!visible(lm[w])) return 'unknown';
      const dy = (lm[w].y - lm[s].y) / torso;
      const dx = Math.abs(lm[w].x - lm[s].x) / torso;
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
  }

  // `zones` draws the three-part split; `target` ('left' | 'center' | 'right') lights one part up.
  drawPreview(canvas, { zones = false, target = null } = {}) {
    const c = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    c.save();
    c.clearRect(0, 0, w, h);
    c.translate(w, 0);
    c.scale(-1, 1);
    if (this.video.readyState >= 2) {
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
