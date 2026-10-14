// Bubble Bay: Poppy runs along the boardwalk and the child jumps to hop her over wobbly bubbles.
// Bumping a bubble just makes Poppy dizzy for a moment; there are no lives to lose.

import {
  W, H, COLORS, rand, blob, drawAlien, drawShadow, drawText, drawStar, drawSky, drawSun, drawCloud,
  drawHills, drawMushroom, drawCountdown, blinkAt, roundRect, Particles, Floaters,
} from '../draw.js';
import { sfx } from '../audio.js';

const GROUND = 560;
const PX = 300;
const POPPY_SCALE = 1.1;
const HUD_STAR = { x: 70, y: 56 };

const SETTINGS = {
  little: { duration: 45, speed: 240, accel: 0, gap: [2.4, 3.4], radius: 32, jump: 960, gravity: 1900 },
  big: { duration: 60, speed: 320, accel: 3, gap: [1.4, 2.5], radius: 34, jump: 1050, gravity: 2400 },
};

export class BubbleHop {
  constructor(age) {
    this.age = age;
    this.cfg = SETTINGS[age];
    this.t = 0;
    this.phase = 'ready';
    this.readyLeft = 3;
    this.playTime = 0;
    this.endTime = 0;
    this.speed = this.cfg.speed;
    this.scroll = 0;

    this.py = GROUND;
    this.vy = 0;
    this.grounded = true;
    this.squash = 0;
    this.dizzy = 0;
    this.jumpBuffer = 0;

    this.bubbles = [];
    this.spawnIn = 1.2;
    this.hopped = 0;
    this.bonks = 0;
    this.cheer = 0;
    this.flyingStars = [];
    this.fx = new Particles();
    this.words = new Floaters();
    this.done = false;
    this.result = null;
  }

  update(dt, input) {
    this.t += dt;
    this.fx.update(dt);
    this.words.update(dt);
    this.cheer = Math.max(0, this.cheer - dt);
    this.dizzy = Math.max(0, this.dizzy - dt);

    // Jumps are buffered briefly so a slightly early jump still counts.
    if (input.consumeJump() && this.phase !== 'end') this.jumpBuffer = 0.25;
    this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.grounded && this.dizzy <= 0) {
      this.vy = -this.cfg.jump;
      this.grounded = false;
      this.jumpBuffer = 0;
      sfx.jump();
    }
    if (!this.grounded) {
      this.vy += this.cfg.gravity * dt;
      this.py += this.vy * dt;
      if (this.py >= GROUND) {
        this.py = GROUND;
        this.vy = 0;
        this.grounded = true;
        this.squash = 0.18;
      }
    }
    this.squash *= Math.pow(0.002, dt);

    for (const s of this.flyingStars) s.t += dt * 1.6;
    this.flyingStars = this.flyingStars.filter(s => s.t < 1);

    if (this.phase === 'ready') {
      this.readyLeft -= dt;
      if (this.readyLeft <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'end') {
      this.endTime += dt;
      if (this.endTime > 2.5) this._finish();
      return;
    }

    this.playTime += dt;
    this.speed += this.cfg.accel * dt;
    const speed = this.speed * (this.dizzy > 0 ? 0.35 : 1);
    this.scroll += speed * dt;

    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.playTime < this.cfg.duration - 2) {
      this.bubbles.push({ x: W + 60, r: this.cfg.radius * rand(0.9, 1.1), wob: rand(0, 6), done: false });
      this.spawnIn = rand(...this.cfg.gap);
    }

    const cx = PX;
    const cy = this.py - 44 * POPPY_SCALE;
    for (const b of this.bubbles) {
      b.x -= speed * dt;
      b.wob += dt * 6;
      if (b.done) continue;
      const by = GROUND - b.r;
      if (Math.hypot(b.x - cx, by - cy) < 34 + b.r - 10) {
        b.done = true;
        b.popped = true;
        this.bonks++;
        this.dizzy = 1;
        this.fx.burst(b.x, by, 16, ['#BFEFFF', '#fff', COLORS.blue], { speed: 380, size: 7 });
        this.words.add('Oopsie!', PX, GROUND - 260, { color: COLORS.pink });
        sfx.pop();
        sfx.bonk();
      } else if (b.x + b.r < PX - 40) {
        b.done = true;
        this.hopped++;
        this.cheer = 1.2;
        this.flyingStars.push({ x: b.x, y: GROUND - b.r * 2 - 80, t: 0 });
        this.fx.burst(b.x, GROUND - b.r * 2 - 80, 10, [COLORS.yellow, '#fff'], { speed: 260, size: 9, stars: true });
        if (this.hopped % 5 === 0) this.words.add(['Yay!', 'Wheee!', 'Super hop!'][this.hopped / 5 % 3], PX + 60, GROUND - 280, { color: COLORS.yellow });
        sfx.star();
      }
    }
    this.bubbles = this.bubbles.filter(b => b.x > -120 && !b.popped);

    if (this.playTime >= this.cfg.duration) {
      this.phase = 'end';
      this.fx.burst(W / 2, 260, 40, [COLORS.yellow, COLORS.pink, COLORS.blue, COLORS.green], { speed: 500, size: 12, stars: true, life: 1.6 });
      sfx.cheer();
    }
  }

  _finish() {
    const total = this.hopped + this.bonks;
    const ratio = total ? this.hopped / total : 0;
    const stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
    this.result = {
      title: "Poppy's Bubble Hop",
      stars,
      lines: [`${this.hopped} bubbles hopped`, `${this.bonks} wobbly bonks`],
      message: stars === 3 ? "Poppy says you're the best hopper in Bubble Bay!"
        : stars === 2 ? 'Great hopping! Bubble Bay is sparkling again.'
          : 'Good try! Poppy wants a rematch.',
    };
    this.done = true;
  }

  draw(ctx) {
    const t = this.t;
    drawSky(ctx, '#6FD0FF', '#DDF5FF');
    drawSun(ctx, 1090, 110, 54);
    for (let i = 0; i < 4; i++) {
      const x = ((i * 420 - this.scroll * 0.08) % (W + 400) + W + 400) % (W + 400) - 200;
      drawCloud(ctx, x, 90 + (i % 2) * 70, 0.7 + (i % 3) * 0.15);
    }
    drawHills(ctx, this.scroll * 0.15, 420, '#C2B0FF', 46, 460);
    for (let i = 0; i < 4; i++) {
      const x = ((i * 380 - this.scroll * 0.35) % (W + 380) + W + 380) % (W + 380) - 190;
      drawMushroom(ctx, x, 500, 0.75 + (i % 2) * 0.25, [COLORS.pink, COLORS.orange, COLORS.purple, COLORS.pink][i]);
    }
    drawHills(ctx, this.scroll * 0.45, 505, '#8FDD70', 22, 300);

    // The bay.
    const water = ctx.createLinearGradient(0, 520, 0, H);
    water.addColorStop(0, '#5CCBFF');
    water.addColorStop(1, '#2C8FE0');
    ctx.fillStyle = water;
    ctx.fillRect(0, 520, W, H - 520);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let row = 0; row < 3; row++) {
      const y = 640 + row * 28;
      for (let x = -((this.scroll * (0.6 + row * 0.2)) % 160); x < W; x += 160) {
        ctx.beginPath();
        ctx.arc(x + row * 50, y, 18, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      }
    }

    // Nutty cheers from a lily pad.
    const padY = 548 + Math.sin(t * 2) * 4;
    blob(ctx, 1090, padY, 80, 18, '#5DBB46');
    drawAlien(ctx, 'nutty', 1090, padY - 4, 0.7, {
      armsUp: this.cheer > 0 || this.phase === 'end',
      squash: this.cheer > 0 ? Math.sin(t * 20) * 0.05 : 0,
      mood: this.dizzy > 0 ? 'wow' : this.cheer > 0 ? 'grin' : 'happy',
      blink: blinkAt(t, 2),
    });

    // Boardwalk.
    roundRect(ctx, -20, GROUND, W + 40, 38, 14, '#FFB877');
    ctx.fillStyle = '#E8955A';
    for (let x = -(this.scroll % 64); x < W; x += 64) ctx.fillRect(x, GROUND + 4, 4, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, GROUND + 3, W, 5);

    for (const b of this.bubbles) this._drawBubble(ctx, b);

    // Poppy.
    const running = this.phase === 'play' && this.grounded;
    const bob = running ? Math.abs(Math.sin(t * 12)) * 6 : 0;
    drawShadow(ctx, PX, GROUND, POPPY_SCALE * (1 - (GROUND - this.py) / 600), 0.22);
    drawAlien(ctx, 'poppy', PX, this.py - bob, POPPY_SCALE, {
      squash: this.grounded ? this.squash : -0.08,
      tilt: this.dizzy > 0 ? Math.sin(t * 18) * 0.15 : running ? Math.sin(t * 12) * 0.05 : 0,
      armsUp: !this.grounded || this.phase === 'end',
      mood: this.dizzy > 0 ? 'dizzy' : !this.grounded || this.phase === 'end' ? 'grin' : 'happy',
      blink: blinkAt(t),
    });
    if (this.dizzy > 0) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        drawStar(ctx, PX + Math.cos(a) * 50, this.py - 225 + Math.sin(a) * 12, 10, COLORS.yellow, a, false);
      }
    }

    // Prompt the youngest players when a bubble is close.
    if (this.age === 'little' && this.grounded && this.dizzy <= 0 &&
        this.bubbles.some(b => !b.done && b.x - PX > 60 && b.x - PX < 300)) {
      drawText(ctx, 'JUMP!', PX, GROUND - 270 + Math.sin(t * 10) * 6, 56, COLORS.yellow);
    }

    this.fx.draw(ctx);
    this.words.draw(ctx);
    this._drawHud(ctx);

    if (this.phase === 'ready') drawCountdown(ctx, this.readyLeft, 'Jump to practise!');
    if (this.phase === 'end') drawText(ctx, 'Hooray!', W / 2, 280, 110 + Math.sin(t * 6) * 6, COLORS.yellow);
  }

  _drawBubble(ctx, b) {
    const by = GROUND - b.r;
    const k = Math.sin(b.wob) * 0.07;
    const g = ctx.createRadialGradient(b.x, by, b.r * 0.3, b.x, by, b.r);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(0.7, 'rgba(167,123,250,0.35)');
    g.addColorStop(1, 'rgba(255,100,149,0.6)');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#2E8FD8';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(b.x, by + k * b.r, b.r * (1 + k), b.r * (1 - k), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(b.x - b.r * 0.38, by - b.r * 0.4, b.r * 0.22, b.r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (!b.done) drawStar(ctx, b.x, GROUND - b.r * 2 - 80 + Math.sin(b.wob * 0.5) * 6, 18, COLORS.yellow, Math.sin(b.wob * 0.3) * 0.3);
  }

  _drawHud(ctx) {
    roundRect(ctx, 24, 24, 170, 64, 32, 'rgba(255,249,237,0.92)');
    drawStar(ctx, HUD_STAR.x, HUD_STAR.y, 22);
    drawText(ctx, String(this.hopped), 130, 58, 40, COLORS.navy, null);

    for (const s of this.flyingStars) {
      const e = 1 - (1 - s.t) ** 3;
      drawStar(ctx, s.x + (HUD_STAR.x - s.x) * e, s.y + (HUD_STAR.y - s.y) * e - Math.sin(s.t * Math.PI) * 80, 20 - s.t * 6);
    }

    const left = this.phase === 'ready' ? 1 : Math.max(0, 1 - this.playTime / this.cfg.duration);
    roundRect(ctx, W / 2 - 220, 34, 440, 30, 15, 'rgba(255,249,237,0.92)');
    roundRect(ctx, W / 2 - 214, 40, 428 * left, 18, 9, COLORS.blue);
    drawText(ctx, 'Bubble Bay', W / 2, 86, 24, COLORS.navy, null);
  }

  dispose() {}
}
