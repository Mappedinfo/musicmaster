// ============================================================
// MusicMaster 核心 DSP 模块（纯函数，无浏览器依赖）
// 浏览器通过 ES Module 引入；Node 测试同样 import 本文件。
// ============================================================

// ---------- 音名与乐理工具 ----------

/** 频率 -> MIDI 音高（浮点）。A4 = 440Hz = MIDI 69 */
export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/** MIDI -> 频率 */
export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI(浮点) -> { name, octave, cents, midiRounded } */
export function midiToNote(midiFloat) {
  const midiRounded = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midiRounded) * 100);
  const idx = ((midiRounded % 12) + 12) % 12;
  const octave = Math.floor(midiRounded / 12) - 1;
  return { name: NOTE_NAMES_SHARP[idx], octave, cents, midi: midiRounded };
}

/** 两频率间的音分差 */
export function centsBetween(f1, f2) {
  return 1200 * Math.log2(f1 / f2);
}

/** 半音偏移(0-11) -> 首调唱名。大小调混合：自然大调音阶为主 */
const SOLFEGE_MAJOR = { 0: 'Do', 2: 'Re', 4: 'Mi', 5: 'Fa', 7: 'Sol', 9: 'La', 11: 'Si' };
export function semitoneToSolfege(semi) {
  const s = ((semi % 12) + 12) % 12;
  return SOLFEGE_MAJOR[s] || null;
}

/** 给定调根音 MIDI 与实际 MIDI，返回首调唱名（不在自然大调音阶上返回 null） */
export function midiToSolfege(midi, rootMidi) {
  return semitoneToSolfege(midi - rootMidi);
}

// ---------- YIN 基频检测 ----------
// 参考: de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency
// estimator for speech and music"。实现差分函数 + 累积均值归一化 +
// 绝对阈值 + 抛物线插值。

/**
 * YIN 基频检测。
 * @param {Float32Array|number[]} buffer 时域采样（建议 2048 点）
 * @param {number} sampleRate 采样率
 * @param {object} opts { threshold=0.12, minFreq=50, maxFreq=1200 }
 * @returns {{frequency:number, clarity:number, voiced:boolean}}
 */
export function yinDetect(buffer, sampleRate, opts = {}) {
  const threshold = opts.threshold ?? 0.12;
  const minFreq = opts.minFreq ?? 50;
  const maxFreq = opts.maxFreq ?? 1200;

  const half = Math.floor(buffer.length / 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(half - 1, Math.ceil(sampleRate / minFreq));
  if (tauMax <= tauMin) return { frequency: 0, clarity: 0, voiced: false };

  // 1. 差分函数 d(tau)
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < half; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // 2. 累积均值归一化差分函数 d'(tau)
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // 3. 绝对阈值：找第一个低于阈值的最深谷
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }

  if (best < 0) {
    // 无可靠周期：回退到全局最小值，但标记为清音
    let min = Infinity, idx = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (cmnd[t] < min) { min = cmnd[t]; idx = t; }
    }
    if (idx < 0) return { frequency: 0, clarity: 0, voiced: false };
    return { frequency: sampleRate / idx, clarity: Math.max(0, 1 - min), voiced: false };
  }

  // 4. 抛物线插值细化 tau
  let tauRefined = best;
  if (best > 0 && best < tauMax) {
    const s0 = cmnd[best - 1], s1 = cmnd[best], s2 = cmnd[best + 1];
    const denom = 2 * s1 - s2 - s0;
    if (Math.abs(denom) > 1e-12) {
      tauRefined = best + (s2 - s0) / (2 * denom);
    }
  }

  const clarity = Math.max(0, 1 - cmnd[best]);
  return { frequency: sampleRate / tauRefined, clarity, voiced: clarity > 0.55 };
}

// ---------- 时域特征 ----------

/** RMS 电平（0-1） */
export function rmsLevel(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

// ---------- 频域特征（输入为幅度谱，线性或 dB 均可，注明） ----------

/**
 * 频谱质心（Hz）。衡量声音"明亮度"。
 * @param {Float32Array|number[]} mags 线性幅度谱
 * @param {number} sampleRate
 * @param {number} fftSize
 */
export function spectralCentroid(mags, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  let num = 0, den = 0;
  for (let i = 1; i < mags.length; i++) {
    const m = mags[i];
    num += i * binHz * m;
    den += m;
  }
  return den > 0 ? num / den : 0;
}

/**
 * 频谱 rolloff：累积能量达到 total*p 的频率（Hz）
 */
export function spectralRolloff(mags, sampleRate, fftSize, p = 0.85) {
  const binHz = sampleRate / fftSize;
  let total = 0;
  for (let i = 1; i < mags.length; i++) total += mags[i];
  const target = total * p;
  let cum = 0;
  for (let i = 1; i < mags.length; i++) {
    cum += mags[i];
    if (cum >= target) return i * binHz;
  }
  return (mags.length - 1) * binHz;
}

/**
 * 低/高频能量比：以 splitHz 为界的能量比（对数 dB）。
 * 用于胸声/头声探索：胸声低频谐波占比通常更高。
 */
export function lowHighRatio(mags, sampleRate, fftSize, splitHz = 2000) {
  const binHz = sampleRate / fftSize;
  let lo = 0, hi = 0;
  for (let i = 1; i < mags.length; i++) {
    const f = i * binHz;
    const e = mags[i] * mags[i];
    if (f < splitHz) lo += e; else hi += e;
  }
  if (hi <= 0 || lo <= 0) return 0;
  return 10 * Math.log10(lo / hi);
}

/**
 * 谐波能量占比估计（简易 HNR 替代指标）。
 * 给定基频，统计基频整数倍 ±tolerance 频带内能量占总能量比例。
 * 清辅音/气声该值低，稳定浊音（良好的闭合与共鸣）该值高。
 */
export function harmonicRatio(mags, sampleRate, fftSize, f0, maxHarmonic = 10, toleranceBins = 2) {
  if (!f0 || f0 <= 0) return 0;
  const binHz = sampleRate / fftSize;
  let total = 0;
  for (let i = 1; i < mags.length; i++) total += mags[i] * mags[i];
  if (total <= 0) return 0;
  let harmonic = 0;
  for (let h = 1; h <= maxHarmonic; h++) {
    const center = Math.round((f0 * h) / binHz);
    for (let b = Math.max(1, center - toleranceBins); b <= Math.min(mags.length - 1, center + toleranceBins); b++) {
      harmonic += mags[b] * mags[b];
    }
  }
  return Math.min(1, harmonic / total);
}

// ---------- 音高序列平滑 ----------

/** 中值滤波（窗口为奇数），输入可含 0（表示无效帧，保持不变） */
export function medianFilter(values, windowSize = 5) {
  const out = new Array(values.length);
  const halfW = Math.floor(windowSize / 2);
  for (let i = 0; i < values.length; i++) {
    if (!values[i]) { out[i] = values[i]; continue; }
    const win = [];
    for (let j = Math.max(0, i - halfW); j <= Math.min(values.length - 1, i + halfW); j++) {
      if (values[j]) win.push(values[j]);
    }
    win.sort((a, b) => a - b);
    out[i] = win.length ? win[Math.floor(win.length / 2)] : values[i];
  }
  return out;
}

// ---------- 练习评分 ----------

/**
 * 对一段音高采样（相对目标音的 cents 数组，已过滤无效帧）评分。
 * @returns {{medianCents:number, inTuneRatio:number, stability:number, score:number}}
 *  inTuneRatio: |cents|<=25 的比例; stability: 标准差(越小越好); score: 0-100
 */
export function scoreCentsSeries(centsSeries) {
  const n = centsSeries.length;
  if (n < 5) return null;
  const sorted = [...centsSeries].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const mean = centsSeries.reduce((a, b) => a + b, 0) / n;
  const variance = centsSeries.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const std = Math.sqrt(variance);
  const inTune = centsSeries.filter(c => Math.abs(c) <= 25).length / n;
  // 综合分：音准(60%) + 稳定(40%)
  const accScore = Math.max(0, 1 - Math.abs(median) / 100);       // 偏差 100 cents -> 0 分
  const stabScore = Math.max(0, 1 - std / 60);                    // 抖动 60 cents -> 0 分
  const score = Math.round(100 * (0.6 * accScore * (0.5 + 0.5 * inTune) + 0.4 * stabScore));
  return {
    medianCents: Math.round(median),
    inTuneRatio: Math.round(inTune * 100),
    stability: Math.round(std),
    score: Math.max(0, Math.min(100, score)),
  };
}
// ---------- 声区/共鸣启发式指标 ----------

/** 第 h 次谐波附近的峰值幅度（带 ±toleranceBins 搜索） */
export function harmonicAmplitude(mags, sampleRate, fftSize, f0, h, toleranceBins = 2) {
  if (!f0 || f0 <= 0) return 0;
  const binHz = sampleRate / fftSize;
  const center = Math.round((f0 * h) / binHz);
  let peak = 0;
  for (let b = Math.max(1, center - toleranceBins); b <= Math.min(mags.length - 1, center + toleranceBins); b++) {
    if (mags[b] > peak) peak = mags[b];
  }
  return peak;
}

/**
 * H1-H2（前两谐波幅度差，dB）。
 * 启发式声区指标：同一音高上，H1-H2 小（甚至为负）通常偏胸声/M1（闭合强）；
 * H1-H2 大通常偏头声/M2（闭合弱、气息多）。返回 null 表示无法估计。
 */
export function h1h2(mags, sampleRate, fftSize, f0) {
  const h1 = harmonicAmplitude(mags, sampleRate, fftSize, f0, 1);
  const h2 = harmonicAmplitude(mags, sampleRate, fftSize, f0, 2);
  if (h1 <= 0 || h2 <= 0) return null;
  return 20 * Math.log10(h1 / h2);
}

/**
 * 歌手共振峰代理：bandLo-bandHi（默认 2.5-3.5 kHz）频带能量占比。
 * 受过训练的歌声会在约 3 kHz 附近形成能量聚集（穿透力来源）。
 */
export function singerFormantRatio(mags, sampleRate, fftSize, bandLo = 2500, bandHi = 3500) {
  const binHz = sampleRate / fftSize;
  let band = 0, total = 0;
  for (let i = 1; i < mags.length; i++) {
    const f = i * binHz;
    const e = mags[i] * mags[i];
    total += e;
    if (f >= bandLo && f <= bandHi) band += e;
  }
  return total > 0 ? band / total : 0;
}
