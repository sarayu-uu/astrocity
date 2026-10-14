// Shared drawing kit: palette, plush-shaded shapes, the five buddies, and scenery.
// Everything draws in a fixed 1280x720 virtual space; main.js scales it to the window.

export const W = 1280;
export const H = 720;

export const COLORS = {
  pink: '#FF6495',
  yellow: '#FFD447',
  blue: '#48C5FF',
  green: '#7ED957',
  purple: '#A77BFA',
  orange: '#FF984F',
  navy: '#28356A',
  cream: '#FFF9ED',
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Mix a hex colour toward white (amt > 0) or black (amt < 0).
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const target = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = c => Math.round(c + (target - c) * p);
  return '#' + ((mix(n >> 16) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255)).toString(16).padStart(6, '0');
}

// A soft, velvety ellipse: light top-left, darker rim. The basic plush building block.
export function blob(ctx, x, y, rx, ry, color, rot = 0) {
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.4, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.18));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

export function drawText(ctx, text, x, y, size, fill = '#fff', stroke = COLORS.navy, align = 'center') {
  ctx.font = `800 ${size}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function starPath(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function drawStar(ctx, x, y, r, color = COLORS.yellow, rot = 0, outline = true) {
  starPath(ctx, x, y, r, rot);
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = shade(COLORS.orange, -0.1);
    ctx.stroke();
  }
}

export function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// The buddies. (x, y) is the point between the feet; at s = 1 a buddy is ~190px tall.
// Lumi, Mimi and Zuzu are stand-in silhouettes until their approved references land.

const BUDDIES = {
  poppy: { body: COLORS.pink, face: '#FFF1E2' },
  nutty: { body: COLORS.yellow, face: '#FFF6DA' },
  lumi: { body: COLORS.blue, face: '#E8F8FF' },
  mimi: { body: COLORS.purple, face: '#F3ECFF' },
  zuzu: { body: COLORS.green, face: '#F0FBE8' },
};

export const blinkAt = (t, seed = 0) => (t + seed * 1.37) % 3.4 < 0.13;

export function drawShadow(ctx, x, y, s = 1, alpha = 0.18) {
  ctx.fillStyle = `rgba(40,53,106,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 42 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

// opts: squash (-0.2..0.2), tilt (radians), armsUp, blink, sleepy,
//       mood: 'happy' | 'grin' | 'wow' | 'sleep' | 'dizzy'
export function drawAlien(ctx, kind, x, y, s = 1, o = {}) {
  const { body, face } = BUDDIES[kind];
  const hy = -100;
  const sq = o.squash || 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.tilt || 0);
  ctx.scale(s * (1 + sq), s * (1 - sq));

  // Legs and resting arms sit behind the body.
  blob(ctx, -14, -8, 12, 10, shade(body, -0.08));
  blob(ctx, 14, -8, 12, 10, shade(body, -0.08));
  if (!o.armsUp) {
    for (const side of [-1, 1]) blob(ctx, side * 31, -34, 8, 14, body, -side * 0.6);
  }
  blob(ctx, 0, -38, 30, 31, body);
  if (kind === 'nutty') drawAcorn(ctx, 0, -34, 0.45);

  // Head pieces that sit behind the head.
  if (kind === 'poppy') {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.62;
      blob(ctx, Math.cos(a) * 40, hy + Math.sin(a) * 40, 20, 30, i % 2 ? shade(body, -0.06) : '#FF7FA8', a + Math.PI / 2);
    }
  }
  if (kind === 'zuzu') {
    for (const side of [-1, 1]) blob(ctx, side * 48, hy + 8, 13, 30, '#62C043', -side * 0.9);
  }
  if (kind === 'mimi') {
    blob(ctx, -24, hy - 40, 16, 16, '#BC9BFF');
    blob(ctx, 24, hy - 40, 16, 16, '#BC9BFF');
    blob(ctx, 0, hy - 52, 18, 18, '#C9ADFF');
  }
  if (kind === 'lumi') {
    ctx.strokeStyle = shade(body, -0.25);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, hy - 40);
    ctx.quadraticCurveTo(-6, hy - 78, 14, hy - 90);
    ctx.stroke();
    const glow = ctx.createRadialGradient(14, hy - 94, 2, 14, hy - 94, 22);
    glow.addColorStop(0, 'rgba(255,240,150,0.9)');
    glow.addColorStop(1, 'rgba(255,240,150,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(14, hy - 94, 22, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, 14, hy - 94, 9, 9, '#FFE98A');
    blob(ctx, -10, hy - 66, 10, 5, COLORS.green, -0.6);
  }

  blob(ctx, 0, hy, 52, 48, body);
  blob(ctx, 0, hy + 10, 38, 31, face);

  // Head pieces that sit on top.
  if (kind === 'nutty') drawCap(ctx, hy);
  if (kind === 'poppy') {
    for (const side of [-1, 1]) blob(ctx, side * 16, -54, 16, 7, '#5DBB46', side * 0.35);
  }
  if (kind === 'mimi') drawStar(ctx, 34, hy - 30, 10, COLORS.yellow, 0.3, false);
  if (kind === 'zuzu') {
    ctx.strokeStyle = '#4FA236';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, hy - 44);
    ctx.lineTo(0, hy - 60);
    ctx.stroke();
    blob(ctx, -8, hy - 62, 9, 5, '#62C043', 0.5);
    blob(ctx, 8, hy - 62, 9, 5, '#62C043', -0.5);
  }

  drawFace(ctx, hy, body, face, o.sleepy ?? kind === 'zuzu', o);

  if (o.armsUp) {
    for (const side of [-1, 1]) blob(ctx, side * 50, -62, 8, 15, body, side * 0.6);
  }
  ctx.restore();
}

function drawFace(ctx, hy, body, face, sleepy, o) {
  const mood = o.mood || 'happy';
  const ey = hy + 4;
  const closed = o.blink || mood === 'sleep';
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLORS.navy;
  ctx.lineWidth = 3;

  for (const side of [-1, 1]) {
    const ex = side * 16;
    if (mood === 'dizzy') {
      ctx.beginPath();
      ctx.moveTo(ex - 6, ey - 6); ctx.lineTo(ex + 6, ey + 6);
      ctx.moveTo(ex + 6, ey - 6); ctx.lineTo(ex - 6, ey + 6);
      ctx.stroke();
    } else if (closed) {
      ctx.beginPath();
      ctx.arc(ex, ey - 2, 7, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      const big = mood === 'wow' ? 1.2 : 1;
      ctx.fillStyle = '#14182B';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 8.5 * big, 11 * big, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + 3, ey - 4, 3.2 * big, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - 3, ey + 4, 1.6 * big, 0, Math.PI * 2); ctx.fill();
      if (sleepy && mood !== 'wow') {
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.ellipse(ex, ey - 8, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex - 9, ey - 1); ctx.lineTo(ex + 9, ey - 1);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = 'rgba(255,110,150,0.45)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 27, hy + 20, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  blob(ctx, 0, hy + 14, 3.5, 2.5, shade(body, -0.2));

  ctx.lineWidth = 2.6;
  ctx.beginPath();
  if (mood === 'grin') {
    ctx.arc(0, hy + 21, 7, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = COLORS.navy;
    ctx.fill();
    ctx.fillStyle = '#FF8FB1';
    ctx.beginPath();
    ctx.ellipse(0, hy + 25.5, 3.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mood === 'wow') {
    ctx.ellipse(0, hy + 25, 4, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.navy;
    ctx.fill();
  } else if (mood === 'sleep') {
    ctx.ellipse(0, hy + 24, 3, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mood === 'dizzy') {
    ctx.moveTo(-7, hy + 24);
    ctx.quadraticCurveTo(-3.5, hy + 20, 0, hy + 24);
    ctx.quadraticCurveTo(3.5, hy + 28, 7, hy + 24);
    ctx.stroke();
  } else {
    ctx.arc(0, hy + 19, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

function drawCap(ctx, hy) {
  const cy = hy - 12;
  const g = ctx.createLinearGradient(0, cy - 44, 0, cy);
  g.addColorStop(0, '#B07A45');
  g.addColorStop(1, '#8A5A2B');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, cy, 57, 44, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(60,30,10,0.28)';
  for (let row = 0, yy = -38; yy < -6; yy += 9, row++) {
    for (let xx = -50 + (row % 2) * 5; xx <= 50; xx += 10) {
      if ((xx / 52) ** 2 + (yy / 40) ** 2 < 1) {
        ctx.beginPath();
        ctx.arc(xx, cy + yy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  blob(ctx, 0, cy, 58, 10, '#7E4F25');
  ctx.strokeStyle = '#6B4220';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, cy - 42);
  ctx.quadraticCurveTo(4, cy - 60, 16, cy - 58);
  ctx.stroke();
}

function drawAcorn(ctx, x, y, s) {
  blob(ctx, x, y + 6 * s, 14 * s, 16 * s, '#B07A45');
  ctx.fillStyle = '#7E4F25';
  ctx.beginPath();
  ctx.ellipse(x, y - 4 * s, 17 * s, 10 * s, 0, Math.PI, 0);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Scenery

export function drawSky(ctx, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function drawSun(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
  g.addColorStop(0, 'rgba(255,230,120,0.7)');
  g.addColorStop(1, 'rgba(255,230,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  blob(ctx, x, y, r, r, COLORS.yellow);
}

export function drawCloud(ctx, x, y, s = 1) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (const [dx, dy, r] of [[-50, 8, 34], [0, -10, 46], [50, 6, 36], [20, 18, 30], [-20, 20, 30]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Rolling hills; `offset` scrolls them for parallax.
export function drawHills(ctx, offset, baseY, color, amp, wavelength) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) {
    const u = (x + offset) / wavelength;
    ctx.lineTo(x, baseY - amp * (0.6 * Math.sin(u * Math.PI * 2) + 0.4 * Math.sin(u * Math.PI * 1.3 + 1)));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

export function drawMushroom(ctx, x, y, s, cap) {
  roundRect(ctx, x - 16 * s, y - 90 * s, 32 * s, 90 * s, 14 * s, '#FFF1DC');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.ellipse(x, y - 86 * s, 70 * s, 54 * s, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [dx, dy, r] of [[-34, -110, 10], [4, -126, 13], [36, -104, 9], [-6, -98, 7]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawHouse(ctx, x, y, s, wall, roof) {
  roundRect(ctx, x - 50 * s, y - 90 * s, 100 * s, 90 * s, 24 * s, wall);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.ellipse(x, y - 86 * s, 64 * s, 54 * s, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 16 * s, y - 52 * s, 32 * s, 52 * s, [16 * s, 16 * s, 0, 0]);
  ctx.fillStyle = shade(wall, -0.3);
  ctx.fill();
  ctx.fillStyle = '#FFF4C2';
  ctx.beginPath();
  ctx.arc(x + 30 * s, y - 60 * s, 11 * s, 0, Math.PI * 2);
  ctx.fill();
}

export function drawNovaTree(ctx, x, y, s, t) {
  const glow = ctx.createRadialGradient(x, y - 260 * s, 40 * s, x, y - 260 * s, 260 * s);
  glow.addColorStop(0, 'rgba(180,255,240,0.45)');
  glow.addColorStop(1, 'rgba(180,255,240,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 280 * s, y - 540 * s, 560 * s, 560 * s);

  ctx.fillStyle = '#7A5BB0';
  ctx.beginPath();
  ctx.moveTo(x - 40 * s, y);
  ctx.quadraticCurveTo(x - 14 * s, y - 100 * s, x - 22 * s, y - 220 * s);
  ctx.lineTo(x + 22 * s, y - 220 * s);
  ctx.quadraticCurveTo(x + 14 * s, y - 100 * s, x + 40 * s, y);
  ctx.closePath();
  ctx.fill();

  const leaves = [[-95, -230, 78, '#5FE0C8'], [95, -230, 78, '#8E7CF8'], [0, -270, 96, '#6FE6D0'],
    [-55, -330, 70, '#A98CFF'], [60, -330, 72, '#5FE0C8'], [0, -380, 60, '#B9A2FF']];
  for (const [dx, dy, r, c] of leaves) blob(ctx, x + dx * s, y + dy * s, r * s, r * 0.9 * s, c);

  for (let i = 0; i < 12; i++) {
    const a = i * 2.39;
    const d = (40 + (i * 37) % 120) * s;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2.2 + i);
    drawStar(ctx, x + Math.cos(a) * d * 1.3, y - 290 * s + Math.sin(a) * d * 0.8, 7 * s, '#FFF6B0', t * 0.5 + i, false);
  }
  ctx.globalAlpha = 1;
}

// The title-screen view of Star Square with all five buddies.
export function drawStarSquare(ctx, t) {
  drawSky(ctx, '#7FD6FF', '#E4F7FF');
  drawSun(ctx, 1110, 110, 50);
  drawCloud(ctx, ((t * 12) % (W + 300)) - 150, 120, 0.9);
  drawCloud(ctx, ((t * 8 + 700) % (W + 300)) - 150, 200, 0.7);
  drawHills(ctx, t * 4, 470, '#C7B6FF', 34, 520);
  drawNovaTree(ctx, 640, 520, 1, t);
  drawHills(ctx, 200, 540, '#9BE27A', 18, 380);
  drawHouse(ctx, 170, 560, 1.1, COLORS.orange, COLORS.pink);
  drawMushroom(ctx, 330, 560, 0.8, COLORS.purple);
  drawHouse(ctx, 1100, 560, 1, COLORS.blue, COLORS.green);
  drawMushroom(ctx, 960, 560, 0.7, COLORS.orange);
  ctx.fillStyle = '#8BD46B';
  ctx.fillRect(0, 590, W, H - 590);
  ctx.fillStyle = '#FFE7B8';
  ctx.beginPath();
  ctx.ellipse(640, 670, 560, 52, 0, 0, Math.PI * 2);
  ctx.fill();

  const crew = ['lumi', 'nutty', 'poppy', 'mimi', 'zuzu'];
  crew.forEach((kind, i) => {
    const x = 340 + i * 150;
    const speed = kind === 'zuzu' ? 3 : kind === 'mimi' ? 9 : 7;
    const hop = Math.max(0, Math.sin(t * speed + i * 1.3));
    const y = 690 - hop * (kind === 'zuzu' ? 6 : 26);
    drawShadow(ctx, x, 690, 0.8);
    drawAlien(ctx, kind, x, y, kind === 'poppy' ? 0.95 : 0.8, {
      squash: hop < 0.1 ? 0.06 : -0.04,
      tilt: Math.sin(t * 2 + i) * 0.06,
      armsUp: kind === 'mimi' ? Math.sin(t * 4) > 0 : hop > 0.8,
      blink: blinkAt(t, i),
      mood: kind === 'poppy' ? 'grin' : 'happy',
    });
  });
}

// ---------------------------------------------------------------------------
// Little effects

export class Particles {
  constructor() { this.list = []; }

  burst(x, y, n, colors, { speed = 300, size = 8, gravity = 600, life = 0.8, stars = false } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.list.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3,
        size: size * (0.6 + Math.random() * 0.6), color: colors[i % colors.length],
        life, t: 0, gravity, star: stars, rot: Math.random() * 6,
      });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.t += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 4;
    }
    this.list = this.list.filter(p => p.t < p.life);
  }

  draw(ctx) {
    for (const p of this.list) {
      ctx.globalAlpha = 1 - p.t / p.life;
      if (p.star) drawStar(ctx, p.x, p.y, p.size, p.color, p.rot, false);
      else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Words that pop up, drift and fade ("Yay!", "Zzz").
export class Floaters {
  constructor() { this.list = []; }

  add(text, x, y, { color = '#fff', size = 48, life = 1.2, rise = 40 } = {}) {
    this.list.push({ text, x, y, color, size, life, rise, t: 0 });
  }

  update(dt) {
    for (const f of this.list) {
      f.t += dt;
      f.y -= f.rise * dt;
    }
    this.list = this.list.filter(f => f.t < f.life);
  }

  draw(ctx) {
    for (const f of this.list) {
      const k = f.t / f.life;
      ctx.globalAlpha = 1 - k * k;
      const pop = Math.min(1, f.t * 8) * (1 + 0.15 * Math.max(0, 1 - f.t * 4));
      drawText(ctx, f.text, f.x, f.y, f.size * pop, f.color);
    }
    ctx.globalAlpha = 1;
  }
}

export function drawCountdown(ctx, remaining, subtitle) {
  const n = Math.ceil(remaining);
  const frac = remaining - Math.floor(remaining);
  drawText(ctx, n > 0 ? String(n) : 'GO!', W / 2, 300, 150 * (1 + frac * 0.35), COLORS.yellow);
  if (subtitle) drawText(ctx, subtitle, W / 2, 420, 46);
}
