// Star Square: Mimi runs a freeze-dance party. Dance while the music plays, hold still when it stops.
// Poppy can never quite stay still, and Zuzu "wins" every freeze by falling asleep.

import {
  W, H, COLORS, rand, clamp, blob, drawAlien, drawShadow, drawText, drawStar, starPath, drawNovaTree,
  drawHouse, drawCountdown, blinkAt, roundRect, Particles, Floaters,
} from '../draw.js';
import { sfx, startMusic, stopMusic } from '../audio.js';

// Energy thresholds are in torso-lengths per second (see input.js). Press "?" in camera mode
// to see live values while tuning.
const SETTINGS = {
  little: { rounds: 4, dance: [5, 8], freeze: 3, grace: 0.9, danceAt: 0.45, stillBelow: 0.5 },
  big: { rounds: 6, dance: [4, 9], freeze: 3.5, grace: 0.6, danceAt: 0.7, stillBelow: 0.3 },
};
const BPM = 124;
const METER_MAX = 1.6;

export class FreezeDance {
  constructor(age) {
    this.cfg = SETTINGS[age];
    this.t = 0;
    this.poseT = 0;
    this.phase = 'ready';
    this.left = 3;
    this.round = 0;
    this.energy = 0;
    this.danceSeconds = 0;
    this.goodFreezes = 0;
    this.still = 0;
    this.wiggle = 0;
    this.wobbleFlash = 0;
    this.lastOk = false;
    this.zzz = 0;
    this.fx = new Particles();
    this.words = new Floaters();
    this.done = false;
    this.result = null;
  }

  update(dt, input) {
    this.t += dt;
    this.fx.update(dt);
    this.words.update(dt);
    this.energy = input.energy;
    this.left -= dt;
    this.wobbleFlash = Math.max(0, this.wobbleFlash - dt);
    const frozen = this.phase === 'freeze' || this.phase === 'result';
    if (!frozen) this.poseT = this.t;

    // Zuzu snores whenever everyone else is frozen.
    if (frozen && (this.zzz -= dt) <= 0) {
      this.zzz = 0.8;
      this.words.add('z', 260 + rand(-6, 6), 560, { color: COLORS.green, size: 34, life: 1.6, rise: 60 });
    }

    switch (this.phase) {
      case 'ready':
        if (this.left <= 0) this._startDance();
        break;

      case 'dance':
        if (this.energy > this.cfg.danceAt) {
          this.danceSeconds += dt;
          if (Math.random() < dt * 8) {
            this.fx.burst(640 + rand(-140, 140), 380 + rand(-60, 60), 1,
              [COLORS.yellow, COLORS.pink, COLORS.blue, '#fff'], { speed: 120, size: 12, gravity: -200, life: 1.2, stars: true });
          }
        }
        if (this.left <= 0) this._startFreeze();
        break;

      case 'freeze':
        if (this.cfg.freeze - this.left > this.cfg.grace) {
          if (this.energy > this.cfg.stillBelow) {
            this.wiggle += dt;
            this.wobbleFlash = 0.3;
          } else {
            this.still += dt;
          }
        }
        if (this.left <= 0) this._endFreeze();
        break;

      case 'result':
        if (this.left <= 0) {
          this.round++;
          if (this.round >= this.cfg.rounds) {
            this.phase = 'finale';
            this.left = 3;
            this.fx.burst(W / 2, 260, 50, [COLORS.yellow, COLORS.pink, COLORS.blue, COLORS.purple], { speed: 520, size: 12, stars: true, life: 1.8 });
            sfx.cheer();
          } else {
            this._startDance();
          }
        }
        break;

      case 'finale':
        if (this.left <= 0) this._finish();
        break;
    }
  }

  _startDance() {
    this.phase = 'dance';
    this.left = rand(...this.cfg.dance);
    startMusic(BPM);
  }

  _startFreeze() {
    this.phase = 'freeze';
    this.left = this.cfg.freeze;
    this.still = 0;
    this.wiggle = 0;
    stopMusic();
    sfx.freeze();
  }

  _endFreeze() {
    this.lastOk = this.still / (this.still + this.wiggle) >= 0.7;
    this.phase = 'result';
    this.left = 1.6;
    if (this.lastOk) {
      this.goodFreezes++;
      this.words.add('Frozen solid!', W / 2, 250, { color: '#BDEBFF', size: 64 });
      this.fx.burst(W / 2, 250, 16, [COLORS.yellow, '#fff'], { speed: 300, size: 12, stars: true });
      sfx.star();
    } else {
      this.words.add('Wiggly giggles!', W / 2, 250, { color: COLORS.pink, size: 64 });
      sfx.giggle();
    }
  }

  _finish() {
    const ratio = this.goodFreezes / this.cfg.rounds;
    const stars = ratio >= 0.8 ? 3 : ratio >= 0.5 ? 2 : 1;
    this.result = {
      title: "Mimi's Freeze Dance",
      stars,
      lines: [`${this.goodFreezes} of ${this.cfg.rounds} perfect freezes`, `${Math.round(this.danceSeconds)} seconds of dancing`],
      message: stars === 3 ? 'Mimi wants you in her next big show!'
        : stars === 2 ? 'What moves! Zuzu froze perfectly too... because he fell asleep.'
          : "So much wiggling! Mimi says that's the best kind of dancing.",
    };
    this.done = true;
    stopMusic();
  }

  onPause(paused) {
    if (paused) stopMusic();
    else if (this.phase === 'dance') startMusic(BPM);
  }

  dispose() {
    stopMusic();
  }

  draw(ctx) {
    const t = this.t;
    const frozen = this.phase === 'freeze' || this.phase === 'result';
    const partying = this.phase === 'dance' || this.phase === 'finale';

    // Evening festival sky over Star Square.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4B3FA8');
    sky.addColorStop(0.55, '#C17EDC');
    sky.addColorStop(1, '#FFB8CC');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 36; i++) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + i);
      drawStar(ctx, (i * 137.5) % W, 20 + ((i * 71) % 260), 2 + (i % 3), '#fff', 0, false);
    }
    ctx.globalAlpha = 1;

    drawNovaTree(ctx, 230, 520, 0.8, t);
    drawHouse(ctx, 1010, 520, 0.85, COLORS.blue, COLORS.green);
    drawHouse(ctx, 1190, 520, 0.75, COLORS.orange, COLORS.pink);
    ctx.fillStyle = '#86CF68';
    ctx.fillRect(0, 510, W, H - 510);

    // Stage.
    blob(ctx, 640, 600, 470, 64, COLORS.orange);
    blob(ctx, 640, 588, 450, 50, COLORS.yellow);

    this._drawLights(ctx, partying);

    // Dancers. While frozen, poses hold at the moment the music stopped.
    const pt = this.poseT;
    const beat = Math.abs(Math.sin(pt * Math.PI * BPM / 60));
    const sway = Math.sin(pt * Math.PI * BPM / 120);
    const armsA = Math.sin(pt * Math.PI * BPM / 60 / 2) > 0;

    drawShadow(ctx, 400, 600, 1.1);
    drawAlien(ctx, 'poppy', 400, 600 - beat * 18, 1.1, {
      tilt: sway * 0.22 + (frozen ? Math.sin(t * 25) * 0.035 : 0),
      armsUp: !armsA,
      squash: frozen ? 0 : (1 - beat) * 0.06,
      mood: frozen ? 'wow' : 'grin',
      blink: blinkAt(t, 1),
    });

    drawShadow(ctx, 880, 600, 1.1);
    drawAlien(ctx, 'nutty', 880, 600 - beat * 10, 1.1, {
      tilt: -sway * 0.14,
      armsUp: armsA,
      mood: frozen ? 'wow' : 'happy',
      blink: blinkAt(t, 3),
    });

    drawShadow(ctx, 640, 590, 1.5);
    let mimiMood = 'grin';
    if (this.phase === 'freeze') mimiMood = 'wow';
    if (this.phase === 'result') mimiMood = this.lastOk ? 'grin' : 'happy';
    drawAlien(ctx, 'mimi', 640, 590 - beat * 26, 1.5, {
      tilt: sway * 0.18,
      armsUp: armsA || this.phase === 'finale',
      squash: frozen ? 0 : (1 - beat) * 0.08,
      mood: mimiMood,
      blink: !frozen && blinkAt(t, 5),
    });

    // Zuzu "dances" on the grass and naps whenever the music stops.
    drawShadow(ctx, 170, 650, 0.9);
    drawAlien(ctx, 'zuzu', frozen ? 110 : 170, frozen ? 640 : 650, 0.9, {
      tilt: frozen ? 1.45 : Math.sin(t * 1.5) * 0.1,
      mood: frozen ? 'sleep' : 'happy',
      blink: blinkAt(t, 7),
    });

    if (this.phase === 'freeze') {
      ctx.fillStyle = 'rgba(170,225,255,0.22)';
      ctx.fillRect(0, 0, W, H);
    }

    this.fx.draw(ctx);
    this.words.draw(ctx);
    this._drawHud(ctx);

    if (this.phase === 'ready') drawCountdown(ctx, this.left, 'Get ready to dance!');
    if (this.phase === 'dance') drawText(ctx, 'DANCE!', W / 2, 160, 84 + beat * 10, COLORS.yellow);
    if (this.phase === 'freeze') {
      drawText(ctx, 'FREEZE!', W / 2, 160, 110, '#DDF6FF', '#2F6FB0');
      drawText(ctx, 'Stay still like a statue', W / 2, 235, 34);
    }
    if (this.phase === 'finale') drawText(ctx, 'What a show!', W / 2, 160, 96 + Math.sin(t * 6) * 6, COLORS.yellow);
  }

  _drawLights(ctx, partying) {
    const sag = x => 40 + 70 * (1 - ((x - W / 2) / (W / 2)) ** 2);
    ctx.strokeStyle = 'rgba(40,53,106,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, sag(x));
    ctx.stroke();
    const colors = [COLORS.pink, COLORS.yellow, COLORS.blue, COLORS.green, COLORS.purple, COLORS.orange];
    const beatIndex = Math.floor(this.t * BPM / 60);
    for (let i = 0, x = 40; x < W; x += 80, i++) {
      const on = partying ? (i + beatIndex) % 2 === 0 : false;
      ctx.globalAlpha = on ? 1 : 0.45;
      blob(ctx, x, sag(x) + 14, 9, 13, colors[i % colors.length]);
    }
    ctx.globalAlpha = 1;
  }

  _drawHud(ctx) {
    // Wiggle meter: shows the child how much the game thinks they're moving.
    const x = 40;
    const y = 190;
    const h = 330;
    roundRect(ctx, x - 6, y - 6, 60, h + 12, 30, 'rgba(255,249,237,0.92)');
    const fill = clamp(this.energy / METER_MAX, 0, 1);
    let color = COLORS.pink;
    if (this.phase === 'freeze') color = this.wobbleFlash > 0 ? COLORS.orange : COLORS.blue;
    if (fill > 0.02) roundRect(ctx, x, y + h * (1 - fill), 48, h * fill, 24, color);
    const line = this.phase === 'freeze' ? this.cfg.stillBelow : this.cfg.danceAt;
    const ly = y + h * (1 - clamp(line / METER_MAX, 0, 1));
    ctx.fillStyle = COLORS.navy;
    ctx.fillRect(x - 4, ly - 2, 56, 4);
    drawText(ctx, 'WIGGLE', x + 24, y - 30, 24, COLORS.navy, null);
    if (this.phase === 'freeze' && this.wobbleFlash > 0) drawText(ctx, 'wobble!', x + 120, ly, 30, COLORS.orange);

    // One star per round; lit for each perfect freeze.
    const n = this.cfg.rounds;
    const w = n * 52 + 24;
    roundRect(ctx, W - w - 24, 24, w, 64, 32, 'rgba(255,249,237,0.92)');
    for (let i = 0; i < n; i++) {
      const sx = W - w - 24 + 38 + i * 52;
      if (i < this.goodFreezes) drawStar(ctx, sx, 56, 20);
      else {
        starPath(ctx, sx, 56, 20);
        ctx.strokeStyle = '#D9CFBC';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    drawText(ctx, `Round ${Math.min(this.round + 1, n)} of ${n}`, W - w / 2 - 24, 110, 26, COLORS.navy, null);
  }
}
