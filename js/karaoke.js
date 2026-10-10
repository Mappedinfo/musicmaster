// ============================================================
// K 歌跟唱：本地音频 -> 参考旋律线 -> 实时对比 -> 逐句指导
// 音频不上传；完整演唱由 controller 授权保存到本机 IndexedDB。
// ============================================================
import { freqToMidi, yinDetect, rmsLevel } from './dsp.js';
import { extractVocal } from './vocal-extract.js';
import { extractMelody } from './melody.js';
import { KaraokeRecorder, KaraokeRecordingError } from './karaoke-recording.js';

export const TARGET_SR = 16000;
const LIVE_FRAME = 2048;
const GATE = 0.012;

// ---------- LRC 歌词 ----------
/**
 * 解析 .lrc 文本。
 * 支持 [mm:ss.xx] / [mm:ss.xxx] / [mm:ss] / [mm:ss:xx]，以及一行多个时间标签。
 */
export function parseLRC(text) {
  if (typeof text !== 'string') return [];
  const lines = [];
  const timeRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const times = [];
    let m;
    timeRe.lastIndex = 0;
    while ((m = timeRe.exec(raw))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracRaw = m[3] || '';
      let frac = 0;
      if (fracRaw) frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      times.push(min * 60 + sec + frac);
    }
    if (!times.length) continue;
    const content = raw.replace(timeRe, '').trim();
    for (const t of times) lines.push({ time: t, text: content });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** 当前已开始的歌词行下标；首句开始前与没有歌词时返回 -1。 */
export function activeLyricIndex(lines, t) {
  if (!lines || !lines.length || !Number.isFinite(t)) return -1;
  let lo = 0, hi = lines.length - 1, current = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) { current = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return current;
}

// 按秒搜索完整容差窗口，不能用固定帧数代替时间（参考步长可能为 5/30ms）。
function nearestRef(ref, t, winSec) {
  const times = ref.times;
  const n = times.length;
  if (!n) return null;
  let lo = 0, hi = n - 1, idx = n;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] >= t - winSec) { idx = mid; hi = mid - 1; } else lo = mid + 1;
  }
  let best = null, bestD = Infinity;
  for (let i = idx; i < n && times[i] <= t + winSec; i++) {
    const v = ref.midis[i];
    if (v == null) continue;
    const d = Math.abs(times[i] - t);
    if (d < bestD) { bestD = d; best = v; }
  }
  if (best == null || bestD > winSec) return null;
  return best;
}

// ---------- 实时打分 ----------
/**
 * 唱歌过程中逐帧打分：把每个采样帧和参考旋律线的最近音符比较。
 * 所有帧都会进入分母，所以"没唱"和"唱错"同样计入覆盖率，避免只统计开口的部分。
 */
export class KaraokeScorer {
  constructor(opts = {}) {
    this.ref = opts.ref || { times: [], midis: [] };
    this.lyrics = opts.lyrics || [];
    this.hitCents = opts.hitCents != null ? opts.hitCents : 50;
    this.windowSec = opts.windowSec != null ? opts.windowSec : 0.35;
    this.bucketSec = 4;
    this.buckets = new Map();
    this.total = 0;
    this.evaluated = 0;   // 有参考音高、需要评价的帧（含"没唱"）
    this.voicedFrames = 0; // 其中真实唱出声、可用于统计偏差的帧
    this.missing = 0;      // 有参考但没唱到的帧
    this.hit = 0;
    this.sumAbs = 0;
    this.sumSigned = 0;
    this.octaveUp = 0;
    this.octaveDown = 0;
    this.sqSum = 0;
  }

  get coverage() { return this.total ? this.evaluated / this.total : 0; }
  get inTune() { return this.evaluated ? this.hit / this.evaluated : 0; }
  // 偏差统计只用真实唱出声的帧，否则"一直没开口"会被误报成"整体偏低/偏高"
  get avgAbsCents() { return this.voicedFrames ? this.sumAbs / this.voicedFrames : null; }
  get meanCents() { return this.voicedFrames ? this.sumSigned / this.voicedFrames : null; }
  get stdCents() {
    if (this.voicedFrames < 2) return null;
    const m = this.sumSigned / this.voicedFrames;
    const v = this.sqSum / this.voicedFrames - m * m;
    return v > 0 ? Math.sqrt(v) : 0;
  }

  /** 总分：覆盖率是门槛，音准是主体，稳定性作为质量修正，完全没唱准则大幅衰减。 */
  get score() {
    if (this.total < 20) return 0;
    const cov = this.coverage;
    const tune = this.inTune;
    const std = this.stdCents;
    const stab = std == null ? 1 : Math.max(0, 1 - Math.min(1, std / 90));
    // 判准率越低，"确实唱了且唱对了"的证据越弱：全没唱准时压到 20% 权重
    const recognized = 0.2 + 0.8 * tune;
    const raw = 100 * (0.6 * tune + 0.4 * Math.max(0, Math.min(1, (cov - 0.12) / 0.78)))
      * (0.78 + 0.22 * stab) * recognized;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  /** 送入一帧：t 为歌曲播放时间（秒），midi 为实时检测到的音高（可为 null）。 */
  feed(t, midi) {
    this.total++;
    const bucket = Math.floor(t / this.bucketSec);
    let b = this.buckets.get(bucket);
    if (!b) {
      b = { i: bucket, total: 0, evaluated: 0, voiced: 0, missing: 0, hit: 0, sumAbs: 0, sumSigned: 0 };
      this.buckets.set(bucket, b);
    }
    b.total++;

    const ref = nearestRef(this.ref, t, this.windowSec);
    if (ref == null) return null;

    if (midi == null) {
      // 没唱到：计入分母但不计入偏差统计
      this.evaluated++;
      this.missing++;
      b.evaluated++;
      b.missing = (b.missing || 0) + 1;
      return { ref, cents: null, hit: false };
    }

    const cents = (midi - ref) * 100;
    if (Math.abs(cents) >= 1100) {
      // 差一个八度以上：这是音域问题，不是几十音分的走音，不计入偏差/波动统计
      if (cents > 0) this.octaveUp++; else this.octaveDown++;
      this.evaluated++;
      b.evaluated++;
      return { ref, cents, hit: false, octave: true };
    }

    const a = Math.abs(cents);
    this.evaluated++;
    this.voicedFrames++;
    b.voiced = (b.voiced || 0) + 1;
    this.sumAbs += a;
    this.sumSigned += cents;
    this.sqSum += cents * cents;
    b.evaluated++;
    b.sumAbs += a;
    b.sumSigned += cents;
    const isHit = a <= this.hitCents;
    if (isHit) { this.hit++; b.hit++; }
    return { ref, cents, hit: isHit };
  }

  /** 分段好的/差的片段，带对应歌词。 */
  segments(minFrames = 8) {
    const list = [];
    this.buckets.forEach((b) => {
      if (b.total < minFrames) return;
      const cov = b.evaluated / b.total;
      if (cov < 0.3) return;
      const acc = b.evaluated ? b.hit / b.evaluated : 0;
      const avg = b.voiced ? b.sumAbs / b.voiced : 100;
      const style = acc >= 0.7 ? 'good' : (acc >= 0.45 ? 'mid' : 'bad');
      list.push({ start: b.i * this.bucketSec, end: (b.i + 1) * this.bucketSec, acc, cov, avg, style, text: this._textAt(b.i * this.bucketSec) });
    });
    return list;
  }

  _textAt(t) {
    const i = activeLyricIndex(this.lyrics, t);
    if (i < 0) return '';
    return this.lyrics[i].text || '';
  }

  buildReport() {
    const segs = this.segments();
    const worst = segs.filter((s) => s.style === 'bad').sort((a, b) => a.acc - b.acc).slice(0, 4);
    const best = segs.filter((s) => s.style === 'good').sort((a, b) => b.acc - a.acc).slice(0, 3);
    const report = {
      score: this.score,
      coverage: this.coverage,
      inTuneRatio: this.inTune,
      avgAbsCents: this.avgAbsCents,
      meanCents: this.meanCents,
      stdCents: this.stdCents,
      octaveUp: this.octaveUp,
      octaveDown: this.octaveDown,
      total: this.total,
      evaluated: this.evaluated,
      voicedFrames: this.voicedFrames,
      missing: this.missing,
      segments: segs,
      worst,
      best,
      tips: [],
    };
    report.tips = buildTips(report);
    return report;
  }
}

/** 根据统计结果生成针对性练习建议（不是诊断，只给可执行动作）。 */
export function buildTips(r) {
  const tips = [];
  if (r.total < 150) return [{ key: 'tip.tooShort' }];
  const oct = (r.octaveUp || 0) + (r.octaveDown || 0);
  if (oct >= 5 && (r.voicedFrames || 0) < 10) {
    // 几乎全程和原唱差八度：典型是"这首歌不合你的音域"，而不是音准不好
    tips.push({ key: r.octaveUp >= r.octaveDown ? 'tip.octaveUp' : 'tip.octaveDown' });
    tips.push({ key: 'tip.octaveExtra' });
    return tips;
  }
  if (r.coverage < 0.4 || (r.voicedFrames || 0) < 10) {
    tips.push({ key: 'tip.noVoice' });
    return tips;
  }
  const mean = r.meanCents;
  const abs = r.avgAbsCents;
  if (mean != null && abs != null) {
    if (mean <= -35) tips.push({ key: 'tip.flat', vars: { n: Math.round(Math.abs(mean)) } });
    else if (mean >= 35) tips.push({ key: 'tip.sharp', vars: { n: Math.round(mean) } });
    else if (abs <= 30) tips.push({ key: 'tip.stable', vars: { n: Math.round(abs) } });
    else tips.push({ key: 'tip.unsystematic' });
  }
  if (r.stdCents != null && r.stdCents > 55) tips.push({ key: 'tip.wobble', vars: { n: Math.round(r.stdCents) } });
  if (r.octaveUp + r.octaveDown >= 5) tips.push({ key: 'tip.octaveFrames', vars: { n: r.octaveUp + r.octaveDown } });
  if (r.worst && r.worst.length) {
    const seg = r.worst[0];
    tips.push({
      key: 'tip.worstSeg',
      vars: {
        label: seg.text ? '"' + seg.text.slice(0, 12) + '"' : '',
        near: Math.round(seg.start) + 's',
        t: Math.round(seg.start),
        acc: Math.round(seg.acc * 100),
      },
    });
  }
  if (!tips.length) tips.push({ key: 'tip.keepGoing' });
  return tips;
}

// ---------- 解码 / 重采样 ----------
/**
 * 把上传的音频文件解码成 16kHz 单声道 PCM（供离线提取参考旋律）。
 */
export async function decodeMono(file, targetSr = TARGET_SR) {
  const arrayBuf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  let decoded;
  try {
    decoded = await tmp.decodeAudioData(arrayBuf.slice(0));
  } finally {
    if (tmp.close) tmp.close();
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * targetSr));
  const off = new OfflineAudioContext(1, frames, targetSr);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** Float32 PCM -> 16bit WAV Blob（用于播放"相减提取出的人声"）。 */
export function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** 两级一阶高通：相减后残留的低频伴奏最难抵消，滤掉能显著改善旋律提取。 */
export function highpass(x, sampleRate, cutoffHz) {
  const out = new Float32Array(x.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + 1 / sampleRate);
  let prevIn = x[0] || 0, prevOut = prevIn;
  for (let i = 0; i < x.length; i++) {
    const y = alpha * (prevOut + x[i] - prevIn);
    out[i] = y; prevIn = x[i]; prevOut = y;
  }
  let prevIn2 = out[0], prevOut2 = prevIn2;
  for (let i = 0; i < out.length; i++) {
    const y = alpha * (prevOut2 + out[i] - prevIn2);
    out[i] = y; prevIn2 = out[i]; prevOut2 = y;
  }
  return out;
}

/**
 * 双文件模式：原唱 + 伴奏 -> 相减得到干净人声 -> 提取旋律。
 * 实测（真实歌曲 + 已知人声）相减后人声段旋律覆盖 100%，单文件只有 12%。
 */
export async function buildReferenceFromPair(mixFile, accompFile, opts = {}) {
  const sr = opts.sampleRate || TARGET_SR;
  const [mixPcm, accPcm] = await Promise.all([decodeMono(mixFile, sr), decodeMono(accompFile, sr)]);
  const n = Math.min(mixPcm.length, accPcm.length);
  const ex = extractVocal(mixPcm.subarray(0, n), accPcm.subarray(0, n), sr, opts);
  const vocal = highpass(ex.vocal, sr, 110);
  const mel = extractMelody(vocal, sr, opts.melody || {});
  // 统一成 scorer / 绘图都认识的参考线格式：逐帧数组 + 音符段
  const times = mel.frames.map((f) => f.t);
  const midis = mel.frames.map((f) => f.midi);
  const melody = { times, midis, hopSec: mel.hopSec, notes: mel.notes, coverage: mel.coverage };
  return {
    melody, vocal,
    quality: ex.quality,
    delaySec: ex.delaySec,
    gain: ex.gain,
    reversed: !!ex.reversed,
    vocalBlob: opts.keepVocalBlob === false ? null : encodeWav(vocal, sr),
  };
}

/**
 * 把整首歌交给 Worker 逐帧提取参考旋律线。
 * @returns {Promise<{times:number[], midis:(number|null)[], hopSec:number}>}
 */
export function extractReference(pcm, sampleRate = TARGET_SR, onProgress = null) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./pitch-worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'progress') {
        if (onProgress) onProgress(msg.progress);
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve({ times: msg.times, midis: msg.midis, hopSec: msg.hopSec || 0.03 });
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error('音高提取失败：' + (err.message || 'unknown')));
    };
    const copy = new Float32Array(pcm);
    worker.postMessage({ type: 'analyze', pcm: copy, sampleRate }, [copy.buffer]);
  });
}

// ---------- 播放 + 麦克风 ----------
/**
 * BGM 播放与人声采集。
 * - 音频文件只在内存里，通过 <audio> 的 blob URL 播放；stop() 时立即 revoke。
 * - 麦克风单独开一个 AudioContext，用相同参数的 YIN 做实时逐帧音高。
 */
export class KaraokePlayer {
  constructor(opts = {}) {
    this.onTime = opts.onTime || (() => {});
    this.onEnded = opts.onEnded || (() => {});
    this.onBlocked = opts.onBlocked || (() => {});
    this.onFrame = opts.onFrame || (() => {});
    this.onTakeLimit = opts.onTakeLimit || (() => {});
    this.onTakeError = opts.onTakeError || (() => {});
    this._recorder = new KaraokeRecorder({ getSongTime: () => this.currentTime,
      onLimit: event => this.onTakeLimit(event), onError: error => this.onTakeError(error) });
    this._micSource = null;
    this._micStopping = null;
    this._micStarting = null;
    this._micGeneration = 0;
    this.audio = null;
    this.url = null;
    this.ready = false;
    this.playing = false;
    this.duration = 0;
    this.volume = 0.9;
    this.micCtx = null;
    this.micStream = null;
    this.micAnalyser = null;
    this.micBuf = null;
    this.micSince = 0;
    this.lastEval = null;
    this.micOn = false;
    this._raf = 0;
    this._wired = false;
    this.audio = typeof Audio === 'function' ? new Audio() : null;
    if (this.audio) this._wireAudio();
  }

  /** 首个 Audio 元素的事件绑定（Node 下没有 Audio，跳过）。 */
  _wireAudio() {
    if (this._wired || !this.audio) return;
    this._wired = true;
    const A = this.audio;
    A.preload = 'auto';
    A.crossOrigin = 'anonymous';
    if (typeof A.volume === 'number') A.volume = this.volume;
    A.addEventListener('timeupdate', () => this.onTime(A.currentTime, this.duration));
    A.addEventListener('durationchange', () => { this.duration = A.duration || 0; });
    A.addEventListener('loadedmetadata', () => {
      this.duration = A.duration || 0;
      this.ready = true;
    });
    A.addEventListener('playing', () => {
      this.playing = true;
      this._recorder.resume().catch(error => this.onTakeError(error));
    });
    A.addEventListener('pause', () => { this.playing = false; void this._recorder.pause(); });
    A.addEventListener('ended', () => {
      this.playing = false;
      this._stopLoops();
      void this._recorder.pause();
      this.onEnded();
    });
    A.addEventListener('error', () => {
      void this.pause();
      this.ready = false;
      this.onBlocked('音频加载失败，请换一个文件');
    });
  }

  /** 从 Blob / File 加载播放源（伴奏或提取出的人声都可以）。 */
  async loadBlob(blob) { return this.load(blob); }

  async load(file) {
    this._requireFinishedTake();
    if (!this.audio) return 0;
    this.release();
    this.url = URL.createObjectURL(file);
    this.audio.src = this.url;
    await this.audio.play().catch(() => {});
    this.audio.pause();
    this.audio.currentTime = 0;
    if (!this.ready) {
      await new Promise((resolve) => {
        const done = () => resolve();
        this.audio.addEventListener('loadedmetadata', done, { once: true });
        setTimeout(done, 4000);
      });
      this.duration = this.audio.duration || 0;
      this.ready = true;
    }
    return this.duration;
  }

  async play() {
    if (!this.audio || !this.url) return false;
    try {
      await this.audio.play();
    } catch (err) {
      this.playing = false;
      this._stopLoops();
      await this._recorder.pause();
      this.onBlocked('点击画面后重试：浏览器需要一次用户操作才能播放音频');
      return false;
    }
    this._startLoops();
    return true;
  }

  pause() {
    if (this.audio) this.audio.pause();
    this.playing = false;
    this._stopLoops();
    return this._recorder.pause();
  }

  restart() {
    this._requireFinishedTake();
    if (!this.audio) return;
    try { this.audio.currentTime = 0; } catch (err) { /* ignore */ }
  }

  async seek(t) {
    this._requireFinishedTake();
    if (!this.audio || !this.duration) return;
    try { this.audio.currentTime = Math.max(0, Math.min(this.duration, t)); } catch (err) { /* ignore */ }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this.volume;
  }

  get currentTime() { return this.audio ? (this.audio.currentTime || 0) : 0; }
  get takeActive() { return this._recorder.takeActive; }
  get takeState() { return this._recorder.takeState; }
  get takeId() { return this._recorder.takeId; }

  _requireFinishedTake() {
    if (this.takeActive) throw new KaraokeRecordingError('takeActive', '请先完成或放弃当前录音，再切换歌曲位置。');
  }

  /** 准备 take；只有实际 playing 事件才启动连续采集，预加载不进入录音。 */
  async beginTake(options = {}) {
    try {
      if (this._micStopping) await this._micStopping;
      if (!this.micOn || !this.micCtx || !this._micSource) throw new KaraokeRecordingError('mediaUnavailable', '请先启用麦克风，再开始本次录音。');
      const context = this.micCtx;
      await this._recorder.attach(context, this._micSource);
      if (!this.micOn || this.micCtx !== context) {
        await this._recorder.detach();
        throw new KaraokeRecordingError('mediaUnavailable', '麦克风已关闭；尚未开始本次录音。');
      }
      const take = this._recorder.begin(options);
      if (this.playing) await this._recorder.resume();
      return take;
    } catch (error) { this.onTakeError(error); throw error; }
  }
  finishTake(reason = 'finished') { return this._recorder.finish(reason); }
  discardTake() { return this._recorder.discard(); }

  /** 开启麦克风（可单独开关，K 歌播放前必须打开）。 */
  async startMic(echoCancel = false) {
    if (this._micStopping) await this._micStopping;
    if (this._micStarting) await this._micStarting;
    if (this.micOn) return;
    const starting = this._openMicrophone(echoCancel, ++this._micGeneration);
    this._micStarting = starting;
    try { await starting; } finally { if (this._micStarting === starting) this._micStarting = null; }
  }

  async _openMicrophone(echoCancel, generation) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC || !globalThis.navigator?.mediaDevices?.getUserMedia) throw new KaraokeRecordingError('mediaUnavailable', '浏览器无法使用麦克风；请使用 HTTPS 并检查麦克风权限。');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: !!echoCancel,
        noiseSuppression: !!echoCancel,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    let context;
    try {
      if (generation !== this._micGeneration) throw new KaraokeRecordingError('mediaUnavailable', '麦克风请求已取消。');
      try { context = new AC({ sampleRate: TARGET_SR }); } catch { context = new AC(); }
      if (context.state === 'suspended') await context.resume();
      if (generation !== this._micGeneration) throw new KaraokeRecordingError('mediaUnavailable', '麦克风请求已取消。');
      const src = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = LIVE_FRAME;
      src.connect(analyser);
      this.micStream = stream; this.micCtx = context; this._micSource = src;
      this.micAnalyser = analyser;
      this.micBuf = new Float32Array(LIVE_FRAME);
      this.micSince = 0;
      this.micOn = true;
      if (this.takeActive) {
        await this._recorder.attach(context, src);
        if (this.playing) await this._recorder.resume();
      }
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      await this._recorder.detach();
      if (context) await context.close().catch(() => {});
      this.micStream = null; this.micCtx = null; this._micSource = null;
      this.micAnalyser = null; this.micBuf = null; this.micOn = false;
      throw error;
    }
  }

  _stopLoops() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
  }

  _startLoops() {
    this._stopLoops();
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.3, (now - last) / 1000);
      last = now;
      this._pump(dt);
      this.onTime(this.currentTime, this.duration);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** 按真实时间步长抽取麦克风样本，保证打分帧率不随画面帧率漂移。 */
  _pump(dt) {
    this.micSince += dt;
    if (!this.micOn || !this.micAnalyser || this.micSince < 0.05) return;
    this.micSince = 0;
    this.micAnalyser.getFloatTimeDomainData(this.micBuf);
    const level = rmsLevel(this.micBuf);
    let midi = null;
    let voiced = false;
    let clarity = 0;
    if (level > GATE) {
      const r = yinDetect(this.micBuf, this.micCtx.sampleRate, { minFreq: 60, maxFreq: 1100, threshold: 0.14 });
      if (r.voiced && r.clarity > 0.5 && r.frequency > 0) {
        midi = freqToMidi(r.frequency);
        voiced = true;
        clarity = r.clarity;
      }
    }
    this.lastEval = { t: this.currentTime, midi, voiced, clarity, level };
    this.onFrame(this.lastEval);
  }

  /** 暂停采集时保留已导入歌曲，重新启用麦克风后可以继续练习。 */
  stopMicrophone() {
    this._micGeneration++;
    if (this._micStopping) return this._micStopping;
    void this.pause();
    const stream = this.micStream, context = this.micCtx;
    this.micStream = null; this.micCtx = null; this._micSource = null;
    this.micAnalyser = null; this.micBuf = null; this.micOn = false;
    this._micStopping = (async () => {
      await this._recorder.detach();
      stream?.getTracks().forEach(track => track.stop());
      if (context) await context.close().catch(() => {});
    })().finally(() => { this._micStopping = null; });
    return this._micStopping;
  }

  stop() {
    this._stopLoops();
    try { if (this.audio) this.audio.pause(); } catch (err) { /* ignore */ }
    this.playing = false;
    this.stopMicrophone();
    this.release();
  }

  /** 释放 blob URL 与音频源（不保留任何歌曲数据）。 */
  release() {
    void this._recorder.pause();
    if (this.url && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    try { if (this.audio) { this.audio.removeAttribute('src'); this.audio.load(); } } catch (err) { /* ignore */ }
    this.ready = false;
    this.playing = false;
    this.duration = 0;
  }
}

// 音名显示由 app.js 的 noteText() 统一负责，因为它要套用用户选择的八度基准
