/**
 * Tiny synthesized board sounds (no audio files to license or download).
 * A short filtered noise burst sounds like a piece being set down.
 */

let ctx: AudioContext | undefined;
let noise: AudioBuffer | undefined;

function audio(): AudioContext | undefined {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    return ctx;
  } catch {
    return undefined;
  }
}

function knock(when: number, frequency: number, gain: number): void {
  const c = audio();
  if (!c || !noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = 1.4;
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, c.currentTime + when);
  amp.gain.exponentialRampToValueAtTime(0.001, c.currentTime + when + 0.08);
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(c.currentTime + when);
}

export type MoveSound = 'move' | 'capture' | 'check' | 'castle';

export function playMoveSound(kind: MoveSound): void {
  switch (kind) {
    case 'capture':
      knock(0, 900, 0.9);
      knock(0.045, 600, 0.6);
      break;
    case 'castle':
      knock(0, 1100, 0.6);
      knock(0.09, 1000, 0.6);
      break;
    case 'check':
      knock(0, 1500, 0.8);
      break;
    default:
      knock(0, 1200, 0.7);
  }
}
