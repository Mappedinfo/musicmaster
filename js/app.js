// ============================================================
// MusicMaster 主逻辑：选项卡、音准仪、练习、频谱、课程
// ============================================================
import { freqToMidi, midiToFreq, midiToNote, midiToSolfege, medianFilter } from './dsp.js';
import { AudioEngine, TonePlayer } from './engine.js';
import { KEYS, buildExercises, ExerciseRunner, loadHistory, saveSession } from './exercises.js';
import { LESSONS, WEEK_PLAN } from './lessons.js';
import {
  TARGET_SR, parseLRC, activeLyricIndex, KaraokeScorer,
  decodeMono, extractReference, KaraokePlayer,
} from './karaoke.js';
import { t, L, initI18n, setLang, getLang, onLangChange, applyI18n, DICT } from './i18n.js';
import { buildReferenceFromPair } from './karaoke.js';

const $ = (sel) => document.querySelector(sel);

// 实时状态保存翻译键，切换语言时保留当前文件、采集与练习状态。
function liveText(selector, key, vars) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  el.dataset.liveKey = key;
  el._translationVars = vars;
  el.textContent = t(key, vars);
}

const engine = new AudioEngine();
const player = new TonePlayer();

// ---------- 全局状态 ----------
const state = {
  micOn: false,
  trail: [],            // 音准仪曲线: {t: ms, midi: number|null}
  trailStart: 0,
  lastFrame: null,
  currentKey: 0,        // KEYS 下标
  exercises: [],
  selectedEx: null,
  runner: null,
  exTrail: [],          // 练习曲线
  exTarget: null,
  range: { active: false, midis: [] },
  spectrum: null,
  smoothMidi: [],       // 中值滤波滑窗
  // K歌跟唱
  octaveBase: 0,        // 0: C4=中央C（GarageBand/Logic）；1: C3=中央C（Cubase/MuseScore）
  karaoke: {
    active: false,      // 面板是否已初始化
    player: null,
    ref: null,          // { times, midis, hopSec }
    scorer: null,
    lyrics: [],
    songName: '',
    live: null,
    fileReady: false,
    accFile: null,        // 可选的伴奏文件（精准模式）
    pairUsed: false,
  },
};

// ---------- 语言 ----------
function initLang() {
  initI18n();
  const sel = $('#langSelect');
  if (sel) {
    sel.value = getLang();
    sel.addEventListener('change', () => setLang(sel.value));
  }
  document.title = t('app.title');
  const meta = $('#metaDescription');
  if (meta) meta.setAttribute('content', t('app.description'));
  // 语言变化后，动态渲染的内容需要重建
  onLangChange(() => {
    document.querySelectorAll('[data-live-key]').forEach(el => {
      el.textContent = t(el.dataset.liveKey, el._translationVars);
    });
    document.title = t('app.title');
    if (meta) meta.setAttribute('content', t('app.description'));
    $('#micBtnText').textContent = t(state.micOn ? 'mic.stop' : 'mic.enable');
    $('#micHint').textContent = t(state.micOn ? 'mic.listening' : 'mic.privacy');
    if (state.karaoke.report) renderKaraokeReport(state.karaoke.report);
    renderKeyOptions();
    renderLearn();
    buildExerciseCards();
    renderHistory();
    setKaraokePlayLabel(state.karaoke.player ? state.karaoke.player.playing : false);
    if (!state.range.active && state.range.midis.length >= 10) showRangeResult();
    updateKaraokeStatus();
  });
}

/**
 * 供 Canvas 内联文案使用。
 * 注意：不能在这些函数里直接调 t()——drawKaraoke 等函数有局部变量 const t = k.time，
 * 会遮蔽 i18n 的 t，报 "t is not a function"。所以走一个不同名的查表函数。
 */
function canvasText(key) {
  const e = DICT[key];
  if (!e) return key;
  const lang = getLang();
  return e[lang] != null ? e[lang] : e.zh;
}

// ---------- 音名显示（八度基准可校准） ----------
/**
 * 内部一律用 MIDI 编号（60 = 中央 C）计算，只在"显示"时套用用户选择的八度基准。
 * 这样检测、评分、音域统计的数据不会被显示设置污染，换基准只是换个说法。
 */
function noteText(midiFloat) {
  const n = midiToNote(midiFloat);
  // 内部 midiToNote 用科学音高记号（60 = C4 = 中央C）。
  // 选 C3=中央C 的软件时，同一物理音要显示成 C3，即编号减 1。
  return n.name + (n.octave - state.octaveBase);
}

const OCTAVE_BASE_STORAGE = 'musicmaster.octavebase.v1';

/** 粗略判断是否移动端：手机外放唱歌更常见，默认开回声消除更实用。 */
function isMobileLike() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches);
}

function initOctaveBase() {
  let saved = 0;
  try {
    const v = Number(localStorage.getItem(OCTAVE_BASE_STORAGE));
    if (v === 0 || v === 1) saved = v;
  } catch (err) { /* 隐私模式下 localStorage 可能不可用 */ }
  state.octaveBase = saved;
  const sel = $('#octaveBase');
  if (!sel) return;
  sel.value = String(saved);
  sel.addEventListener('change', () => {
    state.octaveBase = Number(sel.value) || 0;
    try { localStorage.setItem(OCTAVE_BASE_STORAGE, String(state.octaveBase)); } catch (err) { /* ignore */ }
    toast(state.octaveBase === 1
      ? t('octave.toastC3')
      : t('octave.toastC4'));
  });
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, ms = 3400) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- 麦克风开关 ----------
const micBtn = $('#micBtn');
micBtn.addEventListener('click', async () => {
  if (state.micOn) { stopMic(); return; }
  micBtn.disabled = true;
  $('#micBtnText').textContent = t('mic.requesting');
  try {
    const testTone = new URLSearchParams(location.search).get('testtone');
    const wantsEcho = !!($('#karaokeEcho') && $('#karaokeEcho').checked);
    if (testTone) await engine.startTest(parseFloat(testTone) || 220);
    else await engine.start({ echoCancellation: wantsEcho });
    engine.onFrame = onFrame;
    engine.onSpectrum = onSpectrum;
    state.micOn = true;
    state.trailStart = performance.now();
    micBtn.classList.add('listening');
    $('.session-status').classList.add('listening');
    $('#micBtnText').textContent = t('mic.stop');
    $('#micHint').textContent = t('mic.listening');
    toast(t('toast.micOn'));
  } catch (err) {
    engine.stop();
    console.error(err);
    let msg = t('micErr.generic');
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      msg = t('micErr.https');
    } else if (err && err.name === 'NotAllowedError') {
      msg = t('micErr.denied');
    } else if (err && err.name === 'NotFoundError') {
      msg = t('micErr.noDevice');
    }
    toast(msg, 5200);
    $('#micBtnText').textContent = t('mic.enable');
  }
  micBtn.disabled = false;
});

function stopMic() {
  if (state.runner) stopExercise();
  // K歌跟唱用的是独立的采集通道，关麦克风时一并停掉，避免继续占用
  if (state.karaoke.player && state.karaoke.player.playing) {
    state.karaoke.player.pause();
    setKaraokePlayLabel(false);
  }
  if (state.karaoke.player) state.karaoke.player.stopMicrophone();
  state.karaoke.live = null;
  state.karaoke.lastEval = null;
  engine.stop();
  state.micOn = false;
  micBtn.classList.remove('listening');
  $('.session-status').classList.remove('listening');
  $('#micBtnText').textContent = t('mic.enable');
  $('#micHint').textContent = t('mic.privacy');
  $('#tunerNote').textContent = '--';
  $('#tunerFreq').textContent = '0.0 Hz';
  $('#tunerSolfege').textContent = '';
  $('#tunerCents').textContent = '0';
  $('#clarityFill').style.width = '0%';
  $('#pitchEmpty').hidden = false;
  $('#spectrumEmpty').hidden = false;
  $('#karaokeLevel').value = 0;
  $('#karaokeMine').textContent = '--';
  if (state.range.active) {
    state.range.active = false;
    liveText('#rangeStartBtn', 'range.start');
    showRangeResult();
  }
  drawGauge(0, false);
}

// ---------- 实时帧处理 ----------
function onFrame(f) {
  state.lastFrame = f;
  // 音高轨迹（音准仪 + 练习共用）
  let midi = null;
  if (f.voiced && f.frequency > 0) {
    midi = freqToMidi(f.frequency);
    state.smoothMidi.push(midi);
    if (state.smoothMidi.length > 5) state.smoothMidi.shift();
    const sm = medianFilter(state.smoothMidi, state.smoothMidi.length);
    midi = sm[sm.length - 1];
  } else {
    state.smoothMidi.length = 0;
  }
  state.trail.push({ t: performance.now(), midi });
  if (state.trail.length > 1200) state.trail.shift();

  if (state.runner) state.runner.feedFrame(f);
  if (state.exTarget != null) {
    state.exTrail.push({ t: performance.now(), midi });
    if (state.exTrail.length > 600) state.exTrail.shift();
  }
  if (state.range.active && f.voiced && f.clarity > 0.7 && midi != null) {
    state.range.midis.push(midi);
  }

  updateTuner(f, midi);
}

function updateTuner(f, midi) {
  $('#pitchEmpty').hidden = state.micOn;
  const noteEl = $('#tunerNote');
  if (midi != null && f.clarity > 0.5) {
    // 音名显示走 noteText（可校准八度），cents 仍需原始 MIDI 参与计算
    const n = midiToNote(midi);
    noteEl.textContent = noteText(midi);
    noteEl.classList.remove('flat');
    $('#tunerFreq').textContent = f.frequency.toFixed(1) + ' Hz';
    const solfege = midiToSolfege(n.midi, KEYS[state.currentKey].root);
    $('#tunerSolfege').textContent = solfege ? t('tuner.solfege') + solfege : '';
    const cents = Math.max(-50, Math.min(50, n.cents));
    $('#tunerCents').textContent = (n.cents > 0 ? '+' : '') + n.cents;
    $('#tunerCents').style.color = Math.abs(n.cents) <= 15 ? 'var(--teal)' : (Math.abs(n.cents) <= 35 ? 'var(--amber)' : 'var(--red)');
    drawGauge(cents, f.voiced);
  } else {
    // 没听到声音：显示占位符并转成纯色，避免渐变文字在空内容时变成色块
    noteEl.classList.add('flat');
    noteEl.textContent = '--';
    $('#tunerFreq').textContent = '0.0 Hz';
    $('#tunerSolfege').textContent = '';
    $('#tunerCents').textContent = '0';
    drawGauge(0, false);
  }
  $('#clarityFill').style.width = Math.round((f.clarity || 0) * 100) + '%';
}

// ---------- 音分表盘 ----------
function drawGauge(cents, active) {
  const cv = $('#centsGauge');
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H - 14, R = Math.min(W / 2 - 20, H - 30);
  const a0 = Math.PI, a1 = 2 * Math.PI; // 半圆
  const toAngle = (c) => a0 + ((c + 50) / 100) * (a1 - a0);

  // 色带
  const zones = [[-50, -35, 'rgba(242,103,94,.35)'], [-35, -15, 'rgba(242,163,60,.3)'], [-15, 15, 'rgba(56,217,192,.45)'], [15, 35, 'rgba(242,163,60,.3)'], [35, 50, 'rgba(242,103,94,.35)']];
  for (const [c0, c1, color] of zones) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, toAngle(c0), toAngle(c1));
    ctx.arc(cx, cy, R - 22, toAngle(c1), toAngle(c0), true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  // 刻度
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let c = -50; c <= 50; c += 10) {
    const ang = toAngle(c);
    const inner = (c % 25 === 0) ? R - 30 : R - 24;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
    ctx.lineTo(cx + Math.cos(ang) * (R - 18), cy + Math.sin(ang) * (R - 18));
    ctx.strokeStyle = '#42534c';
    ctx.stroke();
    if (c % 25 === 0) {
      ctx.fillStyle = '#859590';
      ctx.fillText(String(c), cx + Math.cos(ang) * (R - 44), cy + Math.sin(ang) * (R - 44) + 4);
    }
  }
  // 指针
  if (active) {
    const ang = toAngle(cents);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (R - 30), cy + Math.sin(ang) * (R - 30));
    ctx.strokeStyle = Math.abs(cents) <= 15 ? '#5be0b3' : '#e5bc76';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.fillStyle = active ? '#e9ecf3' : '#42534c';
  ctx.fill();
}

// ---------- 音高曲线（音准仪） ----------
function drawPitchCurve() {
  const cv = $('#pitchCurve');
  if (!cv.offsetParent && !$('#tab-tuner').classList.contains('active')) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const now = performance.now();
  const windowMs = 9000;

  // 决定纵轴范围
  const recent = state.trail.filter(p => now - p.t < windowMs && p.midi != null).map(p => p.midi);
  let lo = 48, hi = 72;
  if (recent.length) {
    const mn = Math.min(...recent), mx = Math.max(...recent);
    lo = Math.floor(mn - 3); hi = Math.ceil(mx + 3);
    if (hi - lo < 12) { const mid = (lo + hi) / 2; lo = Math.floor(mid - 6); hi = lo + 12; }
  }
  const yOf = (m) => H - ((m - lo) / (hi - lo)) * H;

  // 音名横线
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'left';
  for (let m = lo; m <= hi; m++) {
    const y = yOf(m);
    const isC = ((m % 12) + 12) % 12 === 0;
    ctx.strokeStyle = isC ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = '#859590';
    ctx.fillText(noteText(m), 4, y - 2);
  }
  // 轨迹
  let prev = null;
  for (const p of state.trail) {
    const dt = now - p.t;
    if (dt > windowMs) continue;
    const x = W - (dt / windowMs) * W;
    if (p.midi == null) { prev = null; continue; }
    const y = yOf(p.midi);
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = '#5be0b3';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    prev = { x, y };
  }
}

// ---------- 练习模式 ----------
function renderKeyOptions() {
  const sel = $('#keySelect');
  if (!sel) return;
  const keep = state.currentKey || 0;
  sel.innerHTML = '';
  KEYS.forEach((k, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = getLang() === 'en' ? (k.labelEn || k.label) : k.label;
    sel.appendChild(opt);
  });
  sel.value = String(keep);
  if (!sel._bound) {
    sel._bound = true;
    sel.addEventListener('change', () => { state.currentKey = +sel.value; buildExerciseCards(); });
  }
}

function initPractice() {
  renderKeyOptions();
  buildExerciseCards();
  renderHistory();
}

function buildExerciseCards() {
  state.exercises = buildExercises(KEYS[state.currentKey].root);
  const grid = $('#exerciseGrid');
  grid.innerHTML = '';
  const history = loadHistory();
  state.exercises.forEach(ex => {
    const best = history.filter(h => h.exercise === ex.id).reduce((m, h) => Math.max(m, h.avgScore || 0), 0);
    const card = document.createElement('button');
    card.className = 'exercise-card';
    const exName = L(ex.name, ex.nameEn || ex.name);
    const exDesc = L(ex.desc, ex.descEn || ex.desc);
    card.innerHTML = '<div class="ex-icon">' + ex.icon + '</div><h4>' + exName + '</h4><p>' + exDesc + '</p>' +
      (best > 0 ? '<div class="ex-best">' + t('ex.best', { n: best }) + '</div>' : '');
    card.addEventListener('click', () => selectExercise(ex, card));
    grid.appendChild(card);
  });
}

function selectExercise(ex, cardEl) {
  document.querySelectorAll('.exercise-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  state.selectedEx = ex;
  const rc = $('#runnerCard');
  rc.hidden = false;
  $('#runnerTitle').textContent = ex.icon + ' ' + L(ex.name, ex.nameEn || ex.name);
  $('#runnerDesc').textContent = L(ex.desc, ex.descEn || ex.desc);
  $('#runnerFeedback').innerHTML = '<button class="btn btn-primary" id="startExerciseBtn">' + t('practice.start') + '</button>';
  $('#runnerSummary').hidden = true;
  $('#stepDots').innerHTML = '';
  $('#runnerTarget').textContent = '--';
  liveText('#runnerPhase', 'practice.ready');
  $('#runnerPhase').className = 'target-label';
  $('#runnerLiveCents').textContent = '';
  rc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#startExerciseBtn').addEventListener('click', () => startExercise(ex));
}

async function startExercise(ex) {
  if (!state.micOn) {
    toast(t('toast.needMic'));
    return;
  }
  if (state.runner) return;
  const runner = new ExerciseRunner(ex, player);
  state.runner = runner;
  state.exTrail = [];
  state.exTarget = null;

  const dots = $('#stepDots');
  dots.innerHTML = '';
  ex.steps.forEach(() => {
    const d = document.createElement('div');
    d.className = 'step-dot';
    dots.appendChild(d);
  });
  const fb = $('#runnerFeedback');
  fb.innerHTML = '';
  $('#runnerSummary').hidden = true;

  runner.onEvent = (ev) => {
    if (ev.type === 'step-start') {
      state.exTarget = ev.midi;
      state.exTrail = [];
      dots.children[ev.index].className = 'step-dot playing';
      liveText('#runnerPhase', 'practice.listen');
      $('#runnerPhase').className = 'target-label';
      $('#runnerTarget').textContent = noteText(ev.midi);
      $('#runnerLiveCents').textContent = '';
    } else if (ev.type === 'step-listen') {
      state.exTarget = ev.midi;
      state.exTrail = [];
      dots.children[ev.index].className = 'step-dot singing';
      liveText('#runnerPhase', 'practice.sing');
      $('#runnerPhase').className = 'target-label sing';
    } else if (ev.type === 'step-score') {
      const r = ev.result;
      const good = r.score >= 70;
      dots.children[ev.index].className = 'step-dot done' + (good ? '' : ' bad');
      if (r.frames >= 5) {
        const chip = document.createElement('span');
        chip.className = 'fb-chip ' + (good ? 'good' : 'bad');
        const c = r.medianCents;
        chip.innerHTML = '<b>' + noteText(ev.midi) + '</b> ' + (c > 0 ? '+' : '') + c + '¢ · ' + t('ex.stable', { v: r.stability }) + ' · ' + r.score + t('ex.points');
        fb.appendChild(chip);
      } else {
        const chip = document.createElement('span');
        chip.className = 'fb-chip bad';
        chip.textContent = t('ex.notHeard', { note: noteText(ev.midi) });
        fb.appendChild(chip);
      }
      state.exTarget = null;
      liveText('#runnerPhase', 'practice.ready');
      $('#runnerPhase').className = 'target-label';
    } else if (ev.type === 'done') {
      state.runner = null;
      state.exTarget = null;
      const s = ev.summary;
      const sum = $('#runnerSummary');
      sum.hidden = false;
      sum.innerHTML = '<div class="big-score">' + s.avgScore + t('ex.points') + '</div>' +
        '<p>' + t('ex.summary', { sung: s.sung, steps: s.steps }) + summaryComment(s.avgScore) + '</p>' +
        '<p style="margin-top:10px"><button class="btn btn-secondary" id="againBtn">' + t('practice.again') + '</button></p>';
      $('#againBtn').addEventListener('click', () => startExercise(ex));
      saveSession({ exercise: ex.id, name: ex.name, avgScore: s.avgScore, steps: s.steps, sung: s.sung });
      renderHistory();
      buildExerciseCards();
      liveText('#runnerPhase', 'practice.done');
      $('#runnerTarget').textContent = '🎉';
      $('#runnerLiveCents').textContent = '';
    }
  };
  runner.start();
}

function summaryComment(score) {
  if (score >= 85) return t('summary.85');
  if (score >= 70) return t('summary.70');
  if (score >= 50) return t('summary.50');
  return t('summary.low');
}

$('#stopExerciseBtn').addEventListener('click', () => stopExercise());
function stopExercise() {
  if (state.runner) { state.runner.cancel(); state.runner = null; }
  state.exTarget = null;
  liveText('#runnerPhase', 'practice.stopped');
  $('#runnerPhase').className = 'target-label';
  $('#runnerLiveCents').textContent = '';
  const fb = $('#runnerFeedback');
  if (state.selectedEx) {
    fb.innerHTML = '<button class="btn btn-primary" id="startExerciseBtn">' + t('practice.start') + '</button>';
    $('#startExerciseBtn').addEventListener('click', () => startExercise(state.selectedEx));
  }
}

// 练习曲线：目标线 + 实唱轨迹
function drawExerciseCurve() {
  const cv = $('#exerciseCurve');
  if (!$('#tab-practice').classList.contains('active')) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (state.exTarget == null) {
    ctx.fillStyle = '#859590';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('目标音出现时，这里会显示你的音高与目标的对比', W / 2, H / 2);
    return;
  }
  const target = state.exTarget;
  const lo = target - 4, hi = target + 4;
  const yOf = (m) => H - ((m - lo) / (hi - lo)) * H;
  // 半音格
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const y = yOf(m);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // 目标线
  const ty = yOf(target);
  ctx.strokeStyle = 'rgba(56,217,192,.8)';
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#5be0b3';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('目标 ' + noteText(target), 6, ty - 6);

  // 实唱轨迹
  const now = performance.now();
  const windowMs = 6000;
  let prev = null;
  for (const p of state.exTrail) {
    const dt = now - p.t;
    if (dt > windowMs) continue;
    const x = W - (dt / windowMs) * W;
    if (p.midi == null) { prev = null; continue; }
    const y = Math.max(2, Math.min(H - 2, yOf(p.midi)));
    if (prev) {
      const devCents = Math.abs((p.midi - target) * 100);
      ctx.strokeStyle = devCents <= 25 ? '#5be0b3' : (devCents <= 60 ? '#e5bc76' : '#f18b82');
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(x, y); ctx.stroke();
      ctx.lineWidth = 1;
    }
    prev = { x, y };
  }
  // 实时偏差数字
  const last = state.lastFrame;
  if (last && last.voiced) {
    const dev = Math.round((freqToMidi(last.frequency) - target) * 100);
    $('#runnerLiveCents').textContent = (dev > 0 ? '+' : '') + dev + ' cents';
    $('#runnerLiveCents').style.color = Math.abs(dev) <= 25 ? 'var(--teal)' : 'var(--amber)';
  } else {
    $('#runnerLiveCents').textContent = '';
  }
}

// ---------- 音域测试 ----------
$('#rangeStartBtn').addEventListener('click', () => {
  if (!state.micOn) { toast(t('toast.needMic')); return; }
  state.range.active = !state.range.active;
  if (state.range.active) liveText('#rangeStartBtn', 'range.stop');
  else liveText('#rangeStartBtn', 'range.start');
  if (state.range.active) {
    state.range.midis = [];
    liveText('#rangeResult', 'range.recording');
  } else {
    showRangeResult();
  }
});
$('#rangeResetBtn').addEventListener('click', () => {
  state.range.midis = [];
  liveText('#rangeResult', 'range.empty');
});
function showRangeResult() {
  const ms = state.range.midis;
  if (ms.length < 10) { liveText('#rangeResult', 'range.tooFew'); return; }
  ms.sort((a, b) => a - b);
  const lo = ms[Math.floor(ms.length * 0.02)];
  const hi = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.98))];
  $('#rangeResult').innerHTML = t('range.result', { lo: noteText(lo), hi: noteText(hi), n: Math.round((hi - lo) * 10) / 10 });
}

// ---------- 频谱 ----------
function onSpectrum(s) { state.spectrum = s; }

function drawSpectrum() {
  const cv = $('#spectrumCanvas');
  if (!$('#tab-spectrum').classList.contains('active')) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const s = state.spectrum;
  $('#spectrumEmpty').hidden = !!s && state.micOn;
  if (!s) return;

  const fMin = 50, fMax = 8000;
  const xOf = (f) => (Math.log2(f / fMin) / Math.log2(fMax / fMin)) * W;
  const binHz = s.sampleRate / s.fftSize;
  const dbFloor = -90, dbCeil = -25;

  // 频率刻度
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  [100, 200, 500, 1000, 2000, 4000, 8000].forEach(f => {
    const x = xOf(f);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = '#859590';
    ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x, H - 4);
  });

  // 频谱曲线（渐变填充）
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(56,217,192,.55)');
  grad.addColorStop(1, 'rgba(56,217,192,.03)');
  ctx.beginPath();
  ctx.moveTo(0, H);
  const maxBin = Math.min(s.db.length - 1, Math.ceil(fMax / binHz));
  const minBin = Math.max(1, Math.floor(fMin / binHz));
  for (let i = minBin; i <= maxBin; i++) {
    const x = xOf(i * binHz);
    const y = H - ((s.db[i] - dbFloor) / (dbCeil - dbFloor)) * H;
    ctx.lineTo(x, Math.max(0, Math.min(H, y)));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 基频标记
  const f = state.lastFrame;
  if (f && f.voiced && f.frequency > 0) {
    const x = xOf(f.frequency);
    ctx.strokeStyle = '#e5bc76';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e5bc76';
    ctx.textAlign = 'left';
    ctx.fillText(canvasText('spectrum.fundamental') + ' ' + f.frequency.toFixed(0) + ' Hz', Math.min(x + 6, W - 110), 14);
  }

  // 指标
  $('#mCentroid').textContent = s.centroid ? Math.round(s.centroid) + ' Hz' : '--';
  $('#mH1H2').textContent = (s.h1h2 != null && Number.isFinite(s.h1h2)) ? s.h1h2.toFixed(1) + ' dB' : '--';
  $('#mLH').textContent = Number.isFinite(s.lhRatio) ? s.lhRatio.toFixed(1) + ' dB' : '--';
  $('#mHNR').textContent = s.hRatio ? Math.round(s.hRatio * 100) + '%' : '--';
  $('#mSF').textContent = s.sfRatio ? (s.sfRatio * 100).toFixed(1) + '%' : '--';
}

// ---------- 课程内容 ----------
/** 选择语言对应的字段；缺英文时退回中文，保证不会出现空内容 */
function pick(zh, en, useEn) {
  return useEn && en ? en : zh;
}

function renderLearn() {
  const root = $('#learnContent');
  let html = '';
  for (const lesson of LESSONS) {
    const en = getLang() === 'en';
    html += '<div class="lesson"><h2>' + pick(lesson.title, lesson.titleEn, en) + '</h2>';
    if (lesson.sub) html += '<div class="lesson-sub">' + pick(lesson.sub, lesson.subEn, en) + '</div>';
    for (const block of lesson.blocks) {
      html += '<div class="card">';
      if (block.h4) html += '<h4>' + pick(block.h4, block.h4En, en) + '</h4>';
      html += pick(block.html, block.htmlEn, en);
      html += '</div>';
    }
    html += '</div>';
  }
  const enWeek = getLang() === 'en';
  html += '<div class="lesson"><h2>' + t('learn.weekTitle') + '</h2><div class="lesson-sub">' + t('learn.weekSub') + '</div><div class="card"><div class="week-plan">';
  for (const w of WEEK_PLAN) {
    html += '<div class="week"><b>' + pick(w.week, w.weekEn, enWeek) + '</b><p>' + pick(w.text, w.textEn, enWeek) + '</p></div>';
  }
  html += '</div></div></div>';
  root.innerHTML = html;
}

// ---------- 历史记录 ----------
function renderHistory() {
  const list = $('#historyList');
  const h = loadHistory();
  if (!h.length) {
    list.innerHTML = '<p class="muted">' + t('history.empty') + '</p>';
    return;
  }
  list.innerHTML = '';
  [...h].reverse().slice(0, 30).forEach(rec => {
    const d = new Date(rec.at);
    const item = document.createElement('div');
    item.className = 'history-item';
    const recLabel = rec.exercise === 'karaoke' ? (rec.name || '') : t('history.item', { sung: rec.sung, steps: rec.steps });
    item.innerHTML = '<span>' + recLabel + '</span>' +
      '<span><span class="h-score">' + rec.avgScore + t('ex.points') + '</span> <span class="h-time">' +
      (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</span></span>';
    list.appendChild(item);
  });
}

// ---------- 渲染循环 ----------
function tick() {
  if (state.micOn) {
    drawPitchCurve();
    drawExerciseCurve();
    drawSpectrum();
  }
  if (state.karaoke.active) drawKaraoke();
  requestAnimationFrame(tick);
}

// ============================================================
// K歌跟唱：本地选歌 -> 提取旋律 -> 实时对比 -> 报告与指导
// ============================================================
const KARAOKE = state.karaoke;
const K_WINDOW = 10.5;   // 瀑布图向前显示多少秒
const K_PAST = 5;        // 播放头左侧保留多少秒

async function prepareKaraokeMic() {
  if (!state.micOn) { toast(t('k.toastNeedMic')); return false; }
  try {
    await KARAOKE.player.startMic($('#karaokeEcho').checked);
    return true;
  } catch (err) {
    KARAOKE.player.stopMicrophone();
    toast(t(err.name === 'NotAllowedError' ? 'micErr.denied' : 'micErr.generic'), 5200);
    return false;
  }
}

function initKaraoke() {
  KARAOKE.active = true;
  const k = KARAOKE;

  // 手机上默认勾选"外放模式"，减少伴奏被麦克风再收进去
  const echoBox = $('#karaokeEcho');
  if (echoBox && isMobileLike()) echoBox.checked = true;
  echoBox.addEventListener('change', async () => {
    const enabled = echoBox.checked;
    const tracks = [engine.stream, k.player?.micStream].filter(Boolean).flatMap(stream => stream.getAudioTracks());
    echoBox.disabled = true;
    try {
      await Promise.all(tracks.map(track => track.applyConstraints({ echoCancellation: enabled, noiseSuppression: enabled, autoGainControl: false })));
    } catch (err) {
      echoBox.checked = !enabled;
      await Promise.allSettled(tracks.map(track => track.applyConstraints({ echoCancellation: !enabled, noiseSuppression: !enabled, autoGainControl: false })));
      toast(t('k.echoFailed'));
    } finally {
      echoBox.disabled = false;
    }
  });

  const player = new KaraokePlayer({
    onTime: (t, dur) => { k.time = t; k.duration = dur; },
    onEnded: () => { setKaraokePlayLabel(false); finishKaraoke(); },
    onBlocked: (msg) => toast(msg, 5200),
    onFrame: (ev) => {
      k.live = ev;
      if (k.scorer) {
        const res = k.scorer.feed(ev.t, ev.midi);
        if (res) k.lastEval = res;
      }
      updateKaraokeStatus();
    },
  });
  k.player = player;

  setKaraokePlayLabel(false);

  const songInput = $('#songFile');
  const lrcInput = $('#lrcFile');
  const volInput = $('#karaokeVol');
  if (volInput) volInput.addEventListener('input', () => player.setVolume(Number(volInput.value) / 100));

  songInput.addEventListener('change', async () => {
    const file = songInput.files && songInput.files[0];
    if (file) await loadKaraokeFile(file);
    songInput.value = '';
  });

  lrcInput.addEventListener('change', async () => {
    const file = lrcInput.files && lrcInput.files[0];
    if (file) {
      const text = await file.text();
      k.lyrics = parseLRC(text);
      liveText('#karaokeFileInfo', 'k.lrcLoaded', { n: k.lyrics.length, name: k.songName });
      toast(t('k.toastLrc', { n: k.lyrics.length }));
    }
    lrcInput.value = '';
  });

  const accInput = $('#accFile');
  if (accInput) {
    accInput.addEventListener('change', async () => {
      const f = accInput.files && accInput.files[0];
      if (f) {
        k.accFile = f;
        const el = $('#karaokePairInfo');
        if (el) { liveText(el, 'k.pairSel', { name: f.name }); el.className = 'muted k-pair-status warn'; }
        // 已经有主文件时，立刻重新按精准模式分析
        if (k.songFile) await loadKaraokeFile(k.songFile);
      }
      accInput.value = '';
    });
  }

  $('#karaokePlayBtn').addEventListener('click', async () => {
    if (!k.fileReady) { toast(t('k.toastNeedSong')); return; }
    if (!state.micOn) { toast(t('k.toastNeedMic')); return; }
    if (player.playing) {
      player.pause();
      setKaraokePlayLabel(false);
      return;
    }
    if (!await prepareKaraokeMic()) return;
    $('#karaokeReport').hidden = true;
    k.scorer = new KaraokeScorer({ ref: k.ref, lyrics: k.lyrics });
    player.restart();
    const okPlay = await player.play();
    if (okPlay) {
      setKaraokePlayLabel(true);
      $('#karaokeHint').classList.add('live');
      liveText('#karaokeHint', 'k.hintLive');
    }
  });

  $('#karaokeRestartBtn').addEventListener('click', async () => {
    if (!k.fileReady) { toast(t('k.toastNeedSong')); return; }
    if (!state.micOn) { toast(t('k.toastNeedMic')); return; }
    if (!await prepareKaraokeMic()) return;
    k.scorer = new KaraokeScorer({ ref: k.ref, lyrics: k.lyrics });
    k.lastEval = null;
    $('#karaokeReport').hidden = true;
    player.restart();
    const okPlay = await player.play();
    if (okPlay) setKaraokePlayLabel(true);
  });
}

function setKaraokePlayLabel(playing) {
  const btn = $('#karaokePlayBtn');
  if (btn) btn.textContent = playing ? t('k.pause') : t('k.play');
}

async function loadKaraokeFile(file) {
  const k = KARAOKE;
  k.songFile = file;
  const prog = $('#karaokeProgressFill');
  const info = $('#karaokeFileInfo');
  const loading = $('#karaokeLoading');
  const show = (p, text) => {
    loading.hidden = false;
    prog.style.width = Math.round(p * 100) + '%';
    $('#karaokeProgressText').textContent = text;
  };
  try {
    loading.hidden = false;
    let res;
    k.pairUsed = false;
    if (k.accFile) {
      // 精准模式：原唱 + 伴奏 -> 对齐 + 相减 -> 干净人声 -> 旋律
      show(0.02, t('k.pairWorking', { name: k.accFile.name }));
      await new Promise((r) => setTimeout(r, 40));
      const pair = await buildReferenceFromPair(file, k.accFile, { sampleRate: TARGET_SR });
      res = pair.melody;
      k.pairUsed = true;
      k.vocalBlob = pair.vocalBlob;
      const ms = Math.round(pair.delaySec * 1000);
      const snr = pair.quality.snrProxyDb.toFixed(1);
      const cov = Math.round((pair.melody.coverage || 0) * 100);
      const pairEl = $('#karaokePairInfo');
      if (pairEl) {
        liveText(pairEl, 'k.pairOk', { ms: ms, g: pair.gain.toFixed(2), snr: snr, cov: cov });
        pairEl.className = 'muted k-pair-status ok';
      }
      if (pair.quality.snrProxyDb < 3) {
        toast(t('k.pairPoor'), 7000);
      }
      show(0.85, t('k.decoded', { sec: (res.frames ? res.frames.length * (res.hopSec || 0.005) : 0).toFixed(0) }));
    } else {
      show(0.02, t('k.decode', { name: file.name }));
      await new Promise((r) => setTimeout(r, 40));
      const pcm = await decodeMono(file, TARGET_SR);
      show(0.2, t('k.decoded', { sec: (pcm.length / TARGET_SR).toFixed(0) }));
      await new Promise((r) => setTimeout(r, 40));
      res = await extractReference(pcm, TARGET_SR, (p) => {
        show(0.2 + 0.78 * p, t('k.extracting', { p: Math.round(p * 100) }));
      });
    }

    const voiced = res.midis.reduce((n, v) => n + (v != null ? 1 : 0), 0);
    if (voiced < 20) {
      throw new Error(t('k.noMelody'));
    }

    k.ref = res;
    k.fileReady = true;
    k.songName = file.name;
    k.scorer = null;
    const dur = k.player.duration || (res.times.length ? res.times[res.times.length - 1] : 0);
    // 精准模式下播放伴奏（让你跟着伴奏唱），单文件模式播放该文件本身
    await k.player.load(k.pairUsed && k.accFile ? k.accFile : file);
    liveText(info, 'k.ready', { name: file.name, dur: formatTime(dur), sec: (voiced * res.hopSec).toFixed(0) });

    show(1, t('k.donePct'));
    setTimeout(() => { loading.hidden = true; }, 500);
    toast(t('k.toastReady'));
  } catch (err) {
    console.error(err);
    loading.hidden = true;
    if (KARAOKE.accFile) {
      const pe = $('#karaokePairInfo');
      if (pe) { liveText(pe, 'k.pairFail', { msg: (err && err.message) ? err.message : 'error' }); pe.className = 'muted k-pair-status warn'; }
      KARAOKE.accFile = null;
    }
    liveText(info, 'k.loadFail', { msg: (err && err.message) ? err.message : 'unknown' });
    toast(t('k.loadFailToast', { msg: (err && err.message) ? err.message : 'unknown' }), 6000);
  }
}

function finishKaraoke() {
  const k = KARAOKE;
  const report = k.scorer ? k.scorer.buildReport() : null;
  $('#karaokeHint').classList.remove('live');
  liveText('#karaokeHint', 'k.hintDone');
  if (!report) return;
  renderKaraokeReport(report);
  if (k.songName) {
    saveSession({ exercise: 'karaoke', name: t('k.historyPrefix') + k.songName, avgScore: report.score, steps: 1, sung: 1 });
    renderHistory();
  }
}

function renderKaraokeReport(r) {
  state.karaoke.report = r;
  const el = $('#karaokeReport');
  const cov = Math.round((r.coverage || 0) * 100);
  const tune = Math.round((r.inTuneRatio || 0) * 100);
  const abs = r.avgAbsCents == null ? '--' : Math.round(r.avgAbsCents);
  const mean = r.meanCents == null ? '--' : (r.meanCents > 0 ? '+' : '') + Math.round(r.meanCents);
  const std = r.stdCents == null ? '--' : Math.round(r.stdCents);

  let html = '<h3>' + t('k.reportTitle') + '</h3>' +
    '<div class="k-report-head">' +
      '<div class="k-report-score">' + r.score + '<small>' + t('ex.points') + '</small></div>' +
      '<div class="k-report-stats">' +
        '<span>' + t('k.statPitch') + ' <b>' + tune + '%</b></span>' +
        '<span>' + t('k.statAvgDev') + ' <b>' + abs + '</b> ' + t('unit.cents') + '</span>' +
        '<span>' + t('k.statTendency') + ' <b>' + mean + '</b> ' + t('unit.cents') + '</span>' +
        '<span>' + t('k.statWobble') + ' <b>±' + std + '</b> ' + t('unit.cents') + '</span>' +
        '<span>' + t('k.statCoverage') + ' <b>' + cov + '%</b></span>' +
      '</div>' +
    '</div>' +
    '<div class="k-report"><h4>' + t('k.reportTips') + '</h4><ul>';
  for (const tip of r.tips) html += '<li>' + escapeHTML(t(tip.key, tip.vars)) + '</li>';
  html += '</ul>';

  if (r.segments && r.segments.length) {
    const ranked = r.segments.slice().sort((a, b) => a.acc - b.acc);
    const show = ranked.slice(0, 5);
    html += '<h4>' + t('k.reportSegs') + '</h4><div class="k-seg-list">';
    for (const s of show) {
      const label = s.text ? escapeHTML(s.text.slice(0, 18)) : t('k.noLyric');
      html += '<div class="k-seg ' + s.style + '">' +
        '<span class="k-seg-t">' + formatTime(s.start) + '</span>' +
        '<span>' + label + '</span>' +
        '<span class="k-seg-acc">' + Math.round(s.acc * 100) + '%</span>' +
        '<button class="k-seg-btn" data-seek="' + s.start.toFixed(2) + '">' + t('k.singHere') + '</button>' +
        '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
  el.hidden = false;

  el.querySelectorAll('[data-seek]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const seekTime = Number(btn.dataset.seek);
      const k = KARAOKE;
      if (!await prepareKaraokeMic()) return;
      await k.player.seek(seekTime);
      k.scorer = new KaraokeScorer({ ref: k.ref, lyrics: k.lyrics });
      k.lastEval = null;
      el.hidden = true;
      const ok2 = await k.player.play();
      if (ok2) {
        setKaraokePlayLabel(true);
        $('#karaokeHint').classList.add('live');
        liveText('#karaokeHint', 'k.hintLive');
        toast(t('k.jumpToast', { time: formatTime(seekTime) }));
      }
    });
  });
}

function updateKaraokeStatus() {
  const k = KARAOKE;
  if (!$('#tab-karaoke').classList.contains('active')) return;
  const ev = k.live;
  const last = k.lastEval;

  $('#karaokeTime').textContent = formatTime(k.time || 0) + ' / ' + formatTime(k.duration || 0);
  if (last && last.ref != null) {
    $('#karaokeRef').textContent = noteText(last.ref);
  } else {
    $('#karaokeRef').textContent = '--';
  }
  if (ev && ev.midi != null) {
    $('#karaokeMine').textContent = noteText(ev.midi);
  } else {
    $('#karaokeMine').textContent = '--';
  }
  if (last && last.cents != null) {
    const c = Math.round(last.cents);
    const el = $('#karaokeCents');
    el.textContent = (c > 0 ? '+' : '') + c + '¢';
    el.style.color = Math.abs(c) <= 50 ? 'var(--teal)' : (Math.abs(c) <= 100 ? 'var(--amber)' : 'var(--red)');
  } else {
    $('#karaokeCents').textContent = '--';
  }
  if (ev && state.micOn) {
    $('#karaokeLevel').value = Math.min(1, (ev.level || 0) * 12);
  } else {
    $('#karaokeLevel').value = 0;
  }
  if (k.scorer) $('#karaokeLiveScore').textContent = String(k.scorer.score);
  if (k.scorer) {
    $('#karaokeLiveCents').textContent = k.lastEval && k.lastEval.cents != null
      ? ((k.lastEval.cents > 0 ? '+' : '') + Math.round(k.lastEval.cents) + '¢')
      : '';
  }

  if (k.lyrics.length) {
    const idx = activeLyricIndex(k.lyrics, k.time || 0);
    const cur = k.lyrics[idx];
    const nxt = k.lyrics[idx + 1];
    if (cur) {
      $('#karaokeLyric').innerHTML = escapeHTML(cur.text || '♪') +
        (nxt && nxt.text ? '<span class="next">' + t('k.nextLyric') + escapeHTML(nxt.text) + '</span>' : '');
    }
  }
}

function drawKaraoke() {
  const cv = $('#karaokeCanvas');
  if (!cv || !$('#tab-karaoke').classList.contains('active')) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);

  const k = KARAOKE;
  const ref = k.ref;
  const t = k.time || 0;
  const t0 = t - K_PAST;
  const t1 = t0 + K_WINDOW;

  // 自适应音高范围
  let lo = 60, hi = 72;
  // 用可见范围内的音符段算音域：比逐帧更稳，不会被单帧八度错误拉满整个纵轴
  const visNotes = (ref && ref.notes) ? ref.notes.filter((x) => x.t1 >= t0 - 0.5 && x.t0 <= t1 + 0.5) : null;
  if (visNotes && visNotes.length) {
    const ms = visNotes.map((x) => x.midi).sort((a, b) => a - b);
    lo = ms[Math.floor(ms.length * 0.05)];
    hi = ms[Math.min(ms.length - 1, Math.ceil(ms.length * 0.95))];
    if (hi - lo < 5) { const mid = (lo + hi) / 2; lo = mid - 3; hi = mid + 3; }
  } else if (ref && ref.midis && ref.midis.length) {
    for (let i = 0; i < ref.times.length; i++) {
      const tm = ref.times[i];
      if (tm < t0 - 1 || tm > t1 + 1) continue;
      const v = ref.midis[i];
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (k.live && k.live.midi != null) {
    if (k.live.midi < lo) lo = k.live.midi;
    if (k.live.midi > hi) hi = k.live.midi;
  }
  lo = Math.max(36, Math.floor(lo) - 2);
  hi = Math.min(96, Math.ceil(hi) + 2);
  const span = Math.max(6, hi - lo);

  const padL = 44, padR = 10, padT = 12, padB = 20;
  const xOf = (tm) => padL + ((tm - t0) / (t1 - t0)) * (W - padL - padR);
  const yOf = (m) => padT + (1 - (m - lo) / span) * (H - padT - padB);

  // 网格与音名
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let m = lo; m <= hi; m++) {
    const isC = ((m % 12) + 12) % 12 === 0;
    ctx.strokeStyle = isC ? 'rgba(242,163,60,.28)' : 'rgba(255,255,255,.05)';
    ctx.beginPath();
    ctx.moveTo(padL, Math.round(yOf(m)) + 0.5);
    ctx.lineTo(W - padR, Math.round(yOf(m)) + 0.5);
    ctx.stroke();
    if (isC) {
      ctx.fillStyle = 'rgba(242,163,60,.75)';
      ctx.fillText(noteText(m), padL - 5, yOf(m) + 3.5);
    }
  }
  // 时间刻度
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  for (let s = Math.ceil(t0 / 2) * 2; s <= t1; s += 2) {
    const x = xOf(s);
    if (x < padL || x > W - padR) continue;
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, padT);
    ctx.lineTo(Math.round(x) + 0.5, H - padB);
    ctx.stroke();
    if (s >= 0) ctx.fillText(formatTime(s), x, H - 6);
  }

  // 参考旋律线
  if (ref && ref.notes && ref.notes.length) {
    // 按音符段画水平线段：跳变处不再斜连成乱线，断音处也不会被连起来
    ctx.strokeStyle = 'rgba(154,163,181,.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const nt of ref.notes) {
      if (nt.t1 < t0 - 0.2 || nt.t0 > t1) continue;
      const xa = xOf(Math.max(nt.t0, t0 - 0.2));
      const xb = xOf(Math.min(nt.t1, t1 + 0.2));
      if (xb - xa < 1.5) continue;
      const y = yOf(nt.midi);
      ctx.beginPath();
      ctx.moveTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.stroke();
    }
  } else if (ref && ref.times && ref.times.length) {
    ctx.strokeStyle = 'rgba(154,163,181,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let open = false;
    const i0 = Math.max(0, Math.floor((t0 - 0.5) / (ref.hopSec || 0.03)));
    const i1 = Math.min(ref.times.length - 1, Math.ceil((t1 + 0.5) / (ref.hopSec || 0.03)));
    for (let i = i0; i <= i1; i++) {
      const v = ref.midis[i];
      const tm = ref.times[i];
      if (v == null) { open = false; continue; }
      const x = xOf(tm), y = yOf(v);
      if (!open) { ctx.moveTo(x, y); open = true; } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();
  }

  // 用户实际唱的轨迹点
  if (k.scorer) {
    const trail = k.trail || (k.trail = []);
    // 只在播放中记录，避免暂停时空写一堆同时间戳的点
    if (k.player && k.player.playing) {
      trail.push({ t: k.time || 0, midi: k.live ? k.live.midi : null });
      if (trail.length > 900) trail.splice(0, trail.length - 900);
    }
    for (const p of trail) {
      if (p.t < t0 - 0.5 || p.t > t1) continue;
      if (p.midi == null) continue;
      const ref2 = k.scorer.ref;
      let cents = null;
      // 与参考线比较上色
      let bestD = Infinity, bestV = null;
      const rr = k.ref;
      if (rr) {
        for (let i = Math.max(0, Math.floor((p.t - 0.35) / (rr.hopSec || 0.03))); i < rr.times.length; i++) {
          const tm = rr.times[i];
          if (tm > p.t + 0.35) break;
          const v = rr.midis[i];
          if (v == null) continue;
          const d = Math.abs(tm - p.t);
          if (d < bestD) { bestD = d; bestV = v; }
        }
      }
      if (bestV != null && bestD <= 0.35) cents = (p.midi - bestV) * 100;
      ctx.beginPath();
      ctx.arc(xOf(p.t), yOf(p.midi), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = cents == null
        ? 'rgba(154,163,181,.6)'
        : (Math.abs(cents) <= 50 ? 'rgba(56,217,192,.95)'
          : (Math.abs(cents) <= 100 ? 'rgba(242,163,60,.9)' : 'rgba(242,103,94,.9)'));
      ctx.fill();
    }
  } else {
    k.trail = [];
  }

  // 播放头
  const px = xOf(t);
  ctx.strokeStyle = 'rgba(242,163,60,.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, padT);
  ctx.lineTo(px, H - padB);
  ctx.stroke();
  if (k.live && k.live.midi != null) {
    ctx.beginPath();
    ctx.arc(px, yOf(k.live.midi), 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56,217,192,.9)';
    ctx.fill();
  }

  if (!ref) {
    ctx.fillStyle = 'rgba(154,163,181,.75)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(canvasText('k.canvasEmpty'), W / 2, H / 2);
  }
}

function formatTime(sec) {
  sec = Math.max(0, Number(sec) || 0);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 调试句柄（供自动化测试/控制台排障）
window.__mm = { state, engine };

initLang();
$('#micBtnText').textContent = t('mic.enable');
$('#micHint').textContent = t('mic.privacy');
initOctaveBase();
initKaraoke();
// K歌初始化会改写按钮文案，这里再套用一次语言，保证首屏就是当前语言
applyI18n(document);
for (const id of ['runnerPhase', 'rangeStartBtn', 'rangeResult', 'karaokePlayBtn', 'karaokeHint', 'karaokeFileInfo', 'karaokePairInfo', 'karaokeLyric', 'karaokeProgressText']) {
  const el = $('#' + id);
  el.dataset.liveKey = el.getAttribute('data-i18n');
  el.removeAttribute('data-i18n');
}
initPractice();
renderLearn();
// 初始空状态：让音名显示占位符而不是残留的渐变块
$('#tunerNote').classList.add('flat');
$('#tunerNote').textContent = '--';
drawGauge(0, false);
drawPitchCurve();
requestAnimationFrame(tick);
