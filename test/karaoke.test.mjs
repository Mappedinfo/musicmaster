// test/karaoke.test.mjs —— K歌跟唱：LRC 解析、实时打分与指导文本
// 说明：karaoke.js 不在模块顶层触碰浏览器 API，因此可以在 Node 下直接测试。
const found = [];
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {} };
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null };

const K = await import('../js/karaoke.js');
const D = await import('../js/dsp.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name, detail || ''); }
  else { fail++; console.log('FAIL', name, detail || ''); }
}

// ---------- 1) LRC 解析 ----------
const lrc = [
  '[ti:测试]',
  '[00:12.50]第一句歌词',
  '[00:15.00][00:30.00]重复句',
  '[01:05]没有小数的行',
  '[00:20.123]毫秒精度',
  '没有时间标签的文本',
].join('\n');
const lines = K.parseLRC(lrc);
check('lrc 行数', lines.length === 5, String(lines.length));
check('lrc 排序', lines.every((l, i) => i === 0 || l.time >= lines[i - 1].time),
  lines.map((l) => l.time.toFixed(3)).join(','));
check('lrc 十秒小数', Math.abs(lines[0].time - 12.5) < 1e-9 && lines[0].text === '第一句歌词', JSON.stringify(lines[0]));
check('lrc 一行多标签', lines.filter((l) => l.text === '重复句').length === 2);
check('lrc 无小数', lines.some((l) => l.text === '没有小数的行' && Math.abs(l.time - 65) < 1e-9));
check('lrc 毫秒', lines.some((l) => l.text === '毫秒精度' && Math.abs(l.time - 20.123) < 1e-6));
check('lrc 跳过无标签行', !lines.some((l) => l.text.includes('没有时间标签')));

// ---------- 2) 当前歌词行查找 ----------
check('歌词 before 第一句', K.activeLyricIndex(lines, 0) === 0);
check('歌词 正在第二句', K.activeLyricIndex(lines, 13) === 1);
check('歌词 超过最后一句', K.activeLyricIndex(lines, 999) === lines.length - 1);
check('歌词 空数组', K.activeLyricIndex([], 5) === -1);

// ---------- 3) 打分器：唱得准 ----------
function makeRef(total = 30, hop = 0.01) {
  const times = [], midis = [];
  for (let i = 0; i * hop < total; i++) { times.push(i * hop); midis.push(69); }
  return { times, midis, hopSec: hop };
}
function feed(scorer, ref, offsetCents, frames = 800, startT = 0) {
  for (let i = 0; i < frames; i++) {
    const t = startT + i * 0.03;
    scorer.feed(t, offsetCents == null ? null : ref.midis[0] + offsetCents / 100);
  }
}
const ref30 = makeRef(30);
const sGood = new K.KaraokeScorer({ ref: ref30 });
feed(sGood, ref30, 0);
check('全准：音准率=1', Math.abs(sGood.inTune - 1) < 1e-9, String(sGood.inTune));
check('全准：覆盖率=1', Math.abs(sGood.coverage - 1) < 1e-9, String(sGood.coverage));
check('全准：分数高', sGood.score >= 95, String(sGood.score));

// ---------- 4) 打分器：整体偏低 ----------
const sFlat = new K.KaraokeScorer({ ref: ref30 });
feed(sFlat, ref30, -60);
check('偏低：音准率低', sFlat.inTune < 0.05, String(sFlat.inTune));
check('偏低：平均偏差约 60', Math.abs(sFlat.avgAbsCents - 60) < 1, String(sFlat.avgAbsCents));
check('偏低：倾向为负', sFlat.meanCents < -50, String(sFlat.meanCents));
const repFlat = sFlat.buildReport();
check('偏低：给出偏低建议', repFlat.tips.some((t) => t.includes('整体偏低')), repFlat.tips[0]);

// ---------- 5) 打分器：整体偏高 ----------
const sSharp = new K.KaraokeScorer({ ref: ref30 });
feed(sSharp, ref30, 55);
const repSharp = sSharp.buildReport();
check('偏高：倾向为正', repSharp.meanCents > 45, String(repSharp.meanCents));
check('偏高：给出偏高建议', repSharp.tips.some((t) => t.includes('整体偏高')), repSharp.tips[0]);

// ---------- 6) 打分器：完全没唱 ----------
const sSilent = new K.KaraokeScorer({ ref: ref30 });
feed(sSilent, ref30, null);
check('没唱：音准率=0', sSilent.inTune === 0, String(sSilent.inTune));
check('没唱：分数很低', sSilent.score <= 25, String(sSilent.score));
check('没唱：偏差统计为空（而不是误报走音）', sSilent.avgAbsCents === null && sSilent.meanCents === null,
  'avg=' + sSilent.avgAbsCents + ' mean=' + sSilent.meanCents);
check('没唱：missing 帧数=800', sSilent.missing === 800, String(sSilent.missing));
const repSilent = sSilent.buildReport();
check('没唱：提示麦克风问题', repSilent.tips.some((t) => t.includes('麦克风')), repSilent.tips[0]);

// ---------- 7) 打分器：无参考即不计入 ----------
const sNoRef = new K.KaraokeScorer({ ref: { times: [], midis: [] } });
for (let i = 0; i < 100; i++) sNoRef.feed(i * 0.03, 69);
check('无参考：评估帧为 0', sNoRef.evaluated === 0, String(sNoRef.evaluated));
check('无参考：覆盖率 0', sNoRef.coverage === 0, String(sNoRef.coverage));
check('无参考：音准率 0 不崩', sNoRef.inTune === 0 && sNoRef.avgAbsCents === null);

// ---------- 8) 打分器：差八度识别 ----------
const sOct = new K.KaraokeScorer({ ref: ref30 });
feed(sOct, ref30, 1200, 300);
check('八度：计到 octaveUp', sOct.octaveUp >= 300, String(sOct.octaveUp));
const repOct = sOct.buildReport();
check('八度：给出音域建议', repOct.tips.some((t) => t.includes('八度')), repOct.tips[0]);
check('八度：八度帧不污染偏差统计', repOct.avgAbsCents == null && repOct.stdCents == null,
  'avg=' + repOct.avgAbsCents + ' std=' + repOct.stdCents);

// ---------- 9) 分段与最差片段 ----------
const refSeg = makeRef(60);
const sSeg = new K.KaraokeScorer({ ref: refSeg, lyrics: [{ time: 30, text: '难点句' }] });
for (let i = 0; i < 2000; i++) {
  const t = i * 0.03;
  const wrong = t >= 30 && t < 40;
  sSeg.feed(t, refSeg.midis[0] + (wrong ? 2.5 : 0));
}
const repSeg = sSeg.buildReport();
check('分段：有片段', repSeg.segments.length >= 3, String(repSeg.segments.length));
check('分段：找到最差片段', repSeg.worst.length >= 1, String(repSeg.worst.length));
if (repSeg.worst.length) {
  const w = repSeg.worst[0];
  check('分段：最差片段在 30-44s', w.start >= 28 && w.start < 44, String(w.start));
  check('分段：最差片段带歌词', w.text === '难点句', w.text);
}

// ---------- 10) 分段片段的时间与准确率数值合理 ----------
for (const seg of repSeg.segments) {
  check('分段：acc 在 0-1', seg.acc >= 0 && seg.acc <= 1, String(seg.acc));
  check('分段：end > start', seg.end > seg.start, seg.start + '->' + seg.end);
}

// ---------- 11) 统计量自洽 ----------
check('统计：evaluated <= total', sSeg.evaluated <= sSeg.total, sSeg.evaluated + '/' + sSeg.total);
check('统计：mean 与 avgAbs 同号范围', Math.abs(sSeg.meanCents) <= sSeg.avgAbsCents + 1e-9,
  sSeg.meanCents + ' vs ' + sSeg.avgAbsCents);

// ---------- 12) 短片段提示 ----------
const sTiny = new K.KaraokeScorer({ ref: ref30 });
for (let i = 0; i < 30; i++) sTiny.feed(i * 0.03, 69);
check('太短：提示唱长一点', sTiny.buildReport().tips[0].includes('太短'), sTiny.buildReport().tips[0]);

// ---------- 13) 参考音高换算 ----------
check('220Hz -> MIDI 57', Math.abs(D.freqToMidi(220) - 57) < 0.01, String(D.freqToMidi(220)));
check('440Hz -> MIDI 69', Math.abs(D.freqToMidi(440) - 69) < 1e-9, String(D.freqToMidi(440)));

// ---------- 14) 合成音高 -> 打分（离线链路的核心假设）----------
const SR = 16000, FRAME = 2048;
function synth(freq, seconds) {
  const n = Math.round(SR * seconds);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.35 * Math.sin((2 * Math.PI * freq * i) / SR);
  return buf;
}
const tone = synth(220, 1);
const r1 = D.yinDetect(tone.subarray(0, FRAME), SR, { minFreq: 60, maxFreq: 1100 });
const centsErr = Math.abs(D.centsBetween(r1.frequency, 220));
check('16k 窗 YIN 220Hz', r1.voiced && centsErr < 12,
  'f=' + r1.frequency.toFixed(2) + ' cents=' + centsErr.toFixed(2) + ' clarity=' + r1.clarity.toFixed(3));

// 220Hz 的 MIDI 是 57；参考线要设成同一个音，否则会被判成差八度
const refA3 = { times: [], midis: [], hopSec: 0.01 };
for (let i = 0; i * 0.01 < 5; i++) { refA3.times.push(i * 0.01); refA3.midis.push(D.freqToMidi(220)); }
const sSynth = new K.KaraokeScorer({ ref: refA3, hitCents: 50 });
sSynth.feed(0, D.freqToMidi(r1.frequency));
check('合成音高可判为准', sSynth.hit === 1, 'hit=' + sSynth.hit + ' cents=' + sSynth.meanCents);
check('合成音高：偏低 100Hz 判为差八度', (() => {
  const s = new K.KaraokeScorer({ ref: refA3 });
  s.feed(0, D.freqToMidi(110));
  return s.octaveDown === 1 && s.voicedFrames === 0;
})(), 'octaveDown');

// ---------- 15) 常量 ----------
check('目标采样率 16k', K.TARGET_SR === 16000, String(K.TARGET_SR));

console.log('---');
console.log('KARAOKE ' + (fail === 0 ? 'OK' : 'FAILED') + ' (' + pass + ' pass, ' + fail + ' fail)');
process.exit(fail === 0 ? 0 : 1);
