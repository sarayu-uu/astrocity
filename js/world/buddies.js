// The five buddies as soft 3D plush figures, plus the little animation brain that makes them
// walk, hop, dance, nap and pose. Feet sit at y = 0; a buddy is ~1.5 units tall.

import * as THREE from 'three';

export const CAST = {
  poppy: { name: 'Poppy', color: '#ff6f9c', body: '#ff6f9c', face: '#ffd8c6', accent: '#ff4d86', voice: { pitch: 1.6, rate: 1.05 } },
  nutty: { name: 'Nutty', color: '#ffc93c', body: '#ffc93c', face: '#ffe8ad', accent: '#8a5a2b', voice: { pitch: 1.15, rate: 0.95 } },
  lumi: { name: 'Lumi', color: '#5ec3ff', body: '#5ec3ff', face: '#dcf2ff', accent: '#8fd6ff', voice: { pitch: 1.35, rate: 1.1 } },
  mimi: { name: 'Mimi', color: '#b28cff', body: '#a982f5', face: '#efe4ff', accent: '#c7abff', voice: { pitch: 1.7, rate: 1.05 } },
  zuzu: { name: 'Zuzu', color: '#7fd35a', body: '#7fd35a', face: '#e8f8d9', accent: '#a8e585', voice: { pitch: 0.8, rate: 0.85 } },
};

const SPHERE = new THREE.SphereGeometry(1, 40, 28);

// Fine fibre noise, used as a bump map so the plush reads as felt rather than plastic.
const fuzz = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 145;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
})();

const plushCache = new Map();
export function plush(color) {
  if (!plushCache.has(color)) {
    const c = new THREE.Color(color);
    plushCache.set(color, new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.45,
      sheenColor: c.clone().lerp(new THREE.Color('#ffffff'), 0.55),
      bumpMap: fuzz,
      bumpScale: 0.6,
    }));
  }
  return plushCache.get(color);
}

const EYE = new THREE.MeshPhysicalMaterial({ color: '#0d0f1c', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
const GLINT = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const CHEEK = new THREE.MeshStandardMaterial({ color: '#ff8fae', roughness: 1, transparent: true, opacity: 0.75 });
const MOUTH = new THREE.MeshStandardMaterial({ color: '#4a1f2e', roughness: 0.6 });

function part(mat, pos, scale, rot) {
  const m = new THREE.Mesh(SPHERE, mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  if (rot) m.rotation.set(...rot, 'YXZ');
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
function dampAngle(a, b, rate, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
}

// Arm spread presets (radians away from the body).
const ARMS = { rest: 0.35, out: 1.5, up: 2.6 };

export class Buddy {
  constructor(kind) {
    const P = CAST[kind];
    this.kind = kind;
    this.name = P.name;
    this.color = P.color;
    this.state = 'idle';
    this.heading = 0;
    this.speed = 2.4;
    this.target = null;
    this.hopping = null;
    this.talking = false;
    this.pose = null;
    this.t = Math.random() * 10;
    this.phase = 0;
    this.blinkIn = 2 + Math.random() * 3;
    this.landSquash = 0;

    this.root = new THREE.Group();
    this.root.userData.buddy = this;
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    const bodyM = plush(P.body);
    const faceM = plush(P.face);

    this.body = part(bodyM, [0, 0.37, 0], [0.31, 0.33, 0.28]);
    this.legL = part(bodyM, [-0.13, 0.09, 0.03], [0.12, 0.1, 0.14]);
    this.legR = part(bodyM, [0.13, 0.09, 0.03], [0.12, 0.1, 0.14]);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.25, 0.52, 0);
    this.armR.position.set(0.25, 0.52, 0);
    this.armL.add(part(bodyM, [0, -0.12, 0], [0.085, 0.15, 0.085]));
    this.armR.add(part(bodyM, [0, -0.12, 0], [0.085, 0.15, 0.085]));
    this.armL.rotation.z = -ARMS.rest;
    this.armR.rotation.z = ARMS.rest;
    this.hands = new THREE.Group();
    this.hands.position.set(0, 0.42, 0.34);
    this.rig.add(this.body, this.legL, this.legR, this.armL, this.armR, this.hands);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.98, 0);
    this.rig.add(this.head);
    this.head.add(part(bodyM, [0, 0, 0], [0.5, 0.46, 0.46]));
    this.head.add(part(faceM, [0, -0.05, 0.24], [0.36, 0.3, 0.24]));

    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.14, 0, 0.44);
      eye.add(part(EYE, [0, 0, 0], [0.075, 0.095, 0.05]));
      eye.add(part(GLINT, [0.026, 0.036, 0.045], [0.022, 0.024, 0.01]));
      eye.add(part(GLINT, [-0.02, -0.035, 0.045], [0.011, 0.011, 0.006]));
      this.head.add(eye);
      this.eyes.push(eye);
      this.head.add(part(CHEEK, [s * 0.24, -0.12, 0.4], [0.065, 0.04, 0.03]));
    }
    this.head.add(part(plush(P.body), [0, -0.07, 0.475], [0.026, 0.019, 0.02]));

    this.smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20, Math.PI), MOUTH);
    this.smile.position.set(0, -0.125, 0.468);
    this.smile.rotation.z = Math.PI;
    this.open = part(MOUTH, [0, -0.145, 0.462], [0.034, 0.04, 0.02]);
    this.open.visible = false;
    this.head.add(this.smile, this.open);

    HEADS[kind](this.head, P);

    // Things that float above the head: "has something to say", and sleepy Zzz.
    this.badge = makeBadge();
    this.badge.position.set(0, 1.9, 0);
    this.badge.visible = false;
    this.root.add(this.badge);
    this.zzz = [];
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  place(x, z, y = 0) {
    this.root.position.set(x, y, z);
    this.target = null;
    return this;
  }

  face(x, z) {
    this.heading = Math.atan2(x - this.x, z - this.z);
  }

  faceNow(x, z) {
    this.face(x, z);
    this.root.rotation.y = this.heading;
  }

  walkTo(x, z, speed = 2.4) {
    this.speed = speed;
    return new Promise(resolve => { this.target = { x, z, resolve }; });
  }

  async walkPath(points, speed) {
    for (const [x, z] of points) await this.walkTo(x, z, speed);
  }

  // Hop to a (possibly moving) point. `to` may be a Vector3 or a function returning one.
  hop(to, height = 1.2, duration = 0.6) {
    this.target = null;
    return new Promise(resolve => {
      this.hopping = { from: this.root.position.clone(), to, height, duration, t: 0, resolve };
    });
  }

  hold(object) {
    this.hands.add(object);
    object.position.set(0, 0, 0);
  }

  update(dt, camera) {
    this.t += dt;
    const t = this.t;
    let walking = false;

    if (this.target) {
      const dx = this.target.x - this.x;
      const dz = this.target.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) {
        const r = this.target.resolve;
        this.target = null;
        r();
      } else {
        const step = Math.min(dist, this.speed * dt);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        this.heading = Math.atan2(dx, dz);
        walking = true;
      }
    }

    if (this.hopping) {
      const h = this.hopping;
      h.t += dt / h.duration;
      const k = Math.min(1, h.t);
      const to = typeof h.to === 'function' ? h.to() : h.to;
      this.root.position.lerpVectors(h.from, to, k);
      this.root.position.y += Math.sin(k * Math.PI) * h.height;
      const dx = to.x - h.from.x;
      const dz = to.z - h.from.z;
      if (Math.hypot(dx, dz) > 0.2) this.heading = Math.atan2(dx, dz);
      if (k >= 1) {
        this.hopping = null;
        this.landSquash = 0.22;
        h.resolve();
      }
    }

    this.root.rotation.y = dampAngle(this.root.rotation.y, this.heading, 10, dt);

    // Pose the rig. Each state sets targets; everything eases toward them.
    let bob = 0, tiltZ = 0, tiltX = 0, squash = 0, lift = 0;
    let armL = ARMS.rest, armR = ARMS.rest, armFwdL = 0, armFwdR = 0;
    let legSwing = 0;
    let mouthOpen = false;
    let eyesClosed = false;

    if (walking) {
      this.phase += dt * this.speed * 5.5;
      bob = Math.abs(Math.sin(this.phase)) * 0.07;
      tiltZ = Math.sin(this.phase) * 0.08;
      legSwing = Math.sin(this.phase) * 0.07;
      armFwdL = Math.sin(this.phase) * 0.5;
      armFwdR = -Math.sin(this.phase) * 0.5;
    } else if (this.hopping || this.airborne) {
      armL = armR = ARMS.up * 0.85;
      squash = -0.08;
    } else {
      switch (this.state) {
        case 'idle':
          squash = Math.sin(t * 2.2) * 0.015;
          tiltZ = Math.sin(t * 0.7) * 0.03;
          break;
        case 'dance':
          bob = Math.abs(Math.sin(t * 6.5)) * 0.14;
          tiltZ = Math.sin(t * 3.25) * 0.22;
          armL = Math.sin(t * 3.25) > 0 ? ARMS.up : ARMS.out * 0.7;
          armR = Math.sin(t * 3.25) > 0 ? ARMS.out * 0.7 : ARMS.up;
          this.heading += dt * (Math.sin(t * 0.8) > 0.6 ? 6 : 0);
          break;
        case 'sleep':
          tiltX = -1.42;
          lift = 0.27;
          squash = Math.sin(t * 1.4) * 0.025;
          eyesClosed = true;
          armL = armR = 0.9;
          break;
        case 'work':
          tiltX = 0.18;
          armFwdR = -1.2 + Math.max(0, Math.sin(t * 7)) * 1.1;
          armFwdL = -0.7;
          bob = Math.max(0, -Math.sin(t * 7)) * 0.02;
          break;
        case 'eat':
          armFwdL = armFwdR = -1.35;
          armL = armR = 0.05;
          mouthOpen = Math.sin(t * 9) > 0;
          squash = Math.sin(t * 9) * 0.02;
          break;
        case 'pull': {
          // Heave-ho on something stuck at her feet: bend down with both hands on it, then throw
          // her weight back, straining (eyes squeezed, mouth open), and again.
          const heave = Math.max(0, Math.sin(t * 4.2)); // 0 = reaching down, 1 = leaning back
          tiltX = 0.42 - heave * 0.85;
          lift = -0.07 + heave * 0.04;
          squash = 0.06 - heave * 0.1;
          armFwdL = armFwdR = -1.35 + heave * 0.25;
          armL = armR = 0.06;
          tiltZ = Math.sin(t * 23) * 0.035 * heave;
          mouthOpen = heave > 0.3;
          eyesClosed = heave > 0.6;
          legSwing = heave * 0.06;
          break;
        }
        case 'cheer':
          bob = Math.abs(Math.sin(t * 8)) * 0.3;
          armL = armR = ARMS.up;
          mouthOpen = true;
          break;
        case 'scared':
          tiltZ = Math.sin(t * 40) * 0.025;
          armFwdL = armFwdR = -0.6;
          armL = armR = 0.15;
          break;
        case 'wave':
          armR = 2.5 + Math.sin(t * 11) * 0.35;
          tiltZ = Math.sin(t * 5.5) * 0.06;
          break;
        case 'hug':
          armFwdL = armFwdR = -1.3;
          armL = armR = -0.25;
          squash = 0.04;
          break;
        case 'sit':
          lift = -0.08;
          tiltX = -0.25;
          armL = armR = 0.6;
          break;
        case 'pose':
          armL = this.pose?.[0] ?? ARMS.rest;
          armR = this.pose?.[1] ?? ARMS.rest;
          break;
        // Running on the spot (the runner moves the world instead). `runRate` sets the pace.
        case 'run':
          this.phase += dt * (this.runRate ?? 1) * 14;
          bob = Math.abs(Math.sin(this.phase)) * 0.12;
          tiltX = 0.12;
          legSwing = Math.sin(this.phase) * 0.12;
          armFwdL = Math.sin(this.phase) * 0.9;
          armFwdR = -Math.sin(this.phase) * 0.9;
          break;
        case 'duck':
          squash = 0.32;
          lift = -0.05;
          tiltX = 0.25;
          armL = armR = 0.9;
          break;
        case 'stumble':
          tiltX = 0.45 + Math.sin(t * 18) * 0.12;
          tiltZ = Math.sin(t * 23) * 0.12;
          armL = armR = ARMS.out;
          mouthOpen = true;
          break;
      }
    }

    this.landSquash = damp(this.landSquash, 0, 9, dt);
    squash += this.landSquash;
    this.rig.position.y = damp(this.rig.position.y, bob + lift, 18, dt);
    this.rig.rotation.x = damp(this.rig.rotation.x, tiltX, 8, dt);
    this.rig.rotation.z = damp(this.rig.rotation.z, tiltZ, 10, dt);
    this.rig.scale.set(1 + squash, 1 - squash, 1 + squash);
    this.armL.rotation.z = damp(this.armL.rotation.z, -armL, 12, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, armR, 12, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, armFwdL, 12, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armFwdR, 12, dt);
    this.legL.position.z = 0.03 + legSwing;
    this.legR.position.z = 0.03 - legSwing;
    this.head.rotation.z = damp(this.head.rotation.z, walking ? 0 : Math.sin(t * 0.9) * 0.05, 4, dt);

    // Blinking, talking.
    this.blinkIn -= dt;
    if (this.blinkIn < -0.12) this.blinkIn = 2 + Math.random() * 3.5;
    const shut = eyesClosed || this.blinkIn < 0;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, shut ? 0.12 : 1, 30, dt);
    if (this.talking) mouthOpen = Math.sin(t * 22) > -0.2;
    this.open.visible = mouthOpen;
    this.smile.visible = !mouthOpen;

    if (this.badge.visible) {
      this.badge.position.y = 1.95 + Math.sin(t * 3) * 0.06;
    }

    if (this.state === 'sleep' && !walking) {
      if ((this.zzzIn = (this.zzzIn ?? 0) - dt) <= 0) {
        this.zzzIn = 1.1;
        const z = makeZ();
        z.position.set(0.1, 0.6, -0.3);
        this.root.add(z);
        this.zzz.push(z);
      }
    }
    for (const z of this.zzz) {
      z.userData.t += dt;
      z.position.y += dt * 0.35;
      z.position.x = 0.1 + Math.sin(z.userData.t * 2) * 0.12;
      z.material.opacity = Math.max(0, 1 - z.userData.t / 2.6);
    }
    this.zzz = this.zzz.filter(z => {
      if (z.userData.t < 2.6) return true;
      this.root.remove(z);
      return false;
    });
  }
}

// ---------------------------------------------------------------------------
// Head shapes: the silhouettes that tell the five apart.

const HEADS = {
  poppy(head, P) {
    const petal = plush(P.body);
    const deep = plush(P.accent);
    // Rose-bud petals wrap the sides and back, leaving the face open.
    for (let i = 0; i < 9; i++) {
      const a = 0.75 + (i / 8) * (Math.PI * 2 - 1.5);
      head.add(part(i % 2 ? deep : petal, [Math.sin(a) * 0.37, 0.08, Math.cos(a) * 0.37], [0.24, 0.31, 0.08], [0.22, a, 0]));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      head.add(part(i % 2 ? petal : deep, [Math.sin(a) * 0.25, 0.3, Math.cos(a) * 0.25], [0.2, 0.24, 0.07], [0.35, a, 0]));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      head.add(part(deep, [Math.sin(a) * 0.08, 0.46, Math.cos(a) * 0.08], [0.13, 0.17, 0.06], [-0.2, a, 0]));
    }
    // Leaf collar.
    const leaf = plush('#6cc04a');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      head.add(part(leaf, [Math.sin(a) * 0.22, -0.36, Math.cos(a) * 0.22], [0.1, 0.035, 0.19], [0.35, a, 0]));
    }
  },

  nutty(head, P) {
    const capTex = makeCapTexture();
    const capM = new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.95, map: capTex, bumpMap: capTex, bumpScale: 2.5 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), capM);
    cap.scale.set(0.54, 0.5, 0.51);
    cap.position.y = 0.2;
    cap.castShadow = true;
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.515, 0.05, 12, 48), plush('#7e4f25'));
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 0.12;
    head.add(brim);
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.66, 0), new THREE.Vector3(0.02, 0.78, 0), new THREE.Vector3(0.1, 0.84, 0.02), new THREE.Vector3(0.17, 0.8, 0.04),
      ]), 16, 0.035, 8),
      plush('#6b4220'));
    stem.castShadow = true;
    head.add(stem);
  },

  lumi(head, P) {
    // A water-drop curl rising from the crown and tipping forward.
    const curl = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.36, -0.02), new THREE.Vector3(0.01, 0.56, -0.06), new THREE.Vector3(0.04, 0.74, 0),
      new THREE.Vector3(0.08, 0.8, 0.12), new THREE.Vector3(0.09, 0.71, 0.19), new THREE.Vector3(0.07, 0.63, 0.13),
    ]);
    const m = plush(P.accent);
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      const r = 0.2 * (1 - k) + 0.045;
      head.add(part(i % 3 === 0 ? plush(P.body) : m, curl.getPoint(k).toArray(), [r, r, r]));
    }
    for (const s of [-1, 1]) head.add(part(m, [s * 0.3, 0.3, -0.05], [0.13, 0.1, 0.13], [0, 0, s * 0.6]));
  },

  mimi(head, P) {
    const a1 = plush(P.accent);
    const a2 = plush(P.body);
    for (let i = 0; i < 11; i++) {
      const a = 0.65 + (i / 10) * (Math.PI * 2 - 1.3);
      head.add(part(i % 2 ? a1 : a2, [Math.sin(a) * 0.42, 0.14, Math.cos(a) * 0.42], [0.15, 0.13, 0.09], [0.3, a, 0]));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      head.add(part(i % 2 ? a2 : a1, [Math.sin(a) * 0.3, 0.33, Math.cos(a) * 0.3], [0.14, 0.12, 0.09], [0.5, a, 0]));
    }
    head.add(part(a1, [0, 0.46, 0], [0.15, 0.12, 0.15]));
    const bloom = plush('#ff8fc0');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      head.add(part(bloom, [0.33 + Math.cos(a) * 0.05, 0.3 + Math.sin(a) * 0.05, 0.22], [0.045, 0.045, 0.02]));
    }
    head.add(part(plush('#ffe066'), [0.33, 0.3, 0.235], [0.03, 0.03, 0.02]));
  },

  zuzu(head, P) {
    const outer = plush(P.accent);
    const inner = plush(P.body);
    // Cabbage-leaf layers.
    for (let i = 0; i < 8; i++) {
      const a = 0.8 + (i / 7) * (Math.PI * 2 - 1.6);
      head.add(part(i % 2 ? outer : inner, [Math.sin(a) * 0.39, 0.06, Math.cos(a) * 0.39], [0.3, 0.36, 0.08], [0.3, a, 0]));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      head.add(part(i % 2 ? inner : outer, [Math.sin(a) * 0.22, 0.3, Math.cos(a) * 0.22], [0.24, 0.26, 0.07], [0.45, a, 0]));
    }
    const sprout = plush('#4fa236');
    head.add(part(sprout, [0, 0.52, 0], [0.025, 0.08, 0.025]));
    head.add(part(sprout, [-0.06, 0.6, 0], [0.07, 0.03, 0.04], [0, 0, 0.5]));
    head.add(part(sprout, [0.06, 0.6, 0], [0.07, 0.03, 0.04], [0, 0, -0.5]));
  },
};

function makeCapTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b07c48';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) {
      g.fillStyle = `hsl(28, 45%, ${30 + Math.random() * 12}%)`;
      g.beginPath();
      g.ellipse(x, y, 7, 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

let badgeTex = null;
function makeBadge() {
  if (!badgeTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.ellipse(64, 56, 52, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(44, 86); g.lineTo(36, 116); g.lineTo(66, 92);
    g.fill();
    g.fillStyle = '#2b3157';
    for (const x of [38, 64, 90]) {
      g.beginPath();
      g.arc(x, 56, 8, 0, Math.PI * 2);
      g.fill();
    }
    badgeTex = new THREE.CanvasTexture(c);
    badgeTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex, depthWrite: false }));
  s.scale.set(0.45, 0.45, 1);
  return s;
}

let zTex = null;
function makeZ() {
  if (!zTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = '800 54px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#2b3157';
    g.strokeText('z', 32, 34);
    g.fillStyle = '#e8f8d9';
    g.fillText('z', 32, 34);
    zTex = new THREE.CanvasTexture(c);
    zTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }));
  s.scale.set(0.28, 0.28, 1);
  s.userData.t = 0;
  return s;
}
