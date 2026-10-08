// ============================================================
// 音频引擎：麦克风采集 -> 环形缓冲 -> 逐帧 YIN + 频谱特征
// ============================================================
import { yinDetect, rmsLevel, spectralCentroid, spectralRolloff, lowHighRatio, harmonicRatio, h1h2, singerFormantRatio } from './dsp.js';

const FRAME_SIZE = 2048;   // YIN 分析窗口
const HOP_SIZE = 512;      // 每次前移步长 -> 约 86fps @44.1kHz

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
    this._ring = new Float32Array(FRAME_SIZE * 2);
    this._writeIdx = 0;
    this._sinceAnalysis = 0;
    this._running = false;
    this._fftMags = null;
    // 订阅者: (frame) => {} ; frame = { time, frequency, clarity, voiced, rms, db }
    this.onFrame = null;
    // 频谱订阅: ({ mags, centroid, rolloff, lhRatio, hRatio }) => {}
    this.onSpectrum = null;
  }

  get running() { return this._running; }
  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 44100; }

  async start() {
    if (this._running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.audioWorklet.addModule('js/capture-worklet.js');
    const source = this.ctx.createMediaStreamSource(this.stream);
    await this._wireGraph(source);
  }

  /**
   * 测试模式：用振荡器代替麦克风，走完全相同的 分析/worklet 管线。
   * 供自动化冒烟测试在无真实麦克风的环境（CI/headless）验证 DSP 链路。
   */
  async startTest(freq = 220) {
    if (this._running) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.audioWorklet.addModule('js/capture-worklet.js');
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.3;
    osc.connect(gain);
    osc.start();
    this._testOsc = osc;
    await this._wireGraph(gain);
  }

  async _wireGraph(source) {
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.5;
    source.connect(this.analyser);
    this._fftMags = new Float32Array(this.analyser.frequencyBinCount);
    this._fftDb = new Float32Array(this.analyser.frequencyBinCount);

    const node = new AudioWorkletNode(this.ctx, 'capture-processor');
    source.connect(node);
    node.connect(this.ctx.destination); // 不输出声音也需要拉流（部分浏览器要求）
    node.port.onmessage = (e) => this._ingest(e.data);
    this._node = node;
    this._running = true;
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._node) { this._node.disconnect(); this._node.port.onmessage = null; }
    if (this._testOsc) { try { this._testOsc.stop(); } catch (_) {} this._testOsc = null; }
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.ctx) this.ctx.close();
    this.ctx = null; this.stream = null; this.analyser = null;
  }

  _ingest(chunk) {
    if (!this._running) return;
    const ring = this._ring;
    for (let i = 0; i < chunk.length; i++) {
      ring[this._writeIdx] = chunk[i];
      this._writeIdx = (this._writeIdx + 1) % ring.length;
    }
    this._sinceAnalysis += chunk.length;
    if (this._sinceAnalysis >= HOP_SIZE) {
      this._sinceAnalysis = 0;
      this._analyzeFrame();
    }
  }

  _analyzeFrame() {
    const sr = this.ctx.sampleRate;
    const ring = this._ring;
    const frame = new Float32Array(FRAME_SIZE);
    let idx = (this._writeIdx - FRAME_SIZE + ring.length) % ring.length;
    for (let i = 0; i < FRAME_SIZE; i++) {
      frame[i] = ring[idx];
      idx = (idx + 1) % ring.length;
    }
    const rms = rmsLevel(frame);
    const db = 20 * Math.log10(Math.max(rms, 1e-8));
    // 门限：太安静的帧不做基频检测，避免噪声误检
    let pitch = { frequency: 0, clarity: 0, voiced: false };
    if (db > -55) {
      pitch = yinDetect(frame, sr, { threshold: 0.12, minFreq: 60, maxFreq: 1100 });
    }
    const out = {
      time: this.ctx.currentTime,
      frequency: pitch.frequency,
      clarity: pitch.clarity,
      voiced: pitch.voiced && rms > 0.005,
      rms, db,
    };
    if (this.onFrame) this.onFrame(out);

    // 频谱特征
    if (this.analyser && this.onSpectrum) {
      this.analyser.getFloatFrequencyData(this._fftDb);
      // dB -> 线性幅度
      const mags = this._fftMags;
      for (let i = 0; i < mags.length; i++) mags[i] = Math.pow(10, this._fftDb[i] / 20);
      const fftSize = this.analyser.fftSize;
      this.onSpectrum({
        db: this._fftDb,
        mags,
        sampleRate: sr,
        fftSize,
        centroid: spectralCentroid(mags, sr, fftSize),
        rolloff: spectralRolloff(mags, sr, fftSize, 0.85),
        lhRatio: lowHighRatio(mags, sr, fftSize, 2000),
        hRatio: out.voiced ? harmonicRatio(mags, sr, fftSize, out.frequency) : 0,
        h1h2: out.voiced ? h1h2(mags, sr, fftSize, out.frequency) : null,
        sfRatio: singerFormantRatio(mags, sr, fftSize),
      });
    }
  }
}

// ---------- 参考音播放器（练习模式播放目标音） ----------
export class TonePlayer {
  constructor() { this.ctx = null; this._osc = null; this._gain = null; }
  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  /** 播放 freq Hz，duration 秒；返回 Promise 在播完后 resolve */
  play(freq, duration = 1.0, type = 'sine') {
    this._ensure();
    this.stop(0.02);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.03);
    gain.gain.setValueAtTime(0.25, t + Math.max(0.03, duration - 0.05));
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
    this._osc = osc; this._gain = gain;
    return new Promise(res => setTimeout(res, duration * 1000));
  }
  stop(fade = 0.02) {
    if (this._osc && this.ctx) {
      try {
        const t = this.ctx.currentTime;
        this._gain.gain.cancelScheduledValues(t);
        this._gain.gain.setValueAtTime(this._gain.gain.value, t);
        this._gain.gain.linearRampToValueAtTime(0, t + fade);
        this._osc.stop(t + fade + 0.01);
      } catch (e) { /* 已停止 */ }
      this._osc = null;
    }
  }
}
