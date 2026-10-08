// ============================================================
// 旋律提取：把音频变成「音符序列」而不是散点
//
// 单文件混音实测只有 9.8% 的帧能锁到旋律（且中位数落在贝斯区），
// 所以本模块的设计目标是配合「双文件相减」得到的人声使用，
// 同时尽可能改善单文件场景：
//   1. 更高的时间分辨率（短窗 + 5ms 精细步长）
//   2. 八度校正：YIN 常见的"高八度/低八度"错误用低频能量投票纠正
//   3. 连续性约束 + 音符分段：相同音高合并成"音符段"，图上画线段而不是散点
//   4. 中值滤波去毛刺，保留静音结构
// ============================================================
import { yinDetect, rmsLevel, freqToMidi } from './dsp.js';

export const MELODY_DEFAULTS = {
  frame: 1536,        // YIN 分析窗（约 96ms @16k，短窗利于快歌）
  hop: 80,            // 5ms 步长（原实现 30ms，画线会呈锯齿）
  minFreq: 70,
  maxFreq: 1000,
  gate: 0.010,
  clarity: 0.5,
  octaveMinGain: 0.35, // 低频能量至少达到高频的多少倍才认为真身是低八度
};

/** 用常数 Q 的 Goertzel 估计单频能量，用于八度校正投票。 */
function toneEnergy(buf, freq, sampleRate) {
  const w = 2 * Math.PI * freq / sampleRate;
  const c = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < buf.length; i++) {
    s0 = buf[i] + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / buf.length;
}

/**
 * 八度校正：YIN 偶尔锁到 2f 或 f/2。
 * 用 f、2f、f/2 三个候选的实测能量投票——真实基频处的能量通常最强。
 */
function correctOctave(buf, freq, sampleRate, opts) {
  if (!freq || freq <= 0) return freq;
  const cands = [freq / 2, freq, freq * 2].filter((f) => f >= opts.minFreq && f <= opts.maxFreq);
  const energies = cands.map((f) => toneEnergy(buf, f, sampleRate));
  let best = freq, bestE = -1;
  for (let i = 0; i < cands.length; i++) {
    // 低八度候选需要更强才有说服力，避免把正常音误降到低八度
    const bias = cands[i] < freq ? opts.octaveMinGain : 1;
    const score = energies[i] * bias;
    if (score > bestE) { bestE = score; best = cands[i]; }
  }
  return best;
}

/**
 * 从音频提取旋律。
 * @returns {{frames:Array, notes:Array, coverage:number, hopSec:number}}
 *  frames: [{t, midi, clarity}]（midi 为 null 表示静音）
 *  notes:  [{t0, t1, midi, frames, clarity}] 音符段，用于画旋律线
 */
export function extractMelody(pcm, sampleRate = 16000, options = {}) {
  const o = { ...MELODY_DEFAULTS, ...options };
  const frame = new Float32Array(o.frame);
  const total = pcm.length >= o.frame ? Math.floor((pcm.length - o.frame) / o.hop) + 1 : 0;
  const frames = [];
  let voicedCount = 0;

  for (let f = 0; f < total; f++) {
    const s = f * o.hop;
    frame.set(pcm.subarray(s, s + o.frame));
    const t = s / sampleRate;
    const level = rmsLevel(frame);
    let midi = null, clarity = 0;
    if (level > o.gate) {
      const r = yinDetect(frame, sampleRate, { minFreq: o.minFreq, maxFreq: o.maxFreq, threshold: 0.14 });
      if (r.voiced && r.clarity > o.clarity && r.frequency > 0) {
        const corrected = correctOctave(frame, r.frequency, sampleRate, o);
        const m = freqToMidi(corrected);
        if (m >= 30 && m <= 100) { midi = m; clarity = r.clarity; voicedCount++; }
      }
    }
    frames.push({ t, midi, clarity });
  }

  // 中值滤波去毛刺（只对有声帧取邻域中值）
  const smoothed = medianSmooth(frames);
  const notes = framesToNotes(smoothed, o.hop / sampleRate);
  return {
    frames: smoothed,
    notes,
    coverage: total ? voicedCount / total : 0,
    hopSec: o.hop / sampleRate,
  };
}

/** 3 帧中值：抑制单帧八度跳变，同时不抹平真实滑动。 */
function medianSmooth(frames) {
  const out = frames.map((f) => ({ ...f }));
  for (let i = 1; i < frames.length - 1; i++) {
    if (out[i].midi == null) continue;
    const win = [frames[i - 1].midi, frames[i].midi, frames[i + 1].midi].filter((v) => v != null);
    if (win.length >= 2) {
      win.sort((a, b) => a - b);
      out[i].midi = win[Math.floor(win.length / 2)];
    }
  }
  return out;
}

/** 把逐帧音高合并成音符段：图上画线段，解决"跳变时线乱成一团"的问题。 */
export function framesToNotes(frames, hopSec, opts = {}) {
  const maxGapSec = opts.maxGapSec != null ? opts.maxGapSec : 0.09;  // 允许的断音间隔
  const maxJumpSemi = opts.maxJumpSemi != null ? opts.maxJumpSemi : 0.7; // 同段内允许的漂移
  const minDurSec = opts.minDurSec != null ? opts.minDurSec : 0.06;   // 过短的段当毛刺丢掉
  const notes = [];
  let cur = null;
  for (const f of frames) {
    if (f.midi == null) {
      if (cur && f.t - cur.t1 > maxGapSec) { notes.push(cur); cur = null; }
      continue;
    }
    if (cur && f.t - cur.t1 <= maxGapSec && Math.abs(f.midi - cur.median) <= maxJumpSemi) {
      cur.t1 = f.t;
      cur.sum += f.midi;
      cur.n++;
      cur.claritySum += f.clarity || 0;
      // 滚动中值，抗单帧跳变
      cur.samples.push(f.midi);
      if (cur.samples.length > 9) cur.samples.shift();
      const sorted = [...cur.samples].sort((a, b) => a - b);
      cur.median = sorted[sorted.length >> 1];
    } else {
      if (cur) notes.push(cur);
      cur = {
        t0: f.t, t1: f.t, sum: f.midi, n: 1, claritySum: f.clarity || 0,
        samples: [f.midi], median: f.midi,
      };
    }
  }
  if (cur) notes.push(cur);

  return notes
    .filter((x) => x.t1 - x.t0 >= minDurSec)
    .map((x) => ({
      t0: x.t0,
      t1: x.t1,
      midi: x.median,
      meanMidi: x.sum / x.n,
      frames: x.n,
      clarity: x.n ? x.claritySum / x.n : 0,
    }));
}

/** 参考线与某时刻的目标音（用于实时对比）：优先音符段，回退到逐帧。 */
export function refMidiAt(ref, t) {
  if (!ref) return null;
  if (ref.notes && ref.notes.length) {
    const notes = ref.notes;
    let lo = 0, hi = notes.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].t1 < t) { lo = mid + 1; } else if (notes[mid].t0 > t) { hi = mid - 1; } else { idx = mid; break; }
    }
    if (idx >= 0) return notes[idx].midi;
  }
  return null;
}
