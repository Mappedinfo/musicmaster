
// test/dsp.test.mjs —— 合成信号验证
import { yinDetect, freqToMidi, midiToFreq, centsBetween, scoreCentsSeries, medianFilter, spectralCentroid, h1h2, harmonicRatio } from '../js/dsp.js';

const SR = 44100, N = 4096;
function synth(freq, harmonics = [1], noiseAmp = 0, seconds = N / SR) {
  const n = Math.round(SR * seconds);
  const buf = new Float32Array(N).fill(0);
  for (let i = 0; i < n && i < N; i++) {
    let v = 0;
    harmonics.forEach((a, h) => { v += a * Math.sin(2 * Math.PI * freq * (h + 1) * i / SR); });
    if (noiseAmp) v += noiseAmp * (Math.random() * 2 - 1);
    buf[i] = 0.8 * v;
  }
  return buf;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name, detail || ''); }
  else { fail++; console.log('FAIL', name, detail || ''); }
}

// 1) 纯音检测精度
for (const f of [110, 220, 261.63, 440, 523.25, 880]) {
  const r = yinDetect(synth(f), SR);
  const cents = Math.abs(centsBetween(r.frequency, f));
  check('yin ' + f + 'Hz', r.voiced && cents < 2, 'freq=' + r.frequency.toFixed(2) + ' cents=' + cents.toFixed(2) + ' clarity=' + r.clarity.toFixed(3));
}
// 2) 带泛音（人声更近似）
for (const f of [150, 330]) {
  const r = yinDetect(synth(f, [1, 0.6, 0.4, 0.25, 0.12]), SR);
  const cents = Math.abs(centsBetween(r.frequency, f));
  check('yin-harmonics ' + f + 'Hz', r.voiced && cents < 2, 'cents=' + cents.toFixed(2));
}
// 3) 轻微噪声下仍检测
{
  const r = yinDetect(synth(440, [1], 0.05), SR);
  check('yin-noise 440Hz', r.voiced && Math.abs(centsBetween(r.frequency, 440)) < 3, 'cents=' + Math.abs(centsBetween(r.frequency, 440)).toFixed(2) + ' clarity=' + r.clarity.toFixed(3));
}
// 4) 静音不判 voiced
{
  const r = yinDetect(new Float32Array(N), SR);
  check('silence unvoiced', !r.voiced, 'clarity=' + r.clarity.toFixed(3));
}
// 5) 音符换算
{
  const n440 = freqToMidi(440);
  check('440Hz = MIDI 69', Math.abs(n440 - 69) < 1e-9, String(n440));
  check('midiToFreq 往返', Math.abs(midiToFreq(69) - 440) < 1e-9);
  check('centsBetween 半音=100', Math.abs(centsBetween(466.1638, 440) - 100) < 0.1);
}
// 6) 打分器
{
  const s1 = scoreCentsSeries([0, 5, -5, 10, -8, 3, 0, 12]);
  const s2 = scoreCentsSeries([40, 55, -48, 60, -52, 45]);
  const s3 = scoreCentsSeries([]);
  check('score good > bad', s1.score > s2.score, s1.score + ' vs ' + s2.score);
  check('score good >= 80', s1.score >= 80, String(s1.score));
  check('score empty = null', s3 === null);
}
// 7) 中值滤波去跳变
{
  const x = [100, 101, 250, 99, 100];
  const y = medianFilter(x, 3);
  check('medianFilter removes octave jump', y[2] < 150, y.join(','));
}
// 8) H1-H2 方向性：闭合强(高次谐波多) -> H1-H2 小；气声(基波主导) -> 大
{
  const bright = h1h2(magsOf(synth(200, [1, 0.8, 0.6, 0.5, 0.4])), SR, N, 200);
  const breathy = h1h2(magsOf(synth(200, [1, 0.15, 0.05])), SR, N, 200);
  check('h1h2 direction', bright < breathy, 'bright=' + bright.toFixed(1) + ' breathy=' + breathy.toFixed(1));
}
// 9) 谐波占比：纯周期信号高
{
  const hr = harmonicRatio(magsOf(synth(300, [1, 0.5, 0.3])), SR, N, 300);
  check('harmonicRatio periodic > 0.8', hr > 0.8, hr.toFixed(3));
}

function magsOf(buf) {
  // 简易 DFT 幅度谱（前 2048 bin 足够）
  const bins = 2048;
  const mags = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * n / N));
      const ang = -2 * Math.PI * k * n / N;
      re += buf[n] * w * Math.cos(ang);
      im += buf[n] * w * Math.sin(ang);
    }
    mags[k] = Math.hypot(re, im);
  }
  return mags;
}

console.log('---');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
