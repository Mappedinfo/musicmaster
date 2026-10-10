import assert from 'node:assert/strict';
import { estimateFixedOffset } from '../tools/vocal-analysis/align.mjs';

const SR = 2000;
function accompaniment(seconds, seed = 17, frequencies = [143, 317]) {
  const pcm = new Float32Array(seconds * SR);
  let x = seed >>> 0, previous = 0, next = 0.2;
  for (let i = 0; i < pcm.length; i++) {
    if (i % 400 === 0) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; previous = next; next = 0.03 + (x / 2 ** 32) * 0.4; }
    const blend = (i % 400) / 400;
    const amp = previous * (1 - blend) + next * blend;
    pcm[i] = amp * (Math.sin(2 * Math.PI * frequencies[0] * i / SR) + 0.3 * Math.sin(2 * Math.PI * frequencies[1] * i / SR));
  }
  return pcm;
}
const reference = accompaniment(110);
const performance = reference.slice(Math.round(0.64 * SR), Math.round(90.64 * SR));
const aligned = estimateFixedOffset(performance, reference, SR, { maxOffsetSec: 5 });
assert.equal(aligned.alignmentTrusted, true);
assert.ok(Math.abs(aligned.offsetSec - 0.64) <= 0.04);
assert.ok(aligned.anchors.every(a => Math.abs(a.referenceSec - a.performanceSec - aligned.offsetSec) <= 0.12));
assert.ok(aligned.anchors.at(-1).performanceSec - aligned.anchors[0].performanceSec > 30);

const louder = performance.map(x => x * 1.8);
const gained = estimateFixedOffset(louder, reference, SR, { maxOffsetSec: 5 });
assert.equal(gained.alignmentTrusted, true, JSON.stringify(gained));
const delayed = new Float32Array(92 * SR);
delayed.set(reference.slice(0, 90 * SR), Math.round(0.4 * SR));
const negative = estimateFixedOffset(delayed, reference, SR, { maxOffsetSec: 5 });
assert.equal(negative.alignmentTrusted, true, JSON.stringify(negative));
assert.ok(Math.abs(negative.offsetSec + 0.4) <= 0.04);

assert.equal(estimateFixedOffset(performance, accompaniment(110, 889), SR, { maxOffsetSec: 5 }).alignmentTrusted, false);
// 同一随机强弱包络，但换成另一组频率：仅 RMS 相关曾可 >.99，不能自动可信。
const wrongContent = accompaniment(110, 17, [239, 433]);
const mismatch = estimateFixedOffset(performance, wrongContent, SR, { maxOffsetSec: 5 });
assert.ok(mismatch.correlation > 0.9, JSON.stringify(mismatch));
assert.equal(mismatch.alignmentTrusted, false);
assert.ok(mismatch.reasons.includes('alignmentContentMismatch'));
// 一处独立噪声仍有同源支持；不能要求所有分离窗口都像无噪声原始 PCM。
const noisyWindow = new Float32Array(performance);
let noiseSeed = 991;
for (let block = 9 * SR; block < 13 * SR; block += 80) {
  let energy = 0;
  for (let i = block; i < block + 80; i++) energy += performance[i] ** 2;
  const level = Math.sqrt(energy / 80);
  for (let i = block; i < block + 80; i++) {
    noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
    noisyWindow[i] += 1.4 * level * (2 * noiseSeed / 2 ** 32 - 1);
  }
}
const noisyAligned = estimateFixedOffset(noisyWindow, reference, SR, { maxOffsetSec: 5 });
assert.equal(noisyAligned.alignmentTrusted, true, JSON.stringify(noisyAligned));
assert.ok(noisyAligned.anchors[0].contentCorrelation < 0.85 && noisyAligned.anchors[0].contentCorrelation >= 0.65);
const replacedWindow = new Float32Array(performance);
replacedWindow.set(wrongContent.slice(Math.round(9.64 * SR), Math.round(13.64 * SR)), 9 * SR);
const replaced = estimateFixedOffset(replacedWindow, reference, SR, { maxOffsetSec: 5 });
assert.equal(replaced.alignmentTrusted, false, JSON.stringify(replaced));
assert.ok(replaced.reasons.includes('alignmentContentMismatch'));
const longReference = accompaniment(270), longCrop = longReference.slice(175 * SR, 265 * SR);
const distantCrop = estimateFixedOffset(longCrop, longReference, SR);
assert.equal(distantCrop.alignmentTrusted, true, JSON.stringify(distantCrop));
assert.ok(Math.abs(distantCrop.offsetSec - 175) <= 0.001);
assert.equal(estimateFixedOffset(new Float32Array(90 * SR), new Float32Array(100 * SR), SR).alignmentTrusted, false);
assert.equal(estimateFixedOffset(performance.slice(0, 10 * SR), reference, SR).alignmentTrusted, false);
const drifted = new Float32Array(90 * SR);
for (let i = 0; i < drifted.length; i++) drifted[i] = reference[Math.floor(i * 1.02)];
assert.equal(estimateFixedOffset(drifted, reference, SR, { maxOffsetSec: 5 }).alignmentTrusted, false);
assert.throws(() => estimateFixedOffset([NaN], [0], SR), /非有限/);
assert.throws(() => estimateFixedOffset(performance, reference, 0), /采样率/);
console.log('RECORDING-ALIGNMENT OK (offset sign, gain, 175s crop, identical envelope/different content, noisy/replaced window, wrong version, silence, short input, tempo drift, validation)');
