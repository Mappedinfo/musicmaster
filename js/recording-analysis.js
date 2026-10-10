// 录音分析共享内核：只接受 PCM / JSON，不访问浏览器、文件系统或网络。
// 描述录音中的声学现象；有独立参考且对齐已确认时才计算音高匹配分。
import { yinDetect, rmsLevel, freqToMidi, spectralCentroid, lowHighRatio, harmonicRatio, h1h2 } from './dsp.js';

export const RECORDING_DEFAULTS = Object.freeze({
  frameSize: 2048,
  hopSec: 0.02,
  minFreq: 60,
  maxFreq: 1100,
  yinThreshold: 0.14,
  minClarity: 0.8,
  gateRms: 0.008,
  silenceGapSec: 0.3,
  sustainedMinSec: 0.8,
  sustainedSpanCents: 90,
  minEffectiveVoicedSec: 1,
  hitCents: 50,
});

const SOURCES = new Set(['vocal', 'mixed', 'separated', 'unknown']);
const ISSUE_CODES = new Set(['drift', 'instability', 'tailFade', 'pitchFlat', 'pitchSharp', 'pitchError', 'onsetEarly', 'onsetLate']);
const HYPOTHESIS_CODES = new Set(['breathSupport', 'pressedPhonation', 'breathyClosure']);
const MAX_DURATION = 1200;
const MAX_FRAMES = 120000;
const finite = Number.isFinite;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const db = (rms) => 20 * Math.log10(Math.max(1e-8, rms));
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const round = (n, places = 4) => n == null ? null : Number(n.toFixed(places));
const clone = (data) => JSON.parse(JSON.stringify(data));

function quantile(xs, p) {
  if (!xs.length) return null;
  const ordered = [...xs].sort((a, b) => a - b);
  const pos = (ordered.length - 1) * p;
  const i = Math.floor(pos);
  return ordered[i] + (ordered[Math.min(i + 1, ordered.length - 1)] - ordered[i]) * (pos - i);
}
const median = (xs) => quantile(xs, 0.5);

function normalizedOptions(options, sampleRate) {
  const o = { ...RECORDING_DEFAULTS };
  for (const key of Object.keys(o)) {
    if (options[key] != null) {
      if (!finite(options[key])) throw new TypeError(`Invalid option: ${key}`);
      o[key] = options[key];
    }
  }
  if (!Number.isInteger(o.frameSize) || o.frameSize < 256 || o.frameSize > 8192 || (o.frameSize & (o.frameSize - 1))) throw new RangeError('frameSize must be a power of two between 256 and 8192');
  if (o.hopSec < 0.005 || o.hopSec > 0.1) throw new RangeError('hopSec must be between 0.005 and 0.1');
  if (o.minFreq < 40 || o.maxFreq > Math.min(2000, sampleRate / 2) || o.maxFreq <= o.minFreq) throw new RangeError('Invalid pitch range');
  if (o.gateRms <= 0 || o.gateRms > 1 || o.minClarity < 0.55 || o.minClarity > 1 || o.yinThreshold <= 0 || o.yinThreshold >= 1) throw new RangeError('Invalid pitch confidence threshold');
  if (o.silenceGapSec < 0.1 || o.silenceGapSec > 2 || o.sustainedMinSec < 0.5 || o.sustainedMinSec > 10 || o.sustainedSpanCents < 30 || o.sustainedSpanCents > 200 || o.minEffectiveVoicedSec < 0.1 || o.minEffectiveVoicedSec > 20 || o.hitCents < 10 || o.hitCents > 100) throw new RangeError('Invalid recording thresholds');
  o.hopSamples = Math.max(1, Math.round(o.hopSec * sampleRate));
  o.hopSec = o.hopSamples / sampleRate;
  o.timestamp = 'windowCentre';
  o.spectralFeatures = options.spectralFeatures !== false;
  o.h1h2Correction = 'none'; // 原始 H1-H2 未校正声道/共振峰，不能等同声带闭合。
  return o;
}

// Hann + radix-2 FFT。输出线性幅度谱，供已有 DSP 代理量复用。
function spectrumReader(size) {
  const re = new Float64Array(size), im = new Float64Array(size);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const mags = new Float64Array(size / 2);
  return (samples) => {
    for (let i = 0; i < size; i++) { re[i] = samples[i] * window[i]; im[i] = 0; }
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const tmp = re[i]; re[i] = re[j]; re[j] = tmp; }
    }
    for (let len = 2; len <= size; len <<= 1) {
      const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
      for (let i = 0; i < size; i += len) {
        let ur = 1, ui = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const vr = re[b] * ur - im[b] * ui, vi = re[b] * ui + im[b] * ur;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          const next = ur * wr - ui * wi;
          ui = ur * wi + ui * wr; ur = next;
        }
      }
    }
    for (let i = 0; i < mags.length; i++) mags[i] = Math.hypot(re[i], im[i]) * 2 / size;
    return mags;
  };
}

function trend(frames) {
  const x0 = frames[0].t, y0 = median(frames.map((f) => f.midi)) * 100;
  const xs = frames.map((f) => f.t - x0), ys = frames.map((f) => f.midi * 100 - y0);
  const mx = mean(xs), my = mean(ys);
  let cov = 0, vx = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; }
  const slope = vx ? cov / vx : 0;
  const residuals = ys.map((y, i) => y - (my + slope * (xs[i] - mx)));
  const centre = median(residuals);
  return { slope, residuals, spread: 1.4826 * median(residuals.map((y) => Math.abs(y - centre))) };
}

function vibratoOf(residuals, hopSec) {
  // 3–9 Hz 的重复调制作为颤音候选，不以颤音振幅直接惩罚稳定性。
  if (residuals.length * hopSec < 0.8) return null;
  const variance = mean(residuals.map((x) => x * x));
  if (variance < 16) return null;
  let best = -1, bestLag = 0;
  const lo = Math.max(2, Math.ceil(1 / (9 * hopSec))), hi = Math.min(Math.floor(residuals.length / 3), Math.floor(1 / (3 * hopSec)));
  for (let lag = lo; lag <= hi; lag++) {
    let num = 0, da = 0, dbb = 0;
    for (let i = lag; i < residuals.length; i++) { const a = residuals[i], b = residuals[i - lag]; num += a * b; da += a * a; dbb += b * b; }
    const corr = da * dbb ? num / Math.sqrt(da * dbb) : 0;
    if (corr > best) { best = corr; bestLag = lag; }
  }
  const extent = quantile(residuals, 0.95) - quantile(residuals, 0.05);
  return best >= 0.6 && extent <= 220 ? { rateHz: round(1 / (bestLag * hopSec), 2), extentCents: round(extent, 1), periodicity: round(best, 3) } : null;
}

function regionStats(frames, start, end, id, hopSec) {
  const n = Math.max(2, Math.floor(frames.length / 3));
  const first = frames.slice(0, n), last = frames.slice(-n);
  const tr = trend(frames);
  const pitchGaps = frames.reduce((count, f, i) => count + Number(i > 0 && Math.abs(f.t - frames[i - 1].t - hopSec) >= 1e-5), 0);
  const spectral = {};
  for (const key of ['centroidHz', 'h1h2Db', 'harmonicRatio', 'lowHighRatioDb']) {
    spectral[key] = round(median(frames.map((f) => f.spectral?.[key]).filter(finite)));
  }
  return {
    id, start: round(start), end: round(end), durationSec: round(end - start),
    voicedSec: round(frames.length * hopSec), voicedCoverage: round(clamp(frames.length * hopSec / (end - start), 0, 1)),
    pitchGaps, periodicityEvaluated: pitchGaps === 0,
    medianMidi: round(median(frames.map((f) => f.midi))),
    driftCents: round((median(last.map((f) => f.midi)) - median(first.map((f) => f.midi))) * 100, 1),
    slopeCentsPerSec: round(tr.slope, 1),
    residualSpreadCents: round(tr.spread, 1),
    levelDb: round(median(frames.map((f) => db(f.rms))), 2),
    levelDropDb: round(median(last.map((f) => db(f.rms))) - median(first.map((f) => db(f.rms))), 2),
    clarity: round(median(frames.map((f) => f.clarity))),
    // 周期估计只用于均匀检出的区间；缺帧不补值，也不把缺口当成规则采样。
    vibrato: pitchGaps === 0 ? vibratoOf(tr.residuals, hopSec) : null, spectral,
  };
}

function sustainedRegions(frames, durationSec, o) {
  const groups = [];
  let group = [];
  for (const f of frames) {
    if (f.midi == null) continue;
    if (group.length && f.t - group.at(-1).t > o.hopSec + 0.06 + 1e-5) { groups.push(group); group = []; }
    group.push(f);
  }
  if (group.length) groups.push(group);
  const regions = [], halfSmooth = Math.max(1, Math.round(0.14 / o.hopSec));
  for (const fs of groups) {
    const centres = fs.map((_, i) => median(fs.slice(Math.max(0, i - halfSmooth), Math.min(fs.length, i + halfSmooth + 1)).map((f) => f.midi)));
    let first = 0, lo = centres[0], hi = centres[0];
    const finish = (last) => {
      // 只截取窄音高平台。音阶转换和大幅滑音不会进入持续音统计。
      const subset = fs.slice(first, last);
      if (subset.length * o.hopSec < o.sustainedMinSec) return;
      const span = subset.at(-1).t - subset[0].t + o.hopSec;
      if (subset.length * o.hopSec / span < 0.8) return; // 缺口不计入有效时长。
      const tr = trend(subset);
      const centreSpan = (quantile(centres.slice(first, last), 0.95) - quantile(centres.slice(first, last), 0.05)) * 100;
      if (centreSpan > 65 && Math.abs(tr.slope) > 25) return; // 明显单向滑音，保守排除。
      const start = Math.max(0, subset[0].t - o.hopSec / 2), end = Math.min(durationSec, subset.at(-1).t + o.hopSec / 2);
      regions.push(regionStats(subset, start, end, `sustain-${regions.length + 1}`, o.hopSec));
    };
    for (let i = 1; i < fs.length; i++) {
      const nextLo = Math.min(lo, centres[i]), nextHi = Math.max(hi, centres[i]);
      if ((nextHi - nextLo) * 100 > o.sustainedSpanCents) { finish(i); first = i; lo = centres[i]; hi = centres[i]; }
      else { lo = nextLo; hi = nextHi; }
    }
    finish(fs.length);
  }
  return regions;
}

function phraseSegments(frames, durationSec, regions, o) {
  const groups = [];
  let current = [];
  for (const f of frames) {
    if (f.midi == null) continue;
    if (current.length && f.t - current.at(-1).t > o.silenceGapSec) { groups.push(current); current = []; }
    current.push(f);
  }
  if (current.length) groups.push(current);
  return groups.filter((fs) => fs.length * o.hopSec >= 0.16).map((fs, i) => {
    const start = Math.max(0, fs[0].t - o.hopSec / 2), end = Math.min(durationSec, fs.at(-1).t + o.hopSec / 2);
    return {
      id: `phrase-${i + 1}`, start: round(start), end: round(end), voicedSec: round(fs.length * o.hopSec),
      medianMidi: round(median(fs.map((f) => f.midi))), lowMidi: round(quantile(fs.map((f) => f.midi), 0.05)), highMidi: round(quantile(fs.map((f) => f.midi), 0.95)),
      levelDb: round(median(fs.map((f) => db(f.rms))), 2),
      stableRegionIds: regions.filter((r) => r.start >= start - 1e-4 && r.end <= end + 1e-4).map((r) => r.id),
    };
  });
}

function describeIssues(regions, sourceKind) {
  if (sourceKind === 'mixed' || sourceKind === 'unknown') return [];
  const issues = [];
  const add = (code, r, metrics) => issues.push({ id: `observation-${issues.length + 1}`, code, start: r.start, end: r.end, severity: 'notice', metrics });
  for (const r of regions) {
    if (r.durationSec < 1.2 || r.clarity < 0.9) continue;
    // 这些是候选观察，不代表唱错；正常颤音不作为不稳，明确滑音已在上游排除。
    if (r.periodicityEvaluated && Math.abs(r.driftCents) >= 30 && Math.abs(r.slopeCentsPerSec) >= 10 && !r.vibrato) add('drift', r, { driftCents: r.driftCents, slopeCentsPerSec: r.slopeCentsPerSec, durationSec: r.durationSec });
    if (r.periodicityEvaluated && r.residualSpreadCents >= 35 && !r.vibrato) add('instability', r, { residualSpreadCents: r.residualSpreadCents, durationSec: r.durationSec });
    if (r.levelDropDb <= -7) add('tailFade', r, { levelDropDb: r.levelDropDb, pitchDriftCents: r.driftCents, durationSec: r.durationSec });
  }
  return issues;
}

function vocalHypotheses(regions, sourceKind, o) {
  const hypotheses = [], reasons = [];
  const add = (code, selected, evidence, alternatives) => hypotheses.push({
    id: `hypothesis-${hypotheses.length + 1}`, code, confidence: 'low',
    start: Math.min(...selected.map((r) => r.start)), end: Math.max(...selected.map((r) => r.end)),
    evidence: { ...evidence, regionIds: selected.map((r) => r.id) }, alternatives,
    verificationKey: `recording.verify.${code}`,
  });
  if (sourceKind === 'mixed' || sourceKind === 'unknown') return { hypotheses, reasons: [sourceKind === 'mixed' ? 'mixedSource' : 'unknownSource', 'needDryRecording'] };
  if (!regions.length) return { hypotheses, reasons: ['noStableRegions', 'needDryRecording'] };
  const eligible = regions.filter((r) => r.durationSec >= 1.2 && r.clarity >= 0.9);
  const breath = eligible.filter((r) => r.periodicityEvaluated && r.levelDropDb <= -7 && r.driftCents <= -30 && r.slopeCentsPerSec <= -10 && !r.vibrato);
  if (breath.length >= 3) add('breathSupport', breath, {
    repetitions: breath.length, meanTailDropDb: round(mean(breath.map((r) => r.levelDropDb)), 2), meanPitchDriftCents: round(mean(breath.map((r) => r.driftCents)), 1),
  }, ['intentionalExpression', 'volumeChange', 'reverb', ...(sourceKind === 'separated' ? ['separationResidual'] : [])]);
  else reasons.push('breathSupportInsufficientEvidence');

  // H1-H2 是未校正代理量，受元音、力度、声道和录制影响。
  // 模型研究显示其与声门/声道形状关系非单调：doi:10.1121/1.3557040。
  // 健康人 pressed-vs-typical 的指标区分并不稳定：PMID 40021420。
  const spectralRegions = eligible.filter((r) => finite(r.spectral.h1h2Db) && finite(r.spectral.harmonicRatio));
  if (!o.spectralFeatures || spectralRegions.length < 4) {
    reasons.push('pressedPhonationInsufficientEvidence', 'breathyClosureInsufficientEvidence', 'needDryRecording');
    return { hypotheses, reasons };
  }
  const baselineH = median(spectralRegions.map((r) => r.spectral.h1h2Db));
  const baselineRatio = median(spectralRegions.map((r) => r.spectral.harmonicRatio));
  const breathy = spectralRegions.filter((r) => r.spectral.h1h2Db >= baselineH + 6 && r.spectral.harmonicRatio <= baselineRatio - 0.15 && r.spectral.harmonicRatio <= 0.65);
  if (breathy.length >= 2) add('breathyClosure', breathy, {
    repetitions: breathy.length, baselineH1H2Db: round(baselineH, 2), observedH1H2Db: round(mean(breathy.map((r) => r.spectral.h1h2Db)), 2),
    baselineHarmonicRatio: round(baselineRatio), observedHarmonicRatio: round(mean(breathy.map((r) => r.spectral.harmonicRatio))),
  }, ['vowelChange', 'volumeChange', 'reverb', ...(sourceKind === 'separated' ? ['separationResidual'] : [])]);
  else reasons.push('breathyClosureInsufficientEvidence');
  const baselinePitch = median(spectralRegions.map((r) => r.medianMidi));
  const high = spectralRegions.filter((r) => r.medianMidi >= baselinePitch + 3);
  const low = spectralRegions.filter((r) => r.medianMidi < baselinePitch + 1);
  const baselineDb = median(low.map((r) => r.levelDb)), baselineLowH = median(low.map((r) => r.spectral.h1h2Db));
  const pressed = high.filter((r) => r.periodicityEvaluated && baselineDb != null && baselineLowH != null && r.levelDb >= baselineDb + 6 && r.spectral.h1h2Db <= baselineLowH - 6 && r.residualSpreadCents >= 35 && !r.vibrato);
  // 高、响、低 H1-H2 单独均不触发；须另有重复的非周期音高波动。
  if (pressed.length >= 2 && low.length >= 2) add('pressedPhonation', pressed, {
    highRegionCount: pressed.length, baselineH1H2Db: round(baselineLowH, 2), highH1H2Db: round(mean(pressed.map((r) => r.spectral.h1h2Db)), 2),
    baselineRmsDb: round(baselineDb, 2), highRmsDb: round(mean(pressed.map((r) => r.levelDb)), 2), residualSpreadCents: round(mean(pressed.map((r) => r.residualSpreadCents)), 1),
  }, ['vowelChange', 'volumeChange', 'intentionalExpression', 'pitchTrackingError', ...(sourceKind === 'separated' ? ['separationResidual'] : [])]);
  else reasons.push('pressedPhonationInsufficientEvidence');
  if (!hypotheses.length) reasons.push('insufficientRepeatedEvidence', 'needDryRecording');
  return { hypotheses, reasons: [...new Set(reasons)] };
}

/**
 * 分析单声道 PCM。默认 2048 点窗 / 20ms 步长，时间为窗中心。
 * 声源类别来自调用者确认，不从周期性指标臆测；默认 unknown。
 * effectiveVoicedSec = 可信有声帧数 × 步长；range 为 5%/95% 分位，非极限音域。
 */
export function analyzeRecording(pcm, sampleRate = 16000, options = {}) {
  if (!(pcm instanceof Float32Array) && !Array.isArray(pcm) && !(pcm instanceof Float64Array)) throw new TypeError('PCM must be a numeric mono array');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Invalid sample rate');
  const durationSec = pcm.length / sampleRate;
  if (durationSec > MAX_DURATION) throw new RangeError('Recording exceeds the 20 minute analysis limit');
  const o = normalizedOptions(options, sampleRate);
  const sourceKind = options.sourceKind || 'unknown';
  if (!SOURCES.has(sourceKind)) throw new TypeError('Invalid sourceKind');
  const count = pcm.length >= o.frameSize ? Math.floor((pcm.length - o.frameSize) / o.hopSamples) + 1 : 0;
  if (count > MAX_FRAMES) throw new RangeError('Too many analysis frames');
  let peak = 0, clipping = 0, hash = 2166136261;
  for (let i = 0; i < pcm.length; i++) {
    if (!finite(pcm[i])) throw new TypeError('PCM contains a non-finite sample');
    if (Math.abs(pcm[i]) > 8) throw new RangeError('PCM sample exceeds the supported amplitude range');
    peak = Math.max(peak, Math.abs(pcm[i]));
    if (Math.abs(pcm[i]) >= 0.995) clipping++;
    const value = Math.round(clamp(pcm[i], -4, 4) * 32768);
    hash = Math.imul(hash ^ value, 16777619) >>> 0;
  }
  const readSpectrum = o.spectralFeatures ? spectrumReader(o.frameSize) : null;
  const buffer = new Float32Array(o.frameSize), frames = [];
  options.onProgress?.(0);
  for (let i = 0; i < count; i++) {
    const start = i * o.hopSamples;
    for (let j = 0; j < o.frameSize; j++) buffer[j] = pcm[start + j];
    const rms = rmsLevel(buffer), f = { t: (start + o.frameSize / 2) / sampleRate, midi: null, clarity: 0, rms };
    let frequency = 0;
    if (rms >= o.gateRms) {
      const detected = yinDetect(buffer, sampleRate, { minFreq: o.minFreq, maxFreq: o.maxFreq, threshold: o.yinThreshold });
      f.clarity = detected.clarity;
      if (detected.voiced && detected.clarity >= o.minClarity && detected.frequency > 0) { frequency = detected.frequency; f.midi = freqToMidi(frequency); }
    }
    if (readSpectrum && f.midi != null) {
      const mags = readSpectrum(buffer);
      f.spectral = {
        centroidHz: round(spectralCentroid(mags, sampleRate, o.frameSize), 2), h1h2Db: round(h1h2(mags, sampleRate, o.frameSize, frequency), 2),
        harmonicRatio: round(harmonicRatio(mags, sampleRate, o.frameSize, frequency)), lowHighRatioDb: round(lowHighRatio(mags, sampleRate, o.frameSize), 2),
      };
    }
    frames.push(f);
    if (i % Math.max(1, Math.floor(count / 50)) === 0) options.onProgress?.(0.9 * i / count);
  }
  // 仅抑制单帧毛刺，保留 null、真实换音和表达调制。
  const rawMidi = frames.map((f) => f.midi);
  for (let i = 1; i < frames.length - 1; i++) {
    if (rawMidi[i] != null && rawMidi[i - 1] != null && rawMidi[i + 1] != null) frames[i].midi = median(rawMidi.slice(i - 1, i + 2));
  }
  const voiced = frames.filter((f) => f.midi != null);
  const effectiveVoicedSec = Math.min(durationSec, voiced.length * o.hopSec);
  const voicedRatio = frames.length ? voiced.length / frames.length : 0;
  const reasons = [];
  if (durationSec < 1) reasons.push('tooShort');
  if (!voiced.length) reasons.push('noVoice');
  else if (effectiveVoicedSec < o.minEffectiveVoicedSec || voicedRatio < 0.1) reasons.push('lowVoicedCoverage');
  const medianClarity = median(voiced.map((f) => f.clarity));
  if (medianClarity != null && medianClarity < 0.9) reasons.push('lowPitchClarity');
  if (sourceKind === 'mixed') reasons.push('mixedSource');
  if (sourceKind === 'unknown') reasons.push('unknownSource');
  if (sourceKind === 'separated') reasons.push('separationArtifacts');
  const clippingRatio = pcm.length ? clipping / pcm.length : 0;
  if (clippingRatio > 0.001) reasons.push('clipping'); // 解码采样峰接近满幅的比例，不能证明原始设备削波。
  const medianRms = median(frames.map((f) => f.rms));
  if (medianRms != null && medianRms < o.gateRms * 1.5) reasons.push('lowRecordingLevel');
  const status = reasons.some((r) => ['tooShort', 'noVoice', 'lowVoicedCoverage'].includes(r)) ? 'insufficient' : reasons.length ? 'limited' : 'ok';
  const stableRegions = sustainedRegions(frames, durationSec, o);
  const segments = phraseSegments(frames, durationSec, stableRegions, o);
  const inference = status === 'insufficient'
    ? { hypotheses: [], reasons: ['insufficientRepeatedEvidence', 'needDryRecording'] }
    : reasons.includes('clipping')
      ? { hypotheses: [], reasons: ['clipping', 'needDryRecording'] }
      : vocalHypotheses(stableRegions, sourceKind, o);
  const report = {
    schemaVersion: 1,
    metadata: { label: String(options.label || '').slice(0, 500), durationSec, sampleRate, sourceKind, analysisFingerprint: `pcm-fnv1a32-v1:${hash.toString(16).padStart(8, '0')}:${pcm.length}:${sampleRate}` },
    parameters: o,
    quality: { status, reasons, voicedRatio: round(voicedRatio), effectiveVoicedSec: round(effectiveVoicedSec) },
    frames, segments,
    summary: {
      robustRange: { lowMidi: round(quantile(voiced.map((f) => f.midi), 0.05)), highMidi: round(quantile(voiced.map((f) => f.midi), 0.95)) },
      medianMidi: round(median(voiced.map((f) => f.midi))), medianClarity: round(medianClarity), effectiveVoicedSec: round(effectiveVoicedSec),
      samplePeak: round(peak), clippingRatio: round(clippingRatio, 6), medianLevelDb: medianRms == null ? null : round(db(medianRms), 2),
      phraseCount: segments.length, stableRegions, hypothesisReasons: inference.reasons,
    },
    issues: status === 'insufficient' ? [] : describeIssues(stableRegions, sourceKind), hypotheses: inference.hypotheses,
  };
  if (typeof options.sourceHash === 'string' && options.sourceHash.length <= 128) report.metadata.sourceHash = options.sourceHash;
  options.onProgress?.(1);
  return report;
}

function frameAt(frames, time, maxDistance) {
  let lo = 0, hi = frames.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (frames[mid].t < time) lo = mid + 1; else hi = mid - 1; }
  const a = frames[lo], b = frames[lo - 1];
  const nearest = !a ? b : !b ? a : Math.abs(a.t - time) < Math.abs(b.t - time) ? a : b;
  // 不跨静音寻找有声帧，不用宽窗口挑一个最接近目标的音。
  return nearest && Math.abs(nearest.t - time) <= maxDistance ? nearest : null;
}

function octaveDifference(cents) {
  const octaves = Math.round(cents / 1200);
  return octaves !== 0 && Math.abs(cents - octaves * 1200) <= 100 ? octaves : 0;
}

function sameRecordingMetadata(a, b) {
  const first = a?.sourceHash ?? a?.audioIdentity?.sha256, second = b?.sourceHash ?? b?.audioIdentity?.sha256;
  return (typeof first === 'string' && typeof second === 'string' && first.toLowerCase() === second.toLowerCase()) ||
    (a?.analysisFingerprint && a.analysisFingerprint === b?.analysisFingerprint);
}

/**
 * 声部的固定偏移候选：referenceTime = performanceTime + offsetSec。
 * 以有声节奏、300ms 局部音程和去整体调性后的音高轮廓交叉核验，不做 DTW / 时间拉伸。
 * 相同旋律仍可能是另一个版本，唱者也可能抢拍/拖拍；任何候选都不能自动授权评分。
 */
export function estimateRecordingOffset(performance, reference, options = {}) {
  for (const [name, report] of [['performance', performance], ['reference', reference]]) {
    const checked = validateRecordingReport(report);
    if (!checked.valid) throw new TypeError(`Invalid ${name} report: ${checked.errors[0]}`);
  }
  const step = options.offsetGridSec ?? 0.1, maxOffset = options.maxOffsetSec ?? 600;
  if (!finite(step) || step < 0.05 || step > 0.25 || !finite(maxOffset) || maxOffset < 0 || maxOffset > 600) throw new RangeError('Invalid offset search bounds');
  const sample = (report) => {
    const count = Math.floor(report.metadata.durationSec / step), pitches = new Float64Array(count).fill(NaN);
    const tolerance = Math.max(report.parameters.hopSec * 0.75, 0.015);
    for (let i = 0; i < count; i++) {
      const frame = frameAt(report.frames, (i + 0.5) * step, tolerance);
      if (frame?.midi != null && frame.clarity >= 0.9) pitches[i] = frame.midi;
    }
    const intervalLag = Math.max(1, Math.round(0.3 / step));
    const intervals = Float64Array.from(pitches, (pitch, i) => i >= intervalLag && finite(pitch) && finite(pitches[i - intervalLag]) ? pitch - pitches[i - intervalLag] : NaN);
    return { pitches, intervals, voiced: pitches.reduce((n, p) => n + Number(finite(p)), 0) };
  };
  const a = sample(performance), b = sample(reference);
  const baseQuality = { similarity: 0, intervalCorrelation: 0, pitchAgreement: 0, matchedSec: 0, coverage: 0, distinctiveness: 0, anchorSpreadSec: 0, maxAnchorResidualSec: 0 };
  const unavailable = (reasons, quality = baseQuality) => ({ status: 'unavailable', offsetSec: 0, method: 'fixedMelodicRhythm', alignmentTrusted: false, reasons, quality, anchors: [] });
  if (Math.min(a.voiced, b.voiced) * step < 6) return unavailable(['alignmentInsufficientVoicing']);
  const variable = (values) => {
    const valid = [...values].filter(finite);
    if (!valid.length) return false;
    const centre = mean(valid), variance = mean(valid.map((x) => (x - centre) ** 2));
    return variance >= 0.12 && valid.filter((x) => Math.abs(x) >= 0.35).length * step >= 0.8;
  };
  if (!variable(a.intervals) || !variable(b.intervals)) return unavailable(['alignmentNotEnoughVariation']);
  const bounds = (lag) => [Math.max(0, -lag), Math.min(a.pitches.length, b.pitches.length - lag)];
  const measure = (lag, start = 0, end = a.pitches.length, stride = 1) => {
    const [lo, hi] = bounds(lag), from = Math.max(lo, start), to = Math.min(hi, end);
    let paired = 0, voiceA = 0, voiceB = 0, diff = 0, diffSq = 0;
    let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
    for (let i = from; i < to; i += stride) {
      const x = a.pitches[i], y = b.pitches[i + lag];
      voiceA += Number(finite(x)); voiceB += Number(finite(y));
      if (!finite(x) || !finite(y)) continue;
      paired++; diff += x - y; diffSq += (x - y) ** 2;
      const dx = a.intervals[i], dy = b.intervals[i + lag];
      if (!finite(dx) || !finite(dy)) continue;
      n++; sx += dx; sy += dy; xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    if (paired < 12 || n < 12) return null;
    const vx = xx - sx * sx / n, vy = yy - sy * sy / n;
    if (vx / n < 0.06 || vy / n < 0.06) return null;
    const corr = clamp((xy - sx * sy / n) / Math.sqrt(vx * vy), -1, 1);
    const variance = Math.max(0, diffSq / paired - (diff / paired) ** 2);
    const pitchAgreement = Math.exp(-variance / 0.7 ** 2);
    const voiceF1 = 2 * paired / Math.max(1, voiceA + voiceB);
    return { similarity: 0.55 * corr + 0.3 * pitchAgreement + 0.15 * voiceF1,
      intervalCorrelation: corr, pitchAgreement, matchedSec: paired * stride * step,
      coverage: clamp(paired * stride / Math.min(a.voiced, b.voiced), 0, 1) };
  };
  // 搜索工作量有界：最多约 1200 个观测 / 候选；600 秒裁剪仍可找固定偏移。
  const stride = Math.max(1, Math.ceil(Math.min(a.pitches.length, b.pitches.length) / 1200));
  const maxLag = Math.ceil(maxOffset / step), candidates = [];
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const [lo, hi] = bounds(lag);
    if ((hi - lo) * step < 6) continue;
    const quality = measure(lag, lo, hi, stride);
    if (quality && quality.matchedSec >= 6 && quality.coverage >= 0.4) candidates.push({ lag, ...quality });
  }
  candidates.sort((x, y) => y.similarity - x.similarity);
  if (!candidates.length) return unavailable(['alignmentWeakMatch']);
  // 抽样可能漏掉换音，复核前 20 个候选后再择优；仍只允许单个固定偏移。
  const refined = candidates.slice(0, 20).map((c) => ({ lag: c.lag, ...measure(c.lag) })).filter((c) => finite(c.similarity));
  refined.sort((x, y) => y.similarity - x.similarity);
  const best = refined[0];
  if (!best) return unavailable(['alignmentWeakMatch']);
  const alternative = candidates.find((c) => Math.abs(c.lag - best.lag) * step >= 1);
  const distinctiveness = alternative ? Math.max(0, best.similarity - alternative.similarity) : 1;
  const [lo, hi] = bounds(best.lag), width = Math.min(Math.ceil(8 / step), Math.floor((hi - lo) / 3));
  const anchors = [0.15, 0.5, 0.85].map((ratio) => {
    const centre = Math.floor(lo + (hi - lo) * ratio), start = Math.max(lo, centre - Math.floor(width / 2)), end = Math.min(hi, start + width);
    let local = { lag: best.lag, ...measure(best.lag, start, end) };
    for (let lag = best.lag - Math.ceil(0.5 / step); lag <= best.lag + Math.ceil(0.5 / step); lag++) {
      const measured = measure(lag, start, end);
      if (measured && (!finite(local.similarity) || measured.similarity > local.similarity + 1e-9)) local = { lag, ...measured };
    }
    return { performanceSec: centre * step, referenceSec: (centre + local.lag) * step, similarity: finite(local.similarity) ? local.similarity : 0 };
  });
  const maxResidual = Math.max(...anchors.map((anchor) => Math.abs(anchor.referenceSec - anchor.performanceSec - best.lag * step)));
  const quality = { ...baseQuality, ...Object.fromEntries(Object.entries(best).filter(([key]) => key !== 'lag').map(([key, value]) => [key, round(value)])),
    distinctiveness: round(distinctiveness), anchorSpreadSec: round(anchors.at(-1).performanceSec - anchors[0].performanceSec), maxAnchorResidualSec: round(maxResidual) };
  const reasons = [];
  if (best.similarity < 0.78 || best.intervalCorrelation < 0.7 || best.pitchAgreement < 0.65 || anchors.some((anchor) => anchor.similarity < 0.7)) reasons.push('alignmentWeakMatch');
  if (distinctiveness < 0.06) reasons.push('alignmentAmbiguous');
  if (maxResidual > Math.max(0.15, step * 1.5) + 1e-9) reasons.push('alignmentNonFixedOffset');
  if (reasons.length) return unavailable(reasons, quality);
  return { status: 'estimated', offsetSec: round(best.lag * step), method: 'fixedMelodicRhythm', alignmentTrusted: false, reasons: [], quality, anchors };
}

function compareSustainedIntervals(performance, reference, offsetSec) {
  const a = performance.summary.stableRegions, b = reference.summary.stableRegions, pairs = [];
  const reliable = (region) => finite(region.medianMidi) && region.clarity >= 0.9 && region.durationSec >= 0.8;
  for (let i = 1; i < a.length; i++) {
    const before = a[i - 1], after = a[i];
    if (!reliable(before) || !reliable(after) || after.start - before.end > 0.2) continue;
    // 只比较同一句的相邻持续平台，避免把静音后的新句或跳过的音当作音程。
    if (!performance.segments.some((phrase) => before.start >= phrase.start - 1e-3 && after.end <= phrase.end + 1e-3)) continue;
    const times = [before, after].map((r) => (r.start + r.end) / 2 + offsetSec);
    const indices = times.map((time) => b.findIndex((r) => time >= r.start && time <= r.end && reliable(r)));
    if (indices[0] < 0 || indices[1] !== indices[0] + 1) continue;
    const rb = b[indices[0]], ra = b[indices[1]];
    if (ra.start - rb.end > 0.2 || !reference.segments.some((phrase) => rb.start >= phrase.start - 1e-3 && ra.end <= phrase.end + 1e-3)) continue;
    const sung = after.medianMidi - before.medianMidi, expected = ra.medianMidi - rb.medianMidi;
    pairs.push({ start: before.start, end: after.end, performanceIntervalSemitones: round(sung), referenceIntervalSemitones: round(expected), errorCents: round((sung - expected) * 100, 1) });
  }
  if (pairs.length < 3) return null;
  return { method: 'adjacentSustainedRegions', count: pairs.length, medianErrorCents: round(median(pairs.map((p) => p.errorCents)), 1),
    medianAbsErrorCents: round(median(pairs.map((p) => Math.abs(p.errorCents))), 1), within50CentsRatio: round(pairs.filter((p) => Math.abs(p.errorCents) <= 50).length / pairs.length), pairs };
}

/** 独立参考对比：referenceTime = performanceTime + offsetSec；目标 MIDI = reference MIDI + transposeSemitones。 */
export function compareRecording(performance, reference, options = {}) {
  for (const [name, data] of [['performance', performance], ['reference', reference]]) {
    const validation = validateRecordingReport(data);
    if (!validation.valid) throw new TypeError(`Invalid ${name} report: ${validation.errors[0]}`);
  }
  const result = clone(performance);
  const offsetSec = options.offsetSec ?? 0, transposeSemitones = options.transposeSemitones ?? 0;
  if (!finite(offsetSec) || Math.abs(offsetSec) > MAX_DURATION || !finite(transposeSemitones) || Math.abs(transposeSemitones) > 24) throw new RangeError('Invalid comparison alignment');
  const alignmentTrusted = options.alignmentTrusted === true;
  const reasons = [];
  if (!alignmentTrusted) reasons.push('alignmentUntrusted');
  if (performance === reference || sameRecordingMetadata(performance.metadata, reference.metadata)) reasons.push('selfComparison');
  if (performance.quality.status === 'insufficient') reasons.push('performanceInsufficient');
  if (reference.quality.status === 'insufficient' || reference.quality.effectiveVoicedSec < 2) reasons.push('referenceInsufficient');
  if ([performance, reference].some((r) => !['vocal', 'separated'].includes(r.metadata.sourceKind))) reasons.push('sourceUnverified');
  const refVoiced = reference.frames.filter((f) => f.midi != null);
  const refClarity = median(refVoiced.map((f) => f.clarity));
  if (refClarity == null || refClarity < 0.9 || reference.quality.voicedRatio < 0.1) reasons.push('referenceInconsistent');
  const hop = performance.parameters.hopSec, refHop = reference.parameters.hopSec;
  const tolerance = Math.max(hop, refHop) * 0.75;
  const pairs = [], eligible = [];
  for (const r of refVoiced) if (r.t - offsetSec >= 0 && r.t - offsetSec <= performance.metadata.durationSec) eligible.push(r);
  for (const p of performance.frames) {
    if (p.midi == null || p.clarity < 0.9) continue;
    const r = frameAt(reference.frames, p.t + offsetSec, tolerance);
    if (!r || r.midi == null || r.clarity < 0.9) continue;
    pairs.push({ t: p.t, referenceTime: r.t, cents: (p.midi - r.midi - transposeSemitones) * 100 });
  }
  const matchedSec = Math.min(performance.metadata.durationSec, pairs.length * hop);
  const eligibleSec = eligible.length * refHop;
  const coverage = eligibleSec ? clamp(matchedSec / eligibleSec, 0, 1) : 0;
  const overlapSec = Math.max(0, Math.min(performance.metadata.durationSec, reference.metadata.durationSec - offsetSec) - Math.max(0, -offsetSec));
  if (matchedSec < 2 || eligibleSec < 2) reasons.push('insufficientOverlap');
  if (coverage < 0.5) reasons.push('insufficientCoverage');
  const trusted = reasons.length === 0;
  const comparison = {
    status: trusted ? 'ready' : reasons.every((r) => r === 'alignmentUntrusted') ? 'unscored' : 'rejected', reasons: [...new Set(reasons)],
    offsetSec, transposeSemitones, alignmentTrusted,
    referenceMetadata: clone(reference.metadata), referenceFrames: reference.frames.map(({ t, midi, clarity, rms }) => ({ t, midi, clarity, rms })),
    matchedSec: round(matchedSec), coverage: round(coverage), // 兼容别名 = validComparisonRatio。
    eligibleReferenceSec: round(eligibleSec),
    referenceCoverageRatio: overlapSec ? round(clamp(eligibleSec / overlapSec, 0, 1)) : 0,
    performanceDetectedSec: performance.quality.effectiveVoicedSec,
    validComparisonRatio: round(coverage),
    unmatchedReferenceSec: round(Math.max(0, eligibleSec - matchedSec)),
    scoreMetric: 'pairedPitchHitPercent', hitCents: RECORDING_DEFAULTS.hitCents,
    inTuneRatio: trusted ? round(pairs.filter((p) => Math.abs(p.cents) <= RECORDING_DEFAULTS.hitCents).length / pairs.length) : null,
    medianCents: trusted ? round(median(pairs.map((p) => p.cents)), 1) : null,
    octaveDifferenceRatio: trusted ? round(pairs.filter((p) => octaveDifference(p.cents)).length / pairs.length) : null,
    octaveUpRatio: trusted ? round(pairs.filter((p) => octaveDifference(p.cents) > 0).length / pairs.length) : null,
    octaveDownRatio: trusted ? round(pairs.filter((p) => octaveDifference(p.cents) < 0).length / pairs.length) : null,
    score: null,
    intervalComparison: trusted ? compareSustainedIntervals(performance, reference, offsetSec) : null,
  };
  // 这是音高匹配率，不是综合演唱质量；不惩罚旋律变化、滑音或颤音的总方差。
  if (trusted) comparison.score = Math.round(comparison.inTuneRatio * 100);
  result.comparison = comparison;
  result.issues = result.issues.filter((i) => !['pitchFlat', 'pitchSharp', 'pitchError', 'onsetEarly', 'onsetLate'].includes(i.code));
  if (trusted) {
    for (const segment of result.segments) {
      const ps = pairs.filter((p) => p.t >= segment.start && p.t <= segment.end);
      if (ps.length * hop < 0.5) continue;
      const med = median(ps.map((p) => p.cents)), abs = median(ps.map((p) => Math.abs(p.cents)));
      const ratio = ps.filter((p) => Math.abs(p.cents) <= RECORDING_DEFAULTS.hitCents).length / ps.length;
      const octavePairs = ps.filter((p) => octaveDifference(p.cents));
      const octaveRatio = octavePairs.length / ps.length;
      // 整段近八度差独立标记：可能是主动换八度，也可能是追踪错误，不能叫几十音分偏高/低。
      const code = octaveRatio >= 0.5 ? 'pitchError' : med <= -35 ? 'pitchFlat' : med >= 35 ? 'pitchSharp' : abs >= 70 && ratio < 0.5 ? 'pitchError' : null;
      if (code) result.issues.push({ id: `comparison-${result.issues.length + 1}`, code, start: segment.start, end: segment.end, severity: 'notice', metrics: { medianCents: round(med, 1), absMedianCents: round(abs, 1), inTuneRatio: round(ratio), comparedSec: round(ps.length * hop), octaveDifferenceRatio: round(octaveRatio), octaveShiftSemitones: octavePairs.length ? median(octavePairs.map((p) => octaveDifference(p.cents) * 12)) : null } });
    }
    // 起音只比较由静音分出的对应句；数量不同或旋律不相似则不臆测句对齐。
    if (result.segments.length === reference.segments.length) {
      result.segments.forEach((s, i) => {
        const r = reference.segments[i];
        if (Math.abs(s.medianMidi - r.medianMidi - transposeSemitones) > 1) return;
        const difference = s.start + offsetSec - r.start;
        if (Math.abs(difference) < 0.12 || Math.abs(difference) > 0.5) return;
        result.issues.push({ id: `comparison-${result.issues.length + 1}`, code: difference < 0 ? 'onsetEarly' : 'onsetLate', start: s.start, end: Math.min(s.end, s.start + 0.5), severity: 'notice', metrics: { offsetMs: round(difference * 1000, 1), referenceTime: r.start, performanceTime: s.start } });
      });
    }
  }
  return result;
}

/** 导入边界：结构、有限数值、时间区间、数组规模与评分门槛均检查。 */
export function validateRecordingReport(data) {
  const errors = [];
  const object = (x) => x != null && typeof x === 'object' && !Array.isArray(x);
  const bounded = (x, min, max) => finite(x) && x >= min && x <= max;
  const error = (message) => { if (errors.length < 30) errors.push(message); };
  if (!object(data)) return { valid: false, errors: ['Report must be an object'] };
  let nodes = 0;
  const ancestors = new Set();
  const safe = (x, depth = 0) => {
    if (++nodes > 2000000 || depth > 20) { error('JSON report exceeds safety limits'); return; }
    if (x === null || typeof x === 'boolean') return;
    if (typeof x === 'number') { if (!finite(x)) error('Report contains a non-finite number'); return; }
    if (typeof x === 'string') { if (x.length > 10000) error('Report string exceeds safety limit'); return; }
    if (typeof x !== 'object') { error('Report contains a non-JSON value'); return; }
    if (ancestors.has(x)) { error('Report is circular'); return; }
    ancestors.add(x);
    for (const [key, value] of Object.entries(x)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) error('Unsafe report property'); safe(value, depth + 1); if (nodes > 2000000) break; }
    ancestors.delete(x);
  };
  safe(data);
  if (data.schemaVersion !== 1) error('Unsupported schemaVersion');
  const meta = data.metadata || {}, duration = meta.durationSec;
  if (!object(data.metadata) || typeof meta.label !== 'string' || meta.label.length > 500 || !bounded(duration, 0, MAX_DURATION) || !bounded(meta.sampleRate, 8000, 192000) || !SOURCES.has(meta.sourceKind)) error('Invalid metadata');
  if (meta.sourceHash != null && (typeof meta.sourceHash !== 'string' || meta.sourceHash.length > 128)) error('Invalid sourceHash');
  const checkIdentity = (metadata) => {
    const identity = metadata?.audioIdentity;
    if (identity == null) return;
    if (!object(identity) || typeof identity.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(identity.sha256) || !Number.isSafeInteger(identity.byteLength) || identity.byteLength < 0 || typeof identity.name !== 'string' || identity.name.length > 500 || (metadata.sourceHash != null && (typeof metadata.sourceHash !== 'string' || metadata.sourceHash.toLowerCase() !== identity.sha256.toLowerCase()))) error('Invalid or conflicting audioIdentity');
  };
  checkIdentity(meta);
  if (!object(data.parameters) || !bounded(data.parameters.hopSec, 0.005, 0.1) || !Number.isInteger(data.parameters.frameSize) || !bounded(data.parameters.frameSize, 256, 8192) || (data.parameters.frameSize & (data.parameters.frameSize - 1))) error('Invalid analysis parameters');
  const quality = data.quality || {};
  if (!object(data.quality) || !['ok', 'limited', 'insufficient'].includes(quality.status) || !Array.isArray(quality.reasons) || !quality.reasons.every((x) => typeof x === 'string') || !bounded(quality.voicedRatio, 0, 1) || !bounded(quality.effectiveVoicedSec, 0, duration + 1e-3)) error('Invalid quality');
  const checkFrames = (frames, limitDuration, name) => {
    if (!Array.isArray(frames) || frames.length > MAX_FRAMES) { error(`Invalid ${name}`); return; }
    let last = -Infinity;
    for (const f of frames) {
      if (!object(f) || !bounded(f.t, 0, limitDuration + 1e-3) || f.t <= last || !(f.midi === null || bounded(f.midi, 0, 127)) || !bounded(f.clarity, 0, 1) || !bounded(f.rms, 0, 8)) { error(`Invalid ${name} frame`); break; }
      last = f.t;
    }
  };
  checkFrames(data.frames, duration, 'analysis');
  const intervals = (entries, name, predicate = () => true) => {
    if (!Array.isArray(entries) || entries.length > 20000) { error(`Invalid ${name}`); return; }
    const ids = new Set();
    for (const x of entries) {
      if (!object(x) || typeof x.id !== 'string' || ids.has(x.id) || !bounded(x.start, 0, duration + 1e-3) || !bounded(x.end, 0, duration + 1e-3) || x.end <= x.start || !predicate(x)) { error(`Invalid ${name} item`); break; }
      ids.add(x.id);
    }
  };
  intervals(data.segments, 'segments', (x) => bounded(x.medianMidi, 0, 127));
  if (!object(data.summary)) error('Invalid summary');
  else {
    intervals(data.summary.stableRegions, 'stableRegions', (x) => bounded(x.medianMidi, 0, 127) && bounded(x.clarity, 0, 1) && bounded(x.durationSec, 0, duration + 1e-3) && (x.voicedSec == null || bounded(x.voicedSec, 0, x.durationSec + 1e-3)) && (x.voicedCoverage == null || bounded(x.voicedCoverage, 0, 1)));
    if (!Array.isArray(data.summary.hypothesisReasons) || !data.summary.hypothesisReasons.every((r) => typeof r === 'string')) error('Invalid hypothesisReasons');
    const range = data.summary.robustRange;
    if (!object(range) || !((range.lowMidi === null && range.highMidi === null) || (bounded(range.lowMidi, 0, 127) && bounded(range.highMidi, 0, 127) && range.lowMidi <= range.highMidi))) error('Invalid robustRange');
    if (!(data.summary.medianMidi === null || bounded(data.summary.medianMidi, 0, 127))) error('Invalid medianMidi');
  }
  intervals(data.issues, 'issues', (x) => ISSUE_CODES.has(x.code) && ['notice', 'warning'].includes(x.severity) && object(x.metrics));
  intervals(data.hypotheses, 'hypotheses', (x) => HYPOTHESIS_CODES.has(x.code) && ['low', 'moderate'].includes(x.confidence) && (meta.sourceKind !== 'separated' || x.confidence === 'low') && ['vocal', 'separated'].includes(meta.sourceKind) && object(x.evidence) && Array.isArray(x.alternatives) && x.alternatives.length >= 2 && x.alternatives.every((a) => typeof a === 'string') && x.verificationKey === `recording.verify.${x.code}`);
  if (data.comparison != null) {
    const c = data.comparison;
    if (!object(c) || !['ready', 'unscored', 'rejected'].includes(c.status) || !Array.isArray(c.reasons) || !c.reasons.every((r) => typeof r === 'string') || typeof c.alignmentTrusted !== 'boolean' || !bounded(c.offsetSec, -MAX_DURATION, MAX_DURATION) || !bounded(c.transposeSemitones, -24, 24) || !bounded(c.coverage, 0, 1) || !bounded(c.matchedSec, 0, duration + 1e-3)) error('Invalid comparison');
    else {
      if (!object(c.referenceMetadata) || !bounded(c.referenceMetadata.durationSec, 0, MAX_DURATION)) error('Invalid referenceMetadata');
      checkIdentity(c.referenceMetadata);
      checkFrames(c.referenceFrames, c.referenceMetadata?.durationSec ?? 0, 'reference');
      if (c.score !== null && (!bounded(c.score, 0, 100) || c.status !== 'ready' || !c.alignmentTrusted || c.reasons.length || !bounded(c.inTuneRatio, 0, 1) || !finite(c.medianCents))) error('Invalid trusted score');
      if (c.status === 'ready' && c.score == null) error('Ready comparison requires a score');
      if (!bounded(c.eligibleReferenceSec, 0, MAX_DURATION + 0.1) || !bounded(c.referenceCoverageRatio, 0, 1) || !bounded(c.performanceDetectedSec, 0, duration + 1e-3) || !bounded(c.validComparisonRatio, 0, 1) || c.validComparisonRatio !== c.coverage || c.scoreMetric !== 'pairedPitchHitPercent') error('Invalid comparison denominators');
      if (c.status === 'ready' && (c.matchedSec < 2 || c.coverage < 0.5 || quality.status === 'insufficient' || !['vocal', 'separated'].includes(meta.sourceKind) || !['vocal', 'separated'].includes(c.referenceMetadata?.sourceKind) || c.score !== Math.round(c.inTuneRatio * 100) || sameRecordingMetadata(meta, c.referenceMetadata))) error('Comparison does not satisfy scoring gates');
      if (c.alignmentEstimate != null) {
        const estimate = c.alignmentEstimate;
        const q = estimate?.quality;
        if (!object(estimate) || !['estimated', 'unavailable'].includes(estimate.status) || estimate.method !== 'fixedMelodicRhythm' || estimate.alignmentTrusted !== false || !bounded(estimate.offsetSec, -600, 600) || !Array.isArray(estimate.reasons) || !estimate.reasons.every((r) => typeof r === 'string') || !object(q) || !bounded(q.similarity, -1, 1) || !bounded(q.intervalCorrelation, -1, 1) || !bounded(q.pitchAgreement, 0, 1) || !bounded(q.coverage, 0, 1) || !bounded(q.distinctiveness, 0, 1) || !bounded(q.matchedSec, 0, MAX_DURATION + 1) || !bounded(q.anchorSpreadSec, 0, MAX_DURATION) || !bounded(q.maxAnchorResidualSec, 0, 2) || !Array.isArray(estimate.anchors) || estimate.anchors.length > 3 || !estimate.anchors.every((a) => object(a) && bounded(a.performanceSec, 0, duration) && bounded(a.referenceSec, 0, c.referenceMetadata?.durationSec ?? 0) && bounded(a.similarity, -1, 1)) || (estimate.status === 'unavailable' && estimate.offsetSec !== 0) || (estimate.status === 'estimated' && estimate.anchors.length !== 3)) error('Invalid alignmentEstimate');
      }
      if (c.intervalComparison != null) {
        const intervals = c.intervalComparison;
        if (c.status !== 'ready' || !object(intervals) || intervals.method !== 'adjacentSustainedRegions' || !Number.isInteger(intervals.count) || intervals.count < 3 || !Array.isArray(intervals.pairs) || intervals.pairs.length !== intervals.count || intervals.count > 20000 || !bounded(intervals.within50CentsRatio, 0, 1) || !finite(intervals.medianErrorCents) || !bounded(intervals.medianAbsErrorCents, 0, 25400) || !intervals.pairs.every((p) => object(p) && bounded(p.start, 0, duration) && bounded(p.end, p.start, duration) && p.end > p.start && bounded(p.performanceIntervalSemitones, -127, 127) && bounded(p.referenceIntervalSemitones, -127, 127) && bounded(p.errorCents, -25400, 25400))) error('Invalid intervalComparison');
      }
    }
  }
  if (data.score != null || data.summary?.score != null) error('Scores belong only to a trusted reference comparison');
  return { valid: errors.length === 0, errors };
}
