// 实时文字教练：只描述当前声音与可靠参考的关系，不推断挤嗓或声带状态。
// level 是线性 PCM RMS；t 是歌曲播放秒。暂停、回退与大幅跳转不会累积旧证据。
const DEFAULTS = Object.freeze({
  minClarity: 0.85, voiceGate: 0.008,
  pitchEnterCents: 45, pitchReleaseCents: 25, inTuneCents: 30,
  loudRms: 0.5, loudReleaseRms: 0.35,
  minDisplaySec: 0.9, pitchEvidenceSec: 0.45, stateEvidenceSec: 0.4,
  noVoiceEvidenceSec: 0.75, loudEvidenceSec: 0.25, tailEvidenceSec: 0.3,
  pitchWindowSec: 0.65, tailWindowSec: 1.8, minTailSec: 1.3, tailDropDb: 7,
  maxFrameGapSec: 0.75, minEvidenceFrames: 4,
});
const PITCH_CODES = new Set(['onPitch', 'flat', 'sharp', 'octaveUp', 'octaveDown', 'tailDrop']);
const TONES = { onPitch: 'positive', flat: 'notice', sharp: 'notice', octaveUp: 'notice', octaveDown: 'notice', noVoice: 'notice', tooLoud: 'notice', tailDrop: 'notice' };
const finite = Number.isFinite;
const db = (level) => 20 * Math.log10(Math.max(1e-8, level));
function quantile(xs, p) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b), position = (sorted.length - 1) * p, i = Math.floor(position);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (position - i);
}
const median = (xs) => quantile(xs, 0.5);

export class LiveSingingCoach {
  constructor(options = {}) {
    this.options = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (options[key] == null) continue;
      if (!finite(options[key]) || options[key] < 0) throw new RangeError(`Invalid live coach option: ${key}`);
      this.options[key] = options[key];
    }
    const o = this.options;
    if (o.minClarity < 0.5 || o.minClarity > 1 || o.voiceGate <= 0 || o.loudReleaseRms <= o.voiceGate || o.loudRms <= o.loudReleaseRms || o.loudRms > 1 || o.pitchEnterCents <= o.pitchReleaseCents || o.pitchEnterCents > 300 || o.inTuneCents >= o.pitchEnterCents || o.pitchWindowSec <= 0 || o.tailWindowSec < o.minTailSec || o.tailWindowSec > 30 || o.minTailSec < 0.5 || o.maxFrameGapSec <= 0 || o.maxFrameGapSec > 5 || !Number.isInteger(o.minEvidenceFrames) || o.minEvidenceFrames < 2 || o.minEvidenceFrames > 100 || ['minDisplaySec', 'pitchEvidenceSec', 'stateEvidenceSec', 'noVoiceEvidenceSec', 'loudEvidenceSec', 'tailEvidenceSec'].some((key) => o[key] > 30)) throw new RangeError('Inconsistent live coach thresholds');
    this.reset();
  }

  reset() {
    this.lastTime = null;
    this.pitchHistory = [];
    this.tailHistory = [];
    this.pending = null;
    this.current = { code: 'idle', vars: {}, tone: 'neutral', sinceSec: 0 };
    return this._snapshot();
  }

  _snapshot() { return { ...this.current, vars: { ...this.current.vars } }; }
  _show(code, vars, t) { this.current = { code, vars: { ...vars }, tone: TONES[code] ?? 'neutral', sinceSec: t }; this.pending = null; }

  /** 返回当前应展示的一个提示。evaluation 必须是本帧的结果，不能复用过期 lastEval。 */
  feed(frame, evaluation = null) {
    const t = frame?.t;
    if (!finite(t) || t < 0) return this._snapshot();
    if (this.lastTime != null && (t < this.lastTime - 1e-3 || t - this.lastTime > this.options.maxFrameGapSec)) this.reset();
    if (this.lastTime != null && t <= this.lastTime) {
      // 重复播放时刻不累积证据，但本帧失去检测/参考时仍撤去旧的音高结论。
      if (PITCH_CODES.has(this.current.code) && !(frame.voiced === true && finite(frame.midi) && finite(frame.level) && frame.level >= this.options.voiceGate && frame.clarity >= this.options.minClarity && finite(evaluation?.ref) && finite(evaluation?.cents))) {
        this.pitchHistory = []; this.tailHistory = [];
        this._show(finite(frame.level) && frame.level >= this.options.voiceGate ? 'uncertain' : 'listening', {}, t);
      }
      return this._snapshot();
    }
    const delta = this.lastTime == null ? 0 : t - this.lastTime;
    this.lastTime = t;
    if (this.current.code === 'idle') this._show('listening', {}, t);
    const o = this.options, validLevel = finite(frame.level) && frame.level >= 0;
    const level = validLevel ? frame.level : 0, sounding = validLevel && level >= o.voiceGate;
    const reliable = sounding && frame.voiced === true && finite(frame.midi) && frame.midi >= 0 && frame.midi <= 127 && finite(frame.clarity) && frame.clarity >= o.minClarity;
    const hasReference = finite(evaluation?.ref) && evaluation.ref >= 0 && evaluation.ref <= 127;
    const validPitch = reliable && hasReference && finite(evaluation.cents);
    if (validPitch) this.pitchHistory.push({ t, cents: evaluation.cents });
    else this.pitchHistory = [];
    this.pitchHistory = this.pitchHistory.filter((f) => t - f.t <= o.pitchWindowSec).slice(-600);

    if (validPitch && Math.abs(evaluation.cents) <= o.pitchEnterCents && delta <= 0.15 && level < o.loudRms && this.current.code !== 'tooLoud') {
      this.tailHistory.push({ t, midi: frame.midi, ref: evaluation.ref, level });
      this.tailHistory = this.tailHistory.filter((f) => t - f.t <= o.tailWindowSec).slice(-1200);
    } else this.tailHistory = [];

    // 最短显示时间不能使旧的音高判断跨过低清晰度、休止或失去参考继续展示。
    if (PITCH_CODES.has(this.current.code) && !validPitch) {
      const safeCode = !validLevel || sounding && !reliable ? 'uncertain' : sounding && !hasReference ? 'noReference' : 'listening';
      this._show(safeCode, {}, t);
    }
    if (this.current.code === 'noVoice' && !hasReference) this._show('listening', {}, t);

    const candidate = this._candidate({ validLevel, level, sounding, reliable, hasReference, validPitch });
    if (candidate.code === this.current.code) {
      this.current.vars = candidate.vars;
      this.pending = null;
      return this._snapshot();
    }
    if (!this.pending || this.pending.code !== candidate.code) this.pending = { code: candidate.code, duration: 0, frames: 1, vars: candidate.vars };
    else {
      // 不把稀疏到来的两帧当作整段持续证据。
      this.pending.duration += Math.min(delta, 0.1);
      this.pending.frames++;
      this.pending.vars = candidate.vars;
    }
    const wait = candidate.code === 'noVoice' ? o.noVoiceEvidenceSec : candidate.code === 'tooLoud' ? o.loudEvidenceSec : candidate.code === 'tailDrop' ? o.tailEvidenceSec : PITCH_CODES.has(candidate.code) ? o.pitchEvidenceSec : o.stateEvidenceSec;
    if (this.pending.duration + 1e-9 >= wait && this.pending.frames >= o.minEvidenceFrames && t - this.current.sinceSec + 1e-9 >= o.minDisplaySec) this._show(candidate.code, candidate.vars, t);
    return this._snapshot();
  }

  _candidate(state) {
    const o = this.options, result = (code, vars = {}) => ({ code, vars });
    const loudThreshold = this.current.code === 'tooLoud' ? o.loudReleaseRms : o.loudRms;
    if (state.validLevel && state.level >= loudThreshold) return result('tooLoud', { rms: Number(state.level.toFixed(3)) });
    if (!state.validLevel || state.sounding && !state.reliable) return result('uncertain');
    if (!state.sounding) return result(state.hasReference ? 'noVoice' : 'listening');
    if (!state.hasReference) return result('noReference');
    if (!state.validPitch || this.pitchHistory.length < o.minEvidenceFrames) return result('listening');
    const cents = median(this.pitchHistory.map((f) => f.cents));
    const variables = { n: Math.round(Math.abs(cents)), cents: Math.round(cents) };
    const octaves = Math.round(cents / 1200);
    if (octaves !== 0 && Math.abs(cents - octaves * 1200) <= 100) return result(octaves > 0 ? 'octaveUp' : 'octaveDown', { ...variables, octaves: Math.abs(octaves) });
    if (cents <= -(this.current.code === 'flat' ? o.pitchReleaseCents : o.pitchEnterCents)) return result('flat', variables);
    if (cents >= (this.current.code === 'sharp' ? o.pitchReleaseCents : o.pitchEnterCents)) return result('sharp', variables);
    const tail = this._tailDrop();
    if (tail) return result('tailDrop', tail);
    if (Math.abs(cents) <= o.inTuneCents) return result('onPitch', variables);
    return result('listening');
  }

  _tailDrop() {
    const fs = this.tailHistory, o = this.options;
    if (fs.length < 12 || fs.at(-1).t - fs[0].t < o.minTailSec) return null;
    const pitchSpan = (key) => quantile(fs.map((f) => f[key]), 0.95) - quantile(fs.map((f) => f[key]), 0.05);
    // 同一参考平台和窄持续音才观察收弱。动态旋律、正常滑音与休止不构成尾音证据。
    if (pitchSpan('ref') > 0.6 || pitchSpan('midi') > 0.8) return null;
    const third = Math.max(3, Math.floor(fs.length / 3)), early = fs.slice(0, third), late = fs.slice(-third);
    const baseline = median(early.map((f) => f.level));
    if (baseline < o.voiceGate * 4) return null;
    const drop = db(baseline) - db(median(late.map((f) => f.level)));
    if (drop < o.tailDropDb) return null;
    // 只描述声音强度下降，不把主动渐弱、麦克风位置或 AGC 变化归为气息不足。
    return { dropDb: Number(drop.toFixed(1)), seconds: Number((fs.at(-1).t - fs[0].t).toFixed(1)) };
  }
}
