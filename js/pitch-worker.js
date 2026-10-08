// ============================================================
// 离线音高提取 Worker
// 输入：整首歌的 16kHz 单声道 PCM（Float32Array）
// 输出：每帧的时间 + MIDI 值，用于 K 歌跟唱的参考旋律线
// 放在 Worker 里跑，避免长曲子把主线程卡死
// ============================================================
import { yinDetect, rmsLevel, freqToMidi, medianFilter } from './dsp.js';

const FRAME = 2048;      // YIN 分析窗（16kHz 下约 128ms，可覆盖到 ~70Hz）
const HOP = 480;         // 30ms 一帧，够平滑
const MIN_HZ = 60;
const MAX_HZ = 1100;
const GATE = 0.012;      // RMS 门限（约 -38 dBFS），低于此视为静音

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type !== 'analyze') return;

  const pcm = msg.pcm instanceof Float32Array ? msg.pcm : new Float32Array(msg.pcm);
  const sampleRate = msg.sampleRate || 16000;
  const total = pcm.length;
  const frameCount = total >= FRAME ? Math.floor((total - FRAME) / HOP) + 1 : 0;

  const times = [];
  const midis = [];
  let progressSent = -1;

  const flush = (p) => {
    const pct = Math.max(0, Math.min(1, p));
    if (pct - progressSent >= 0.02 || pct >= 1) {
      progressSent = pct;
      self.postMessage({ type: 'progress', progress: pct });
    }
  };

  if (frameCount === 0) {
    self.postMessage({ type: 'progress', progress: 1 });
    self.postMessage({ type: 'result', times: [], midis: [], frameCount: 0, sampleRate, hopSec: HOP / sampleRate });
    return;
  }

  const buf = new Float32Array(FRAME);
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP;
    buf.set(pcm.subarray(start, start + FRAME));

    const level = rmsLevel(buf);
    let midi = null;
    if (level > GATE) {
      const r = yinDetect(buf, sampleRate, { minFreq: MIN_HZ, maxFreq: MAX_HZ, threshold: 0.14 });
      // 离线转写允许稍低的清晰度门限，避免长音头尾被切掉太多
      if (r.voiced && r.clarity > 0.5 && r.frequency > 0) {
        const m = freqToMidi(r.frequency);
        if (m >= 36 && m <= 100) midi = m;
      }
    }
    times.push(start / sampleRate);
    midis.push(midi);
    if ((f & 63) === 0) flush(f / frameCount);
  }

  // 中值滤波去掉八度跳变之类的毛刺（保留 null 的静音结构）
  const clean = medianFilter(midis, 5);

  flush(1);
  // times/midis 都是普通数组（midis 含 null 表示静音），不能作为 transferable 传出
  self.postMessage({
    type: 'result',
    times,
    midis: clean,
    frameCount,
    sampleRate,
    hopSec: HOP / sampleRate,
  });
};
