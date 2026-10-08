
import { readFileSync } from 'node:fs';
import { estimateDelay, shiftSignal, estimateGain, extractVocal, alignmentConfidence } from '../js/vocal-extract.js';

const SR = 16000;
const load = (p) => { const b = readFileSync(p); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
const acc = load('/tmp/diag/accomp.raw');
const mix = load('/tmp/diag/mixed.raw');
const trueV = load('/tmp/diag/vocal_true.raw');
const n = Math.min(acc.length, mix.length, trueV.length);

function gen(delayMs, gainDb, comp) {
  const g = Math.pow(10, gainDb / 20);
  const d = Math.max(0, Math.round(SR * delayMs / 1000));
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const src = i - d;
    let v = src >= 0 && src < acc.length ? acc[src] * g : 0;
    if (comp) v = Math.sign(v) * Math.pow(Math.abs(v), 0.9);
    a[i] = v;
  }
  return a;
}
const seg = [10 * SR, 19 * SR];
function snr(est) {
  let sig = 0, noi = 0;
  for (let i = seg[0]; i < seg[1]; i++) { const r = trueV[i]; sig += r * r; const e = est[i] - r; noi += e * e; }
  return 10 * Math.log10(sig / Math.max(noi, 1e-12));
}
console.log('%-32s %10s %8s %14s %10s'.replace(/%\d+s/g, (m) => m));
console.log('场景'.padEnd(28) + '估计延迟'.padStart(10) + '增益'.padStart(9) + '残差比'.padStart(12) + 'SNR'.padStart(10));
console.log('-'.repeat(72));
for (const [dl, gd, cp] of [[0,0,false],[30,0,false],[30,3,false],[150,-2,true],[-80,1.5,true],[13,-0.7,true]]) {
  const a = gen(dl, gd, cp);
  const r = extractVocal(mix.subarray(0,n), a, SR, { gainFromSec: 0, gainToSec: 55 });
  const conf = alignmentConfidence(a.subarray(0,n), mix.subarray(0,n), SR);
  console.log(
    ('delay' + (dl>=0?'+':'') + dl + 'ms gain' + (gd>=0?'+':'') + gd + 'dB c=' + (cp?'y':'n')).padEnd(28) +
    ((r.delaySec*1000).toFixed(1) + 'ms').padStart(10) +
    r.gain.toFixed(3).padStart(9) +
    (r.quality.residualRatio.toFixed(4)).padStart(12) +
    (snr(r.vocal).toFixed(1) + 'dB').padStart(10));
}
