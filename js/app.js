// ============================================================
// MusicMaster 主逻辑：选项卡、音准仪、练习、频谱、课程
// ============================================================
import { freqToMidi, midiToFreq, midiToNote, midiToSolfege, medianFilter } from './dsp.js';
import { AudioEngine, TonePlayer } from './engine.js';
import { KEYS, buildExercises, ExerciseRunner, loadHistory, saveSession } from './exercises.js';
import { LESSONS, WEEK_PLAN } from './lessons.js';

const $ = (sel) => document.querySelector(sel);

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
};

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, ms = 3400) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- 选项卡 ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
  });
});

// ---------- 麦克风开关 ----------
const micBtn = $('#micBtn');
micBtn.addEventListener('click', async () => {
  if (state.micOn) { stopMic(); return; }
  micBtn.disabled = true;
  $('#micBtnText').textContent = '正在请求权限…';
  try {
    const testTone = new URLSearchParams(location.search).get('testtone');
    if (testTone) await engine.startTest(parseFloat(testTone) || 220);
    else await engine.start();
    engine.onFrame = onFrame;
    engine.onSpectrum = onSpectrum;
    state.micOn = true;
    state.trailStart = performance.now();
    micBtn.classList.add('listening');
    $('#micBtnText').textContent = '停止录音';
    $('#micHint').textContent = '正在监听 · 对着麦克风哼 "wu——" 试试';
    toast('🎙️ 麦克风已开启，开始唱吧！');
  } catch (err) {
    console.error(err);
    let msg = '无法访问麦克风。';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      msg = '浏览器只允许在 HTTPS 或 localhost 下使用麦克风，请通过 GitHub Pages 地址访问。';
    } else if (err && err.name === 'NotAllowedError') {
      msg = '麦克风权限被拒绝。请点击地址栏左侧的锁形图标，允许麦克风后重试。';
    } else if (err && err.name === 'NotFoundError') {
      msg = '没有检测到麦克风设备。';
    }
    toast(msg, 5200);
    $('#micBtnText').textContent = '启用麦克风';
  }
  micBtn.disabled = false;
});

function stopMic() {
  if (state.runner) stopExercise();
  engine.stop();
  state.micOn = false;
  micBtn.classList.remove('listening');
  $('#micBtnText').textContent = '启用麦克风';
  $('#micHint').textContent = '所有分析都在你的浏览器本地完成，录音不会上传';
  $('#tunerNote').textContent = '--';
  $('#tunerFreq').textContent = '0.0 Hz';
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
  const noteEl = $('#tunerNote');
  if (midi != null && f.clarity > 0.5) {
    const n = midiToNote(midi);
    noteEl.textContent = n.name + n.octave;
    noteEl.classList.remove('flat');
    $('#tunerFreq').textContent = f.frequency.toFixed(1) + ' Hz';
    const solfege = midiToSolfege(n.midi, KEYS[state.currentKey].root);
    $('#tunerSolfege').textContent = solfege ? '唱名 ' + solfege : '';
    const cents = Math.max(-50, Math.min(50, n.cents));
    $('#tunerCents').textContent = (n.cents > 0 ? '+' : '') + n.cents;
    $('#tunerCents').style.color = Math.abs(n.cents) <= 15 ? 'var(--teal)' : (Math.abs(n.cents) <= 35 ? 'var(--amber)' : 'var(--red)');
    drawGauge(cents, f.voiced);
  } else {
    noteEl.classList.add('flat');
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
    ctx.strokeStyle = '#3a4155';
    ctx.stroke();
    if (c % 25 === 0) {
      ctx.fillStyle = '#6b7487';
      ctx.fillText(String(c), cx + Math.cos(ang) * (R - 44), cy + Math.sin(ang) * (R - 44) + 4);
    }
  }
  // 指针
  if (active) {
    const ang = toAngle(cents);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (R - 30), cy + Math.sin(ang) * (R - 30));
    ctx.strokeStyle = Math.abs(cents) <= 15 ? '#38d9c0' : '#f2a33c';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.fillStyle = active ? '#e9ecf3' : '#3a4155';
  ctx.fill();
}

// ---------- 音高曲线（音准仪） ----------
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
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
    ctx.fillStyle = '#566078';
    ctx.fillText(NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1), 4, y - 2);
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
      ctx.strokeStyle = '#f2a33c';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    prev = { x, y };
  }
}

// ---------- 练习模式 ----------
function initPractice() {
  const sel = $('#keySelect');
  KEYS.forEach((k, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = k.label;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => { state.currentKey = +sel.value; buildExerciseCards(); });
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
    card.innerHTML = '<div class="ex-icon">' + ex.icon + '</div><h4>' + ex.name + '</h4><p>' + ex.desc + '</p>' +
      (best > 0 ? '<div class="ex-best">最好成绩 ' + best + ' 分</div>' : '');
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
  $('#runnerTitle').textContent = ex.icon + ' ' + ex.name;
  $('#runnerDesc').textContent = ex.desc;
  $('#runnerFeedback').innerHTML = '<button class="btn btn-primary" id="startExerciseBtn">▶ 开始练习</button>';
  $('#runnerSummary').hidden = true;
  $('#stepDots').innerHTML = '';
  $('#runnerTarget').textContent = '--';
  $('#runnerPhase').textContent = '准备';
  $('#runnerPhase').className = 'target-label';
  $('#runnerLiveCents').textContent = '';
  rc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#startExerciseBtn').addEventListener('click', () => startExercise(ex));
}

async function startExercise(ex) {
  if (!state.micOn) {
    toast('请先点击右上角「启用麦克风」');
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
      $('#runnerPhase').textContent = '🔊 听示范音';
      $('#runnerPhase').className = 'target-label';
      $('#runnerTarget').textContent = ev.note.name + ev.note.octave;
      $('#runnerLiveCents').textContent = '';
    } else if (ev.type === 'step-listen') {
      state.exTarget = ev.midi;
      state.exTrail = [];
      dots.children[ev.index].className = 'step-dot singing';
      $('#runnerPhase').textContent = '🎤 唱！';
      $('#runnerPhase').className = 'target-label sing';
    } else if (ev.type === 'step-score') {
      const r = ev.result;
      const good = r.score >= 70;
      dots.children[ev.index].className = 'step-dot done' + (good ? '' : ' bad');
      if (r.frames >= 5) {
        const chip = document.createElement('span');
        chip.className = 'fb-chip ' + (good ? 'good' : 'bad');
        const c = r.medianCents;
        chip.innerHTML = '<b>' + ev.note.name + ev.note.octave + '</b> ' + (c > 0 ? '+' : '') + c + '¢ · 稳 ' + r.stability + '¢ · ' + r.score + '分';
        fb.appendChild(chip);
      } else {
        const chip = document.createElement('span');
        chip.className = 'fb-chip bad';
        chip.textContent = ev.note.name + ev.note.octave + ' 没听清你的声音';
        fb.appendChild(chip);
      }
      state.exTarget = null;
      $('#runnerPhase').textContent = '准备';
      $('#runnerPhase').className = 'target-label';
    } else if (ev.type === 'done') {
      state.runner = null;
      state.exTarget = null;
      const s = ev.summary;
      const sum = $('#runnerSummary');
      sum.hidden = false;
      sum.innerHTML = '<div class="big-score">' + s.avgScore + ' 分</div>' +
        '<p>完成 ' + s.sung + '/' + s.steps + ' 个音。' + summaryComment(s.avgScore) + '</p>' +
        '<p style="margin-top:10px"><button class="btn btn-secondary" id="againBtn">再练一次</button></p>';
      $('#againBtn').addEventListener('click', () => startExercise(ex));
      saveSession({ exercise: ex.id, name: ex.name, avgScore: s.avgScore, steps: s.steps, sung: s.sung });
      renderHistory();
      buildExerciseCards();
      $('#runnerPhase').textContent = '完成';
      $('#runnerTarget').textContent = '🎉';
      $('#runnerLiveCents').textContent = '';
    }
  };
  runner.start();
}

function summaryComment(score) {
  if (score >= 85) return '非常棒！音准和稳定性都很出色，可以试试更高难度或换个调。';
  if (score >= 70) return '不错！大部分音都唱准了，注意个别偏低/偏高的音。';
  if (score >= 50) return '有进步空间。跟着示范音慢一些唱，先求准再求稳。';
  return '没关系，初学者大多从这里开始。先练「单音模唱」，每次只专注于一个音。';
}

$('#stopExerciseBtn').addEventListener('click', () => stopExercise());
function stopExercise() {
  if (state.runner) { state.runner.cancel(); state.runner = null; }
  state.exTarget = null;
  $('#runnerPhase').textContent = '已停止';
  $('#runnerPhase').className = 'target-label';
  $('#runnerLiveCents').textContent = '';
  const fb = $('#runnerFeedback');
  if (state.selectedEx) {
    fb.innerHTML = '<button class="btn btn-primary" id="startExerciseBtn">▶ 开始练习</button>';
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
    ctx.fillStyle = '#566078';
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
  const tn = midiToNote(target);
  ctx.fillStyle = '#38d9c0';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('目标 ' + tn.name + tn.octave, 6, ty - 6);

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
      ctx.strokeStyle = devCents <= 25 ? '#38d9c0' : (devCents <= 60 ? '#f2a33c' : '#f2675e');
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
  if (!state.micOn) { toast('请先启用麦克风'); return; }
  state.range.active = !state.range.active;
  $('#rangeStartBtn').textContent = state.range.active ? '停止并查看结果' : '开始记录';
  if (state.range.active) {
    state.range.midis = [];
    $('#rangeResult').textContent = '记录中……先哼一个最低的音，再哼一个最高的音。';
  } else {
    showRangeResult();
  }
});
$('#rangeResetBtn').addEventListener('click', () => {
  state.range.midis = [];
  $('#rangeResult').textContent = '尚未记录。录音开始后随便哼唱即可。';
});
function showRangeResult() {
  const ms = state.range.midis;
  if (ms.length < 10) { $('#rangeResult').textContent = '采集到的有效声音太少，再试一次（唱清楚一点、时间长一点）。'; return; }
  ms.sort((a, b) => a - b);
  const lo = ms[Math.floor(ms.length * 0.02)];
  const hi = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.98))];
  const nLo = midiToNote(lo), nHi = midiToNote(hi);
  $('#rangeResult').innerHTML = '你的可用音域大约是 <b>' + nLo.name + nLo.octave + '</b> — <b>' + nHi.name + nHi.octave + '</b>' +
    '（约 ' + (Math.round((hi - lo) * 10) / 10) + ' 个半音）。普通人的舒适音域一般在 12–18 个半音，练声可以逐步扩展。';
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
    ctx.fillStyle = '#566078';
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
    ctx.strokeStyle = '#f2a33c';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f2a33c';
    ctx.textAlign = 'left';
    ctx.fillText('基频 ' + f.frequency.toFixed(0) + ' Hz', Math.min(x + 6, W - 110), 14);
  }

  // 指标
  $('#mCentroid').textContent = s.centroid ? Math.round(s.centroid) + ' Hz' : '--';
  $('#mH1H2').textContent = (s.h1h2 != null && Number.isFinite(s.h1h2)) ? s.h1h2.toFixed(1) + ' dB' : '--';
  $('#mLH').textContent = Number.isFinite(s.lhRatio) ? s.lhRatio.toFixed(1) + ' dB' : '--';
  $('#mHNR').textContent = s.hRatio ? Math.round(s.hRatio * 100) + '%' : '--';
  $('#mSF').textContent = s.sfRatio ? (s.sfRatio * 100).toFixed(1) + '%' : '--';
}

// ---------- 课程内容 ----------
function renderLearn() {
  const root = $('#learnContent');
  let html = '';
  for (const lesson of LESSONS) {
    html += '<div class="lesson"><h2>' + lesson.title + '</h2>';
    if (lesson.sub) html += '<div class="lesson-sub">' + lesson.sub + '</div>';
    for (const block of lesson.blocks) {
      html += '<div class="card">';
      if (block.h4) html += '<h4>' + block.h4 + '</h4>';
      html += block.html;
      html += '</div>';
    }
    html += '</div>';
  }
  html += '<div class="lesson"><h2>🗓️ 入门四周计划</h2><div class="lesson-sub">每天 10–15 分钟即可，贵在坚持。练习前后各喝温水，嗓子疼就休息。</div><div class="card"><div class="week-plan">';
  for (const w of WEEK_PLAN) {
    html += '<div class="week"><b>' + w.week + '</b><p>' + w.text + '</p></div>';
  }
  html += '</div></div></div>';
  root.innerHTML = html;
}

// ---------- 历史记录 ----------
function renderHistory() {
  const list = $('#historyList');
  const h = loadHistory();
  if (!h.length) {
    list.innerHTML = '<p class="muted">还没有练习记录，完成一次跟唱练习后会自动保存在本机。</p>';
    return;
  }
  list.innerHTML = '';
  [...h].reverse().slice(0, 30).forEach(rec => {
    const d = new Date(rec.at);
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = '<span>' + (rec.name || rec.exercise) + ' · ' + rec.sung + '/' + rec.steps + ' 音</span>' +
      '<span><span class="h-score">' + rec.avgScore + ' 分</span> <span class="h-time">' +
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
  requestAnimationFrame(tick);
}

// 调试句柄（供自动化测试/控制台排障）
window.__mm = { state, engine };

initPractice();
renderLearn();
drawGauge(0, false);
requestAnimationFrame(tick);
