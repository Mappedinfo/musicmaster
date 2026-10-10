// 全部使用合成信号；不读取用户音频、不依赖浏览器或模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRecording, compareRecording, estimateRecordingOffset, validateRecordingReport } from '../js/recording-analysis.js';

const SR = 16000;
const DEFAULT = { sourceKind: 'vocal', label: 'synthetic test', spectralFeatures: false };

function synth({ seconds = 3, midi = 57, amplitude = 0.25, vibrato = 0, vibratoHz = 6, drift = 0, fade = 1 } = {}) {
  const pcm = new Float32Array(Math.round(seconds * SR));
  let phase = 0;
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR;
    const pitch = midi + drift * t / seconds + vibrato * Math.sin(2 * Math.PI * vibratoHz * t);
    phase += 2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) / SR;
    pcm[i] = amplitude * fade ** (t / seconds) * Math.sin(phase);
  }
  return pcm;
}

function join(...pieces) {
  const joined = new Float32Array(pieces.reduce((n, x) => n + x.length, 0));
  let offset = 0;
  for (const piece of pieces) { joined.set(piece, offset); offset += piece.length; }
  return joined;
}

const sinePcm = synth();
const sine = analyzeRecording(sinePcm, SR, DEFAULT);
const reference = analyzeRecording(synth({ midi: 57.05 }), SR, { ...DEFAULT, label: 'independent reference' });

// 偏移搜索测试用离散音高报告，避免长 PCM 检出误差掩盖时间/歧义边界。
function melodicReport(durationSec, midiAt, label = 'synthetic melody') {
  const report = structuredClone(sine);
  report.metadata = { ...report.metadata, label, durationSec };
  delete report.metadata.analysisFingerprint;
  report.frames = [];
  for (let t = 0.064; t < durationSec - 0.064; t += 0.02) {
    const midi = midiAt(t);
    report.frames.push({ t: Number(t.toFixed(4)), midi, clarity: midi == null ? 0 : 0.99, rms: midi == null ? 0 : 0.18 });
  }
  const voiced = report.frames.filter((f) => f.midi != null), pitches = voiced.map((f) => f.midi);
  report.quality = { status: voiced.length ? 'ok' : 'insufficient', reasons: [], voicedRatio: voiced.length / report.frames.length, effectiveVoicedSec: voiced.length * 0.02 };
  report.summary = { ...report.summary, robustRange: { lowMidi: pitches.length ? Math.min(...pitches) : null, highMidi: pitches.length ? Math.max(...pitches) : null }, medianMidi: pitches.length ? pitches[0] : null, effectiveVoicedSec: report.quality.effectiveVoicedSec, stableRegions: [], hypothesisReasons: [] };
  report.segments = voiced.length ? [{ id: 'phrase-1', start: voiced[0].t - 0.01, end: voiced.at(-1).t + 0.01, medianMidi: pitches[0] }] : [];
  report.issues = []; report.hypotheses = [];
  return report;
}

const melodyNotes = [57, 61, 59, 64, 60, 66, 58, 63, 55, 62, 65, 60, 67, 61, 56, 64, 58, 66, 60, 63, 57, 65, 59, 62, 68, 60, 64, 55, 61, 67];
const melodyAt = (t) => t < 0 || t >= 36 ? null : melodyNotes[Math.floor(t / 1.2)] + 0.03 * Math.sin(t * 2 * Math.PI * 6);

test('默认窗/步长/窗中心与 F0 单位正确，JSON round trip 可校验', () => {
  assert.equal(sine.parameters.frameSize, 2048);
  assert.equal(sine.parameters.hopSec, 0.02);
  assert.equal(sine.frames[0].t, 2048 / 2 / SR);
  assert.ok(Math.abs(sine.frames[1].t - sine.frames[0].t - 0.02) < 1e-9);
  assert.ok(Math.abs(sine.summary.medianMidi - 57) < 0.03);
  assert.ok(sine.quality.effectiveVoicedSec > 2.5);
  assert.equal(sine.quality.status, 'ok');
  assert.deepEqual(validateRecordingReport(JSON.parse(JSON.stringify(sine))), { valid: true, errors: [] });
});

test('没有参考时不输出音准分和偏高/低判定', () => {
  assert.equal(sine.score, undefined);
  assert.equal(sine.summary.score, undefined);
  assert.equal(sine.comparison, undefined);
  assert.ok(sine.issues.every((x) => !['pitchFlat', 'pitchSharp', 'pitchError'].includes(x.code)));
});

test('完全静音与太短文件不伪造音域或原因', () => {
  const silence = analyzeRecording(new Float32Array(SR * 2), SR, DEFAULT);
  assert.equal(silence.quality.status, 'insufficient');
  assert.equal(silence.summary.robustRange.lowMidi, null);
  assert.deepEqual(silence.hypotheses, []);
  assert.deepEqual(silence.issues, []);
  assert.equal(validateRecordingReport(silence).valid, true);
  const short = analyzeRecording(new Float32Array(128), SR, DEFAULT);
  assert.deepEqual(short.frames, []);
  assert.ok(short.quality.reasons.includes('tooShort'));
});

test('句段由静音划分，持续音统计独立于整句', () => {
  const sentence = analyzeRecording(join(synth({ seconds: 1.4 }), new Float32Array(SR * 0.7), synth({ seconds: 1.4, midi: 60 })), SR, DEFAULT);
  assert.equal(sentence.segments.length, 2);
  assert.ok(sentence.segments[0].end < sentence.segments[1].start);
  assert.ok(sentence.summary.stableRegions.length >= 2);
  assert.ok(sentence.segments.every((s) => s.stableRegionIds.length >= 1));
});

test('正常旋律换音、滑音和 6Hz 颤音不误报不稳', () => {
  const melody = analyzeRecording(join(synth({ seconds: 0.7, midi: 57 }), synth({ seconds: 0.7, midi: 60 }), synth({ seconds: 0.7, midi: 64 })), SR, DEFAULT);
  const glide = analyzeRecording(synth({ seconds: 3, drift: 4 }), SR, DEFAULT);
  const vibrato = analyzeRecording(synth({ vibrato: 0.5 }), SR, DEFAULT);
  for (const report of [melody, glide, vibrato]) {
    assert.ok(report.issues.every((x) => x.code !== 'instability'));
    assert.ok(report.hypotheses.every((x) => x.code !== 'pressedPhonation'));
  }
  assert.ok(vibrato.summary.stableRegions.some((r) => r.vibrato?.rateHz >= 3 && r.vibrato?.rateHz <= 9));
});

test('60ms以内检出缺口可保留持续音，缺口不计有效时长且不误判颤音', () => {
  const pcm = synth({ vibrato: 0.5 });
  pcm.fill(0, Math.round(1.48 * SR), Math.round(1.52 * SR));
  const report = analyzeRecording(pcm, SR, DEFAULT);
  const region = report.summary.stableRegions.find((r) => r.pitchGaps > 0);
  assert.ok(region, JSON.stringify(report.summary.stableRegions));
  assert.ok(region.durationSec > 2.5);
  assert.ok(region.voicedSec < region.durationSec && region.voicedCoverage >= 0.8);
  assert.equal(region.periodicityEvaluated, false);
  assert.equal(region.vibrato, null);
  assert.ok(!report.issues.some((i) => i.code === 'instability'));
  assert.ok(!report.hypotheses.some((i) => i.code === 'pressedPhonation'));
  const changed = analyzeRecording(join(synth({ seconds: 1.4 }), new Float32Array(SR * 0.04), synth({ seconds: 1.4, midi: 63 })), SR, DEFAULT);
  assert.ok(changed.summary.stableRegions.every((r) => r.durationSec < 1.7));
  const longGap = analyzeRecording(join(synth({ seconds: 1.4 }), new Float32Array(SR * 0.4), synth({ seconds: 1.4 })), SR, DEFAULT);
  assert.equal(longGap.summary.stableRegions.length, 2);
  assert.equal(longGap.segments.length, 2);
});

test('固定声部偏移估计支持正负裁剪，只给候选且保持输入不变', () => {
  const ref = melodicReport(36, melodyAt, 'offset reference');
  for (const offset of [1.2, -0.7]) {
    const perf = melodicReport(30, (t) => melodyAt(t + offset), `offset ${offset}`);
    const previous = JSON.stringify(perf);
    const estimate = estimateRecordingOffset(perf, ref, { maxOffsetSec: 5 });
    assert.equal(estimate.status, 'estimated', JSON.stringify(estimate));
    assert.ok(Math.abs(estimate.offsetSec - offset) <= 0.1);
    assert.equal(estimate.alignmentTrusted, false);
    assert.ok(Object.values(estimate.quality).every(Number.isFinite));
    assert.equal(JSON.stringify(perf), previous);
    const compared = compareRecording(perf, ref, { offsetSec: estimate.offsetSec });
    compared.comparison.alignmentEstimate = estimate;
    assert.equal(compared.comparison.score, null);
    assert.equal(validateRecordingReport(compared).valid, true);
  }
});

test('重复旋律、错参考、平直音高和静音不自动选偏移', () => {
  const repeated = (t) => [57, 60, 64, 59][Math.floor(Math.max(0, t) / 1.2) % 4];
  const ambiguity = estimateRecordingOffset(melodicReport(30, repeated), melodicReport(36, repeated), { maxOffsetSec: 8 });
  assert.equal(ambiguity.status, 'unavailable');
  assert.ok(ambiguity.reasons.includes('alignmentAmbiguous'), JSON.stringify(ambiguity));
  assert.equal(ambiguity.offsetSec, 0);
  const wrong = estimateRecordingOffset(melodicReport(30, melodyAt), melodicReport(36, (t) => 69 - melodyAt(t) / 2), { maxOffsetSec: 5 });
  assert.equal(wrong.status, 'unavailable');
  assert.equal(wrong.offsetSec, 0);
  assert.ok(estimateRecordingOffset(melodicReport(20, () => 57), melodicReport(20, () => 58)).reasons.includes('alignmentNotEnoughVariation'));
  assert.ok(estimateRecordingOffset(melodicReport(20, () => null), melodicReport(20, melodyAt)).reasons.includes('alignmentInsufficientVoicing'));
});

test('可信参考局部音程用同句相邻持续平台，至少三组；音分有单位', () => {
  const notes = [57, 61, 59, 64, 60];
  const perf = analyzeRecording(join(...notes.map((midi, i) => synth({ seconds: 1.3, midi: midi + i * 0.1 }))), SR, DEFAULT);
  const ref = analyzeRecording(join(...notes.map((midi) => synth({ seconds: 1.3, midi }))), SR, DEFAULT);
  const compared = compareRecording(perf, ref, { alignmentTrusted: true });
  const intervals = compared.comparison.intervalComparison;
  assert.ok(intervals?.count >= 3, JSON.stringify({ a: perf.summary.stableRegions, b: ref.summary.stableRegions }));
  assert.equal(intervals.method, 'adjacentSustainedRegions');
  assert.ok(Math.abs(intervals.medianErrorCents - 10) < 2);
  assert.ok(intervals.pairs.every((p) => Number.isFinite(p.referenceIntervalSemitones) && Number.isFinite(p.errorCents)));
  assert.equal(validateRecordingReport(compared).valid, true);
  assert.equal(compareRecording(perf, ref).comparison.intervalComparison, null);
  assert.equal(compareRecording(sine, reference, { alignmentTrusted: true }).comparison.intervalComparison, null);
});

test('单次尾音变弱不推断气息原因，重复同向观察才给低可信假设', () => {
  const phrase = synth({ seconds: 2.8, drift: -0.6, amplitude: 0.4, fade: 0.175 });
  const once = analyzeRecording(phrase, SR, DEFAULT);
  assert.ok(once.hypotheses.every((x) => x.code !== 'breathSupport'));
  const repeated = analyzeRecording(join(phrase, new Float32Array(SR * 0.5), phrase, new Float32Array(SR * 0.5), phrase), SR, DEFAULT);
  const hypothesis = repeated.hypotheses.find((x) => x.code === 'breathSupport');
  assert.ok(hypothesis, JSON.stringify(repeated.summary.stableRegions));
  assert.equal(hypothesis.confidence, 'low');
  assert.ok(hypothesis.evidence.repetitions >= 3);
  assert.ok(hypothesis.alternatives.includes('intentionalExpression'));
  assert.equal(hypothesis.verificationKey, 'recording.verify.breathSupport');
});

test('未知/混合来源拒绝生理原因推断，分离残留始终提示', () => {
  for (const sourceKind of ['unknown', 'mixed']) {
    const report = analyzeRecording(sinePcm, SR, { ...DEFAULT, sourceKind });
    assert.deepEqual(report.hypotheses, []);
    assert.ok(report.summary.hypothesisReasons.includes('needDryRecording'));
    assert.equal(report.quality.status, 'limited');
  }
  const separated = analyzeRecording(sinePcm, SR, { ...DEFAULT, sourceKind: 'separated' });
  assert.ok(separated.quality.reasons.includes('separationArtifacts'));
  assert.ok(separated.hypotheses.every((x) => x.confidence === 'low'));
});

test('最小 STFT 特征是有限观测，单独亮/响/低 H1-H2 不报挤嗓', () => {
  const bright = analyzeRecording(synth({ midi: 72, amplitude: 0.6 }), SR, { ...DEFAULT, spectralFeatures: true });
  const spectral = bright.frames.find((f) => f.spectral)?.spectral;
  assert.ok(spectral);
  assert.ok(Number.isFinite(spectral.centroidHz));
  assert.ok(spectral.harmonicRatio >= 0 && spectral.harmonicRatio <= 1);
  assert.equal(bright.parameters.h1h2Correction, 'none');
  assert.ok(bright.hypotheses.every((x) => x.code !== 'pressedPhonation'));
  assert.equal(validateRecordingReport(bright).valid, true);
});

test('默认未确认对齐不评分，可信独立参考匹配可评分且不修改输入', () => {
  const beforePerformance = JSON.stringify(sine), beforeReference = JSON.stringify(reference);
  const untrusted = compareRecording(sine, reference);
  assert.equal(untrusted.comparison.score, null);
  assert.equal(untrusted.comparison.status, 'unscored');
  assert.ok(untrusted.comparison.reasons.includes('alignmentUntrusted'));
  const scored = compareRecording(sine, reference, { alignmentTrusted: true });
  assert.equal(scored.comparison.status, 'ready');
  assert.ok(scored.comparison.score >= 95);
  assert.ok(Math.abs(scored.comparison.medianCents + 5) < 2);
  assert.ok(scored.comparison.referenceFrames.length > 0);
  assert.equal(JSON.stringify(sine), beforePerformance);
  assert.equal(JSON.stringify(reference), beforeReference);
  assert.equal(validateRecordingReport(scored).valid, true);
});

test('同对象/复制 PCM/同文件 hash 的自我对比全部拒绝评分', () => {
  for (const ref of [sine, JSON.parse(JSON.stringify(sine)), analyzeRecording(new Float32Array(sinePcm), SR, { ...DEFAULT, label: 'copied' })]) {
    const report = compareRecording(sine, ref, { alignmentTrusted: true });
    assert.equal(report.comparison.score, null);
    assert.ok(report.comparison.reasons.includes('selfComparison'));
  }
  const a = { ...sine, metadata: { ...sine.metadata, sourceHash: 'same-file' } };
  const b = { ...reference, metadata: { ...reference.metadata, sourceHash: 'same-file' } };
  assert.ok(compareRecording(a, b, { alignmentTrusted: true }).comparison.reasons.includes('selfComparison'));
});

test('偏低/偏高方向与参考移调口径正确', () => {
  const raised = analyzeRecording(synth({ midi: 58 }), SR, DEFAULT);
  const sharp = compareRecording(raised, reference, { alignmentTrusted: true });
  assert.ok(sharp.issues.some((x) => x.code === 'pitchSharp'));
  const shifted = compareRecording(raised, reference, { alignmentTrusted: true, transposeSemitones: 1 });
  assert.ok(shifted.comparison.score >= 95);
  const flat = compareRecording(sine, raised, { alignmentTrusted: true });
  assert.ok(flat.issues.some((x) => x.code === 'pitchFlat'));
});

test('八度换唱单列比例，区分主动换八度/追踪歧义与小音分走音', () => {
  const octave = analyzeRecording(synth({ midi: 69.05 }), SR, DEFAULT);
  const mismatch = compareRecording(octave, reference, { alignmentTrusted: true });
  assert.ok(mismatch.comparison.octaveDifferenceRatio > 0.95);
  assert.ok(mismatch.comparison.octaveUpRatio > 0.95);
  assert.ok(mismatch.issues.every((x) => !['pitchSharp', 'pitchFlat'].includes(x.code)));
  assert.ok(mismatch.issues.some((x) => x.code === 'pitchError' && x.metrics.octaveShiftSemitones === 12));
  const intentional = compareRecording(octave, reference, { alignmentTrusted: true, transposeSemitones: 12 });
  assert.ok(intentional.comparison.score >= 95);
  assert.equal(intentional.comparison.octaveDifferenceRatio, 0);
});

test('offsetSec 正方向：演唱 t 对应参考 t+offsetSec', () => {
  const lead = new Float32Array(SR);
  const delayedReference = analyzeRecording(join(lead, synth({ midi: 57.05, seconds: 3 })), SR, DEFAULT);
  const aligned = compareRecording(sine, delayedReference, { alignmentTrusted: true, offsetSec: 1 });
  assert.ok(aligned.comparison.coverage > 0.9);
  assert.ok(aligned.comparison.score >= 95);
  assert.ok(aligned.comparison.eligibleReferenceSec > 2.5);
  assert.equal(aligned.comparison.validComparisonRatio, aligned.comparison.coverage);
  assert.equal(aligned.comparison.performanceDetectedSec, sine.quality.effectiveVoicedSec);
  assert.ok(aligned.comparison.referenceCoverageRatio > 0.9);
  assert.equal(aligned.comparison.scoreMetric, 'pairedPitchHitPercent');
});

test('无声参考/不可信来源/重叠不足都拒绝评分', () => {
  const silent = analyzeRecording(new Float32Array(SR * 3), SR, DEFAULT);
  const silentResult = compareRecording(sine, silent, { alignmentTrusted: true });
  assert.equal(silentResult.comparison.score, null);
  assert.ok(silentResult.comparison.reasons.includes('referenceInsufficient'));
  const mixed = { ...reference, metadata: { ...reference.metadata, sourceKind: 'mixed' } };
  assert.ok(compareRecording(sine, mixed, { alignmentTrusted: true }).comparison.reasons.includes('sourceUnverified'));
  assert.ok(compareRecording(sine, reference, { alignmentTrusted: true, offsetSec: 10 }).comparison.reasons.includes('insufficientOverlap'));
});

test('局部起音提前/延后独立于音高命中率，不以全曲均值代替', () => {
  const delayed = analyzeRecording(join(new Float32Array(SR * 0.2), synth({ midi: 57 })), SR, DEFAULT);
  const late = compareRecording(delayed, reference, { alignmentTrusted: true });
  assert.ok(late.comparison.score >= 95);
  assert.ok(late.issues.some((x) => x.code === 'onsetLate' && x.metrics.offsetMs >= 120));
  const early = compareRecording(reference, delayed, { alignmentTrusted: true });
  assert.ok(early.issues.some((x) => x.code === 'onsetEarly' && x.metrics.offsetMs <= -120));
});

test('低覆盖分母单列，没有F0检出不冒充唱准', () => {
  const intermittent = analyzeRecording(join(synth({ seconds: 1.1 }), new Float32Array(SR * 1.9)), SR, DEFAULT);
  const compared = compareRecording(intermittent, reference, { alignmentTrusted: true });
  assert.equal(compared.comparison.score, null);
  assert.ok(compared.comparison.validComparisonRatio < 0.5);
  assert.ok(compared.comparison.performanceDetectedSec < 1.2);
  assert.ok(compared.comparison.eligibleReferenceSec > 2.5);
  assert.ok(compared.comparison.reasons.includes('insufficientCoverage'));
});

test('JSON 校验拒绝未知版本、非有限值、非单调帧、坏时间、伪造分数', () => {
  const cases = [
    (r) => { r.schemaVersion = 2; },
    (r) => { r.frames[0].rms = Infinity; },
    (r) => { r.frames[1].t = r.frames[0].t; },
    (r) => { r.segments[0].end = r.metadata.durationSec + 1; },
    (r) => { r.summary.score = 100; },
    (r) => { delete r.summary.robustRange; },
    (r) => { r.summary.robustRange.lowMidi = NaN; },
    (r) => { r.segments[0].medianMidi = 'malformed'; },
    (r) => { r.summary.stableRegions[0].clarity = 'malformed'; },
    (r) => { r.metadata.audioIdentity = { sha256: 'bad', byteLength: 10, name: 'test.wav' }; },
    (r) => { r.hypotheses = [{ id: 'fake', code: 'diagnosis', confidence: 'high', start: 0, end: 1, evidence: {}, alternatives: [], verificationKey: 'fake' }]; },
  ];
  for (const mutate of cases) { const report = structuredClone(sine); mutate(report); assert.equal(validateRecordingReport(report).valid, false); }
  const fake = compareRecording(sine, reference);
  fake.comparison.score = 100;
  assert.equal(validateRecordingReport(fake).valid, false);
  const audioIdentity = structuredClone(sine);
  const sha256 = 'ab'.repeat(32);
  audioIdentity.metadata.audioIdentity = { sha256, byteLength: 1234, name: 'synthetic.wav' };
  audioIdentity.metadata.sourceHash = sha256;
  assert.equal(validateRecordingReport(audioIdentity).valid, true);
  audioIdentity.metadata.sourceHash = 'cd'.repeat(32);
  assert.equal(validateRecordingReport(audioIdentity).valid, false);
});

test('输入边界有限诊断与进度', () => {
  assert.throws(() => analyzeRecording(new Float32Array([NaN]), SR), /non-finite/);
  assert.throws(() => analyzeRecording(sinePcm, 0), /sample rate/);
  assert.throws(() => analyzeRecording(sinePcm, SR, { frameSize: 123 }), /power of two/);
  assert.throws(() => analyzeRecording(sinePcm, SR, { frameSize: 2048.5 }), /power of two/);
  assert.throws(() => analyzeRecording(new Float32Array([9]), SR), /amplitude range/);
  const progress = [];
  analyzeRecording(new Float32Array(64), SR, { ...DEFAULT, onProgress: (p) => progress.push(p) });
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
});

test('Worker 进度/结果/错误带同一 jobId，参考 PCM 可复用', async () => {
  const previousSelf = globalThis.self;
  const messages = [];
  globalThis.self = { postMessage: (message) => messages.push(message) };
  try {
    await import('../js/recording-worker.js');
    self.onmessage({ data: { type: 'analyze', jobId: 'normal-job', pcm: sinePcm, sampleRate: SR, options: DEFAULT } });
    assert.ok(messages.every((x) => x.jobId === 'normal-job'));
    assert.equal(messages.at(-1).type, 'result');
    assert.equal(messages.at(-1).report.schemaVersion, 1);
    messages.length = 0;
    self.onmessage({ data: { type: 'analyze', jobId: 'reference-job', pcm: sinePcm, sampleRate: SR, options: { ...DEFAULT, autoOffset: true, alignmentTrusted: true }, reference: { pcm: synth({ midi: 57.05 }), sampleRate: SR, options: DEFAULT } } });
    assert.equal(messages.at(-1).type, 'result');
    assert.ok(messages.at(-1).report.comparison.score >= 95);
    assert.equal(messages.at(-1).report.comparison.alignmentEstimate, undefined);
    messages.length = 0;
    self.onmessage({ data: { type: 'analyze', jobId: 'offset-unavailable-job', pcm: sinePcm, sampleRate: SR, options: { ...DEFAULT, autoOffset: true, offsetSec: 1 }, reference } });
    assert.equal(messages.at(-1).type, 'result');
    assert.equal(messages.at(-1).report.comparison.offsetSec, 0);
    assert.equal(messages.at(-1).report.comparison.alignmentEstimate.status, 'unavailable');
    assert.equal(messages.at(-1).report.comparison.score, null);
    messages.length = 0;
    self.onmessage({ data: { type: 'analyze', jobId: 'invalid-job' } });
    assert.deepEqual(messages.map((x) => x.type), ['error']);
    assert.equal(messages[0].jobId, 'invalid-job');
  } finally { globalThis.self = previousSelf; }
});
