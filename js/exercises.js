// ============================================================
// 练习引擎：练习定义 + 运行状态机 + 评分（无 DOM 依赖）
// ============================================================
import { midiToFreq, midiToNote, centsBetween, freqToMidi, midiToSolfege, scoreCentsSeries } from './dsp.js';

/** 可选根音（C 大调到 B 大调），值为 MIDI 根音（取男女生通用的中音区） */
export const KEYS = [
  { label: 'C 大调', labelEn: 'C major', root: 60 },
  { label: 'D 大调', labelEn: 'D major', root: 62 },
  { label: 'E 大调', labelEn: 'E major', root: 64 },
  { label: 'F 大调', labelEn: 'F major', root: 65 },
  { label: 'G 大调', labelEn: 'G major', root: 67 },
  { label: 'A 大调', labelEn: 'A major', root: 69 },
  { label: 'B♭ 大调', labelEn: 'B♭ major', root: 70 },
];

const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]; // do re mi fa sol la si do'

/** 练习目录 */
export function buildExercises(root) {
  const list = [
    {
      id: 'single', icon: '🎯', name: '单音模唱', nameEn: 'Match a single note',
      desc: '听一个参考音，然后用 "wu" 或 "la" 唱出同样的音高。训练最基本的音准模仿能力。',
      descEn: 'Listen to a reference note, then sing the same pitch on "woo" or "la". This trains the most basic pitch-matching skill.',
      tips: ['先听完整再开口', '想象音高的"位置"', '偏差在 ±25 音分内即算优秀'],
      tipsEn: ['Listen to the whole note before you start', 'Imagine where the pitch sits', 'Within ±25 cents counts as excellent'],
      steps: [0, 4, 7, 12, 7, 4, 0].map(s => ({ midi: root + s, playFirst: true, singMs: 2000 })),
    },
    {
      id: 'scale-up', icon: '📈', name: '音阶上行 Do→Si', nameEn: 'Ascending scale do→ti',
      desc: '跟着钢琴声逐级唱 do re mi fa sol la si do，每级都要唱稳再进入下一级。',
      descEn: 'Sing up the scale step by step with the piano: do re mi fa sol la si do. Hold each step steady before moving on.',
      tips: ['每级唱满整个时值', '留意 fa 和 si 容易偏低', '保持气息均匀，不要越唱越用力'],
      tipsEn: ['Hold each step for its full value', 'Watch out: fa and ti tend to go flat', 'Keep the airflow even instead of pushing harder'],
      steps: SCALE_MAJOR.map(s => ({ midi: root + s, playFirst: true, singMs: 1400 })),
    },
    {
      id: 'scale-down', icon: '📉', name: '音阶下行 Si→Do', nameEn: 'Descending scale ti→do',
      desc: '从高八度的 do 开始往下唱。下行音阶更容易"掉音"，是检查气息支撑的好练习。',
      descEn: 'Start on the upper do and sing downwards. Descending lines sag more easily, which makes this a good test of breath support.',
      tips: ['下行时保持声音位置不要"垮"', '感觉声音始终在面罩前方'],
      tipsEn: ['Keep the voice placed as you descend; do not let it collapse', 'Feel the sound staying forward in the mask'],
      steps: [...SCALE_MAJOR].reverse().map(s => ({ midi: root + s, playFirst: true, singMs: 1400 })),
    },
    {
      id: 'sustain', icon: '🫁', name: '长音稳定', nameEn: 'Steady long note',
      desc: '深吸一口气，用平稳的气息把一个音保持 6 秒。观察音高曲线是否平直。',
      descEn: 'Take a deep breath and hold one note for six seconds on even airflow. Watch whether the pitch curve stays flat.',
      tips: ['用腹式呼吸吸气，肩膀不动', '音量保持中等，不要渐强渐弱', '曲线越平，气息控制越好'],
      tipsEn: ['Breathe from the belly and keep the shoulders still', 'Keep a medium volume; no crescendo or fade', 'The flatter the curve, the better your breath control'],
      steps: [{ midi: root + 4, playFirst: true, singMs: 6000 }],
      longNote: true,
    },
    {
      id: 'interval', icon: '🪜', name: '五度跳进', nameEn: 'Fifth leaps',
      desc: 'do → sol → do 的五度跳进练习。跳进比级进更难唱准，是音准进阶的关键。',
      descEn: 'Practise the do → sol → do fifth leap. Leaps are harder to pitch than steps and are the key to advancing.',
      tips: ['唱 sol 前先在心里"预听"它的高度', '上跳时不要喊，保持轻声'],
      tipsEn: ['Pre-hear the height of sol in your head before singing', 'Do not shout on the leap; stay light'],
      steps: [0, 7, 0, 7, 12, 7, 0].map(s => ({ midi: root + s, playFirst: true, singMs: 1600 })),
    },
  ];
  list.forEach(e => { e._root = root; });
  return list;
}

/** 音域测试是特殊模式（不跟随目标音），由 UI 单独处理 */

/**
 * 练习运行器（状态机）。
 * 事件回调: onEvent({type, ...})
 *   type: 'step-start' {index,total,midi,solfege,phase:'play'}
 *         'step-listen' {index,total,midi,solfege,phase:'sing',durationMs}
 *         'step-score' {index,total,midi,solfege,result}
 *         'done' {summary}
 */
export class ExerciseRunner {
  constructor(exercise, tonePlayer) {
    this.ex = exercise;
    this.player = tonePlayer;
    this.stepIdx = -1;
    this._collecting = false;
    this._cents = [];
    this._results = [];
    this._cancelled = false;
    this._currentTarget = null;
    this.onEvent = null;
    this._timer = null;
  }

  _emit(ev) { if (this.onEvent) this.onEvent(ev); }

  /** 接收实时音高帧（由 app 转发 engine.onFrame） */
  feedFrame(frame) {
    if (!this._collecting || !this._currentTarget || !frame.voiced) return;
    const cents = centsBetween(frame.frequency, midiToFreq(this._currentTarget));
    if (Number.isFinite(cents) && Math.abs(cents) < 600) this._cents.push(cents);
  }

  async start() {
    this._cancelled = false;
    this._results = [];
    for (let i = 0; i < this.ex.steps.length; i++) {
      if (this._cancelled) return;
      const step = this.ex.steps[i];
      this._currentTarget = step.midi;
      const note = midiToNote(step.midi);
      const solfege = midiToSolfege(step.midi, this.ex._root ?? step.midi - (step.midi % 12)) || null;
      const total = this.ex.steps.length;

      if (step.playFirst) {
        this._emit({ type: 'step-start', index: i, total, midi: step.midi, note, phase: 'play' });
        await this.player.play(midiToFreq(step.midi), Math.min(1.2, step.singMs / 2000 + 0.6));
      }
      if (this._cancelled) return;

      this._cents = [];
      this._collecting = true;
      this._emit({ type: 'step-listen', index: i, total, midi: step.midi, note, phase: 'sing', durationMs: step.singMs });
      await new Promise(res => { this._timer = setTimeout(res, step.singMs); });
      this._collecting = false;
      if (this._cancelled) return;

      const result = scoreCentsSeries(this._cents) || { medianCents: null, inTuneRatio: 0, stability: null, score: 0 };
      result.frames = this._cents.length;
      this._results.push(result);
      this._emit({ type: 'step-score', index: i, total, midi: step.midi, note, result });
      await new Promise(res => { this._timer = setTimeout(res, 700); });
    }
    const scored = this._results.filter(r => r.frames >= 5);
    const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : 0;
    const summary = { avgScore: avg, steps: this._results.length, sung: scored.length, results: this._results };
    this._emit({ type: 'done', summary });
  }

  cancel() {
    this._cancelled = true;
    this._collecting = false;
    if (this._timer) clearTimeout(this._timer);
    this.player.stop();
  }
}

// ---------- 历史记录（localStorage） ----------
const HISTORY_KEY = 'musicmaster.history.v1';

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch (e) { return []; }
}

export function saveSession(record) {
  const h = loadHistory();
  h.push({ ...record, at: new Date().toISOString() });
  // 只保留最近 200 条
  while (h.length > 200) h.shift();
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch (e) { /* 存储满则忽略 */ }
  return h;
}
