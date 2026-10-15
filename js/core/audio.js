// Synthesized sound: gentle ambient music for the world plus small effects. No audio files.

let ctx = null;
let master = null;
let musicBus = null;
let volume = 0.6;
let muted = false;

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.35;
    musicBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = v;
  audio();
  master.gain.value = muted ? 0 : volume;
}

// Silences everything while a scene is fast-forwarded (skip / replay).
export function mute(on) {
  muted = on;
  if (master) master.gain.value = muted ? 0 : volume;
}

const midi = n => 440 * 2 ** ((n - 69) / 12);

function tone(freq, start, dur, { type = 'triangle', vol = 0.2, slideTo = null, bus = master, attack = 0.01 } = {}) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(bus);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(start, dur, vol, freq) {
  const c = audio();
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(start);
}

const now = () => audio().currentTime;

export const sfx = {
  jump() { tone(300, now(), 0.25, { type: 'sine', vol: 0.25, slideTo: 720 }); },
  land() { tone(140, now(), 0.15, { type: 'sine', vol: 0.3, slideTo: 70 }); },
  wobble() { const t = now(); [520, 460, 520, 440].forEach((f, i) => tone(f, t + i * 0.07, 0.08, { type: 'sine', vol: 0.12 })); },
  pop() { tone(500, now(), 0.12, { type: 'sine', vol: 0.25, slideTo: 1200 }); },
  rumble() { noise(now(), 1.4, 0.5, 220); },
  clunk() { const t = now(); noise(t, 0.2, 0.35, 900); tone(110, t, 0.2, { type: 'square', vol: 0.06, slideTo: 60 }); },
  charge(k) { tone(220 + k * 500, now(), 0.3, { type: 'sawtooth', vol: 0.05, slideTo: 260 + k * 700 }); },
  chime() { const t = now(); [76, 83, 88].forEach((n, i) => tone(midi(n), t + i * 0.08, 0.9, { vol: 0.12 })); },
  whoosh() { noise(now(), 1.2, 0.4, 1800); },
  discover() {
    const t = now();
    [60, 64, 67, 71, 74, 79].forEach((n, i) => tone(midi(n), t + i * 0.12, 1.6, { vol: 0.1 }));
    tone(midi(48), t, 2.5, { type: 'sine', vol: 0.15, attack: 0.3 });
  },
};

// Ambient: soft pad chords with a sparse plucked melody on top.
const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]];
const SCALE = [72, 74, 76, 79, 81, 84];
let timer = null;

export function startAmbient() {
  if (timer) return;
  const c = audio();
  let bar = 0;
  let next = c.currentTime + 0.1;
  const BAR = 4.2;
  timer = setInterval(() => {
    while (next < c.currentTime + 0.5) {
      const chord = CHORDS[bar % CHORDS.length];
      for (const n of chord) tone(midi(n - 12), next, BAR * 1.1, { type: 'sine', vol: 0.05, bus: musicBus, attack: 1.2 });
      for (let i = 0; i < 6; i++) {
        if (Math.random() < 0.55) tone(midi(SCALE[Math.floor(Math.random() * SCALE.length)]), next + i * (BAR / 6), 1.2, { vol: 0.045, bus: musicBus });
      }
      next += BAR;
      bar++;
    }
  }, 200);
}
