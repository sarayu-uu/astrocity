// Tiny synthesized sound kit, so the prototype needs no audio files.

let ctx = null;
let master = null;

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const midi = n => 440 * 2 ** ((n - 69) / 12);

function tone(freq, start, dur, { type = 'triangle', vol = 0.25, slideTo = null } = {}) {
  const c = audio();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const now = () => audio().currentTime;

export const sfx = {
  jump() { tone(320, now(), 0.22, { type: 'sine', vol: 0.3, slideTo: 760 }); },
  star() {
    const t = now();
    tone(988, t, 0.12, { vol: 0.2 });
    tone(1319, t + 0.08, 0.22, { vol: 0.2 });
  },
  bonk() { tone(240, now(), 0.35, { type: 'sine', vol: 0.35, slideTo: 90 }); },
  pop() { tone(700, now(), 0.08, { type: 'square', vol: 0.06, slideTo: 1400 }); },
  freeze() {
    const t = now();
    tone(1500, t, 0.35, { type: 'sine', vol: 0.18, slideTo: 500 });
    tone(2093, t + 0.05, 0.3, { vol: 0.08 });
  },
  giggle() {
    const t = now();
    [660, 760, 640, 740].forEach((f, i) => tone(f, t + i * 0.09, 0.08, { type: 'sine', vol: 0.18 }));
  },
  cheer() {
    const t = now();
    [60, 64, 67, 72, 76].forEach((n, i) => tone(midi(n), t + i * 0.09, 0.3, { vol: 0.2 }));
  },
};

// A bouncy looping tune for Freeze Dance: 32 eighth-note steps.
const MELODY = [72, null, 76, 79, 76, null, 72, null, 74, null, 77, 81, 79, null, 77, null,
  76, null, 79, 84, 81, null, 79, 76, 74, 76, 77, 79, 76, null, 72, null];
const BASS = [48, 53, 55, 48];

let timer = null;
let step = 0;
let nextTime = 0;

export function startMusic(bpm = 124) {
  if (timer) return;
  const c = audio();
  const stepDur = 60 / bpm / 2;
  step = 0;
  nextTime = c.currentTime + 0.05;
  timer = setInterval(() => {
    while (nextTime < c.currentTime + 0.12) {
      if (MELODY[step] !== null) tone(midi(MELODY[step]), nextTime, stepDur * 0.9, { type: 'square', vol: 0.06 });
      if (step % 2 === 0) tone(150, nextTime, 0.12, { type: 'sine', vol: 0.35, slideTo: 50 });
      if (step % 4 === 0) tone(midi(BASS[Math.floor(step / 8)]), nextTime, stepDur * 3, { type: 'triangle', vol: 0.22 });
      nextTime += stepDur;
      step = (step + 1) % MELODY.length;
    }
  }, 25);
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
}
