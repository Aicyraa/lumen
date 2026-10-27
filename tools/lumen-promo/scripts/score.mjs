// Original warm, piano-led downtempo bed. Deterministic synthesis; no sampled music.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
const destination = fileURLToPath(
  new URL("../public/lumen-score.wav", import.meta.url),
);
const version = "6-warm-keys-no-percussion",
  marker = destination + ".version";
const rate = 24000,
  seconds = 60,
  count = rate * seconds,
  channels = 2;
if (
  existsSync(destination) &&
  statSync(destination).size === 44 + count * channels * 2 &&
  existsSync(marker) &&
  readFileSync(marker, "utf8") === version
)
  process.exit(0);
mkdirSync(fileURLToPath(new URL("../public/", import.meta.url)), {
  recursive: true,
});
const left = new Float64Array(count),
  right = new Float64Array(count);
const tau = 2 * Math.PI,
  beat = 60 / 90,
  hz = (n) => 440 * 2 ** ((n - 69) / 12);
const chords = [
  [50, 57, 60, 64, 69],
  [46, 53, 57, 60, 65],
  [53, 60, 64, 67, 72],
  [48, 55, 59, 62, 67],
];
const add = (start, duration, fn, pan = 0.5) => {
  const first = Math.floor(start * rate),
    last = Math.min(count, Math.floor((start + duration) * rate));
  for (let i = Math.max(0, first); i < last; i++) {
    // Fade every finite voice to zero to prevent clicks at note cutoffs.
    const v = fn((i - first) / rate) * Math.min(1, (last - i) / (rate * 0.03));
    left[i] += v * Math.sqrt(1 - pan);
    right[i] += v * Math.sqrt(pan);
  }
};
for (let step = 0; (step * beat) / 2 < seconds; step++) {
  const start = (step * beat) / 2,
    chord = chords[Math.floor(start / (beat * 8)) % 4];
  const note = chord[[1, 3, 2, 4, 2, 3, 1, 4][step % 8]],
    freq = hz(note);
  const strength = [1, 0.5, 0.7, 0.55, 0.85, 0.45, 0.65, 0.5][step % 8];
  const voice = (age) =>
    0.105 *
    strength *
    (1 - Math.exp(-age * 90)) *
    Math.exp(-age * 3.4) *
    (Math.sin(tau * freq * age) +
      0.18 * Math.exp(-age * 2) * Math.sin(tau * 2 * freq * age) +
      0.035 * Math.sin(tau * 3 * freq * age));
  add(start, 1.5, voice, 0.35 + 0.3 * ((step % 5) / 4));
  add(start + 0.27, 1.5, (a) => voice(a) * 0.16, 0.7);
  if (step % 2 === 0) {
    const bass = hz(chord[0] - 12);
    add(
      start,
      0.7,
      (a) =>
        0.075 *
        (1 - Math.exp(-a * 100)) *
        Math.exp(-a * 4.5) *
        Math.sin(tau * bass * a),
      0.5,
    );
  }
  // No kick, brushed backbeat or click track: keep keys, bass and pad.
}
const chordFreq = chords.map((c) => c.slice(1, 4).map(hz));
for (let i = 0; i < count; i++) {
  const t = i / rate,
    section = Math.floor(t / (beat * 8)),
    pos = t % (beat * 8),
    blend = Math.min(1, pos / 0.9);
  const current = chordFreq[section % 4],
    previous = chordFreq[(section + 3) % 4];
  let pad = 0;
  for (let j = 0; j < 3; j++)
    pad +=
      0.012 *
      ((1 - blend) * Math.sin(tau * previous[j] * t) +
        blend * Math.sin(tau * current[j] * t));
  const fade = Math.min(1, t / 2, (seconds - t) / 3);
  // Master gain keeps this instrumental audible without clipping.
  left[i] = Math.tanh(left[i] + pad) * Math.max(0, fade) * 3.6;
  right[i] = Math.tanh(right[i] + pad * 0.97) * Math.max(0, fade) * 3.6;
}
const buffer = Buffer.alloc(44 + count * 4);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(buffer.length - 8, 4);
buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(2, 22);
buffer.writeUInt32LE(rate, 24);
buffer.writeUInt32LE(rate * 4, 28);
buffer.writeUInt16LE(4, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(count * 4, 40);
for (let i = 0; i < count; i++) {
  buffer.writeInt16LE(Math.round(left[i] * 32767), 44 + i * 4);
  buffer.writeInt16LE(Math.round(right[i] * 32767), 46 + i * 4);
}
writeFileSync(destination, buffer);
writeFileSync(marker, version);
console.log("Prepared 60-second stereo downtempo score at 90 BPM.");
