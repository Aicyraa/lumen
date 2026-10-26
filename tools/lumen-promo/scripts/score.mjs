// Original, deterministic electronic score. No samples or external music assets.
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
const destination = fileURLToPath(
  new URL("../public/lumen-score.wav", import.meta.url),
);
const rate = 24000,
  seconds = 60,
  count = rate * seconds;
const marker = destination + ".version";
if (
  existsSync(destination) &&
  statSync(destination).size === 44 + count * 2 &&
  existsSync(marker) &&
  readFileSync(marker, "utf8") === "2"
)
  process.exit(0);
mkdirSync(fileURLToPath(new URL("../public/", import.meta.url)), {
  recursive: true,
});
const pcm = new Float64Array(count);
const tau = 2 * Math.PI;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const chords = [
  [45, 52, 57, 60, 64],
  [41, 48, 53, 57, 60],
  [48, 55, 60, 64, 67],
  [43, 50, 55, 59, 62],
];
const beat = 60 / 110;
for (let i = 0; i < count; i++) {
  const t = i / rate;
  const chord = chords[Math.floor(t / (beat * 8)) % 4];
  let sample = 0;
  // Slow, warm chord bed; low amplitude leaves room for the rhythm.
  for (const note of chord.slice(1))
    sample +=
      0.016 *
      Math.sin(tau * hz(note) * t) *
      (0.75 + 0.25 * Math.sin(tau * 0.15 * t));
  const step = Math.floor(t / (beat / 2));
  const age = t - (step * beat) / 2;
  const note = chord[[1, 3, 2, 4, 1, 2, 3, 4][step % 8]] + 12;
  sample +=
    0.09 *
    Math.exp(-age * 11) *
    (Math.sin(tau * hz(note) * age) + 0.2 * Math.sin(tau * hz(note) * 2 * age));
  const bassAge = t % beat;
  sample += 0.09 * Math.exp(-bassAge * 6) * Math.sin(tau * hz(chord[0]) * t);
  const kickAge = t % (beat * 2);
  sample +=
    0.13 *
    Math.exp(-kickAge * 23) *
    Math.sin(tau * (46 * kickAge + 1.8 * (1 - Math.exp(-kickAge * 45))));
  // Short tonal ticks replace noisy hi-hats for a calm, precise texture.
  sample += 0.012 * Math.exp(-age * 85) * Math.sin(tau * 5300 * age);
  // Original transition sweeps, aligned with the five overlapping scene changes.
  for (const cut of [7.4, 16.8, 27.2, 40.6, 52]) {
    const sweep = t - cut;
    if (sweep >= 0 && sweep < 0.6) {
      const envelope = Math.sin((Math.PI * sweep) / 0.6) ** 2;
      sample +=
        0.055 * envelope * Math.sin(tau * (180 * sweep + 1000 * sweep * sweep));
    }
  }
  const fade = Math.min(1, t / 1.5, (seconds - t) / 3);
  pcm[i] = Math.tanh(sample) * Math.max(0, fade);
}
const buffer = Buffer.alloc(44 + count * 2);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(buffer.length - 8, 4);
buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(rate, 24);
buffer.writeUInt32LE(rate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++)
  buffer.writeInt16LE(Math.round(pcm[i] * 32767), 44 + i * 2);
writeFileSync(destination, buffer);
writeFileSync(marker, "2");
console.log("Prepared original 60-second score.");
