let audioCtx = null;
let muted = false;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, duration = 0.15, type = 'sine', volume = 0.3) {
  if (muted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* silent fail */ }
}

function playSequence(notes, interval = 0.12) {
  if (muted) return;
  notes.forEach(([freq, dur, type], i) => {
    setTimeout(() => playTone(freq, dur || 0.15, type || 'sine', 0.25), i * interval * 1000);
  });
}

export function playCorrect() {
  playSequence([[523, 0.1], [659, 0.1], [784, 0.2]], 0.08);
}

export function playWrong() {
  playSequence([[400, 0.15, 'square'], [300, 0.2, 'square']], 0.12);
}

export function playAchievement() {
  playSequence([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.3]], 0.1);
}

export function playClick() {
  playTone(800, 0.05, 'sine', 0.1);
}

export function playLevelUp() {
  playSequence([[262, 0.1], [330, 0.1], [392, 0.1], [523, 0.1], [659, 0.1], [784, 0.3]], 0.08);
}

export function playStreak() {
  playSequence([[440, 0.08], [554, 0.08], [659, 0.15]], 0.06);
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }
