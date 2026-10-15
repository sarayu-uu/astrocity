// Cinematic camera: eased moves between shots, fly-through paths, follow shots,
// and a gentle drag-to-look mode for exploring Star Square.

import * as THREE from 'three';

const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 20, 30);
    this.look = new THREE.Vector3();
    this.anim = null;
    this.follow = null;
    this.explore = null;
    this.dragged = false;

    // Exploring: drag to pan, wheel to zoom, WASD/arrows to look around.
    let drag = null;
    dom.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; this.dragged = false; });
    addEventListener('pointerup', () => { drag = null; });
    addEventListener('pointermove', e => {
      if (!drag || !this.explore) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) this.dragged = true;
      const k = 0.03 * this.explore.zoom;
      this.explore.focus.x -= dx * k;
      this.explore.focus.z -= dy * k;
      this._clampFocus();
    });
    dom.addEventListener('wheel', e => {
      if (!this.explore) return;
      e.preventDefault();
      this.explore.zoom = THREE.MathUtils.clamp(this.explore.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.55, 1.35);
    }, { passive: false });
    this.keys = new Set();
    addEventListener('keydown', e => this.keys.add(e.code));
    addEventListener('keyup', e => this.keys.delete(e.code));
  }

  _clampFocus() {
    const f = this.explore.focus;
    const d = Math.hypot(f.x, f.z);
    if (d > 17) { f.x *= 17 / d; f.z *= 17 / d; }
  }

  set(pos, look) {
    this.anim = null;
    this.follow = null;
    this.explore = null;
    this.pos.set(...pos);
    this.look.set(...look);
  }

  go(pos, look, duration = 2) {
    this.follow = null;
    this.explore = null;
    return new Promise(resolve => {
      this.anim = {
        t: 0, duration,
        fromPos: this.pos.clone(), toPos: new THREE.Vector3(...pos),
        fromLook: this.look.clone(), toLook: new THREE.Vector3(...look),
        resolve,
      };
    });
  }

  flyThrough(posPoints, lookPoints, duration) {
    this.follow = null;
    this.explore = null;
    return new Promise(resolve => {
      this.anim = {
        t: 0, duration,
        posCurve: new THREE.CatmullRomCurve3(posPoints.map(p => new THREE.Vector3(...p))),
        lookCurve: new THREE.CatmullRomCurve3(lookPoints.map(p => new THREE.Vector3(...p))),
        resolve,
      };
    });
  }

  // fn returns { pos: [x,y,z], look: [x,y,z] } each frame; the camera eases after it.
  followWith(fn, stiffness = 3) {
    this.anim = null;
    this.explore = null;
    this.follow = { fn, stiffness };
  }

  startExplore(focus = [0, 0, 4]) {
    this.anim = null;
    this.follow = null;
    this.explore = { focus: new THREE.Vector3(...focus), zoom: 1 };
  }

  focusOn(x, z, zoom = 0.7) {
    if (!this.explore) return;
    this.explore.focus.set(x, 0, z);
    this.explore.zoom = zoom;
    this._clampFocus();
  }

  update(dt) {
    const a = this.anim;
    if (a) {
      a.t += dt / a.duration;
      const k = Math.min(1, a.t);
      if (a.posCurve) {
        const e = ease(k);
        this.pos.copy(a.posCurve.getPoint(e));
        this.look.copy(a.lookCurve.getPoint(e));
      } else {
        const e = ease(k);
        this.pos.lerpVectors(a.fromPos, a.toPos, e);
        this.look.lerpVectors(a.fromLook, a.toLook, e);
      }
      if (k >= 1) {
        this.anim = null;
        a.resolve();
      }
    } else if (this.follow) {
      const { pos, look } = this.follow.fn();
      const s = 1 - Math.exp(-this.follow.stiffness * dt);
      this.pos.lerp(new THREE.Vector3(...pos), s);
      this.look.lerp(new THREE.Vector3(...look), s);
    } else if (this.explore) {
      const ex = this.explore;
      const pan = 9 * dt * ex.zoom;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ex.focus.x -= pan;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ex.focus.x += pan;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ex.focus.z -= pan;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ex.focus.z += pan;
      this._clampFocus();
      const want = ex.focus.clone().add(new THREE.Vector3(0, 9 * ex.zoom, 12.5 * ex.zoom));
      const s = 1 - Math.exp(-3 * dt);
      this.pos.lerp(want, s);
      this.look.lerp(ex.focus, s);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
