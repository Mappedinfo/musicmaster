import test from 'node:test';
import assert from 'node:assert/strict';
import { KaraokeSessionController } from '../js/karaoke-sessions.js';
import { analyzeRecording, compareRecording, validateRecordingReport } from '../js/recording-analysis.js';
import { applyRecordingCapture } from '../js/recording-capture.js';
import { encodePcmWav, TakeBuffer } from '../js/karaoke-recording.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const tone = frequency => Float32Array.from({ length: 48000 }, (_, index) => .3 * Math.sin(2 * Math.PI * frequency * index / 16000));
function fakeStore() {
  const values = new Map();
  return { values, putSession: async session => { values.set(session.id, { ...session }); }, getSession: async id => values.get(id),
    listSessions: async () => [...values.values()], deleteSession: async id => values.delete(id), updateSessionReport: async () => {} };
}
function controller(store, player = {}) {
  globalThis.window = new EventTarget();
  return new KaraokeSessionController({ store, player, getContext: () => ({ songName: 'synthetic', sourceKind: 'vocal' }) });
}
test('不完整采集在重新分析后仍撤回原因推断与可信比较分，报告可导入', () => {
  const vocal = analyzeRecording(tone(440), 16000, { sourceKind: 'vocal', sourceHash: 'a'.repeat(64) });
  const reference = analyzeRecording(tone(442), 16000, { sourceKind: 'vocal', sourceHash: 'b'.repeat(64) });
  const report = compareRecording(vocal, reference, { alignmentTrusted: true });
  assert.equal(report.comparison.status, 'ready');
  applyRecordingCapture(report, { incomplete: true, flushFailed: false });
  applyRecordingCapture(report, { incomplete: true, flushFailed: false });
  assert.equal(report.quality.status, 'limited'); assert.deepEqual(report.hypotheses, []);
  assert.equal(report.comparison.score, null); assert.equal(report.comparison.alignmentTrusted, false);
  assert.equal(report.comparison.status, 'rejected'); assert.equal(report.comparison.intervalComparison, null);
  assert.equal(report.quality.reasons.filter(reason => reason === 'captureIncomplete').length, 1);
  assert.ok(validateRecordingReport(report).valid);
});
test('并发开始只有一次采集与一个会话身份', async () => {
  const gate = deferred(); let calls = 0;
  const sessions = controller(fakeStore(), { beginTake: async () => { calls++; await gate.promise; } });
  const first = sessions.begin(), second = sessions.begin(); await tick();
  assert.equal(calls, 1); gate.resolve(); await Promise.all([first, second]);
  assert.ok(sessions.active?.id); assert.equal(calls, 1);
});
test('初始化期间换歌/重唱/关闭录音先等begin再封存，下一begin等待旧finish也不互等', async () => {
  for (const reason of ['songChanged', 'restart', 'recordingDisabled']) {
    const beginGate = deferred(), finishGate = deferred(), finishBegan = deferred();
    let starts = 0, finishes = 0, finishReason = null, take = null;
    const player = {
      get takeActive() { return !!take; },
      async beginTake() { starts++; if (starts === 1) await beginGate.promise; take = new TakeBuffer(); take.append(tone(440).subarray(0,1600), { segmentId: 'capture', songStartSec: 0 }); },
      async finishTake(value) { finishes++; finishReason = value; finishBegan.resolve(); await finishGate.promise; const result = await take.finish(value); take = null; return result; },
    };
    const store = fakeStore(), sessions = controller(store, player);
    sessions.analyze = async () => {}; // 共用分析内核单独覆盖；这里验证连续录音封存与保存生命周期。
    const firstBegin = sessions.begin();
    const finishing = sessions.finish({ reason });
    assert.equal(sessions.finish({ reason: 'duplicate' }), finishing);
    assert.equal(finishes, 0); assert.equal(sessions.active, null);
    beginGate.resolve(); await firstBegin; await finishBegan.promise;
    assert.equal(finishes, 1); assert.equal(finishReason, reason); assert.equal(sessions.active, null);
    if (reason === 'recordingDisabled') {
      finishGate.resolve(); await finishing;
      assert.equal(player.takeActive, false); assert.equal(sessions.active, null); assert.equal(starts, 1);
    } else {
      const nextBegin = sessions.begin();
      assert.equal(sessions.finishing, finishing);
      await tick(); assert.equal(starts, 1);
      finishGate.resolve();
      let timer;
      try { await Promise.race([Promise.all([finishing, nextBegin]), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('begin/finish deadlock')), 1000); })]); }
      finally { clearTimeout(timer); }
      assert.equal(starts, 2); assert.equal(finishes, 1); assert.equal(player.takeActive, true); assert.ok(sessions.active?.id);
    }
    assert.equal(store.values.size, 1);
    const saved = [...store.values.values()][0];
    assert.equal(saved.capture.finishReason, reason); assert.equal(saved.capture.reason, reason); assert.equal(saved.durationSec, .1);
    assert.equal(saved.audioBlob.type, 'audio/wav'); assert.equal(saved.audioBlob.size, 3244);
    assert.equal(sessions.finishing, null);
  }
});
test('旧保存期间同步排入新begin，再换歌/重唱/关闭录音会封存pending take且不互等', async () => {
  for (const reason of ['songChanged', 'restart', 'recordingDisabled']) {
    const gate = deferred(), store = fakeStore(); let starts = 0, finishes = 0, take = null;
    const player = {
      get takeActive() { return !!take; },
      async beginTake() { starts++; take = new TakeBuffer(); take.append(tone(440).subarray(0,1600), { segmentId: 'capture', songStartSec: starts }); },
      async finishTake(value) { finishes++; if (finishes === 1) await gate.promise; const result = await take.finish(value); take = null; return result; },
    };
    const sessions = controller(store, player); sessions.analyze = async () => {};
    await sessions.begin();
    const firstFinish = sessions.finish({ reason: 'first' }), nextBegin = sessions.begin();
    assert.equal(sessions.active, null); assert.ok(sessions.starting); assert.equal(starts, 1);
    const finalFinish = sessions.finish({ reason });
    assert.notEqual(finalFinish, firstFinish); assert.equal(sessions.finish({ reason: 'duplicate' }), finalFinish);
    gate.resolve(); let timer;
    try { await Promise.race([Promise.all([firstFinish, nextBegin, finalFinish]), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('pending begin/finish deadlock')), 1000); })]); }
    finally { clearTimeout(timer); }
    assert.equal(starts, 2); assert.equal(finishes, 2); assert.equal(sessions.active, null); assert.equal(player.takeActive, false); assert.equal(sessions.finishing, null);
    assert.deepEqual([...store.values.values()].map(session => session.capture.finishReason), ['first', reason]);
    for (const saved of store.values.values()) { assert.equal(saved.audioBlob.type, 'audio/wav'); assert.equal(saved.audioBlob.size, 3244); }
  }
});
test('begin拒绝后等待finish清理门闩，下一次可以录下并保存', async () => {
  const gate = deferred(), store = fakeStore(); let starts = 0, take = null;
  const player = {
    get takeActive() { return !!take; },
    async beginTake() { starts++; if (starts === 1) await gate.promise; take = new TakeBuffer(); take.append(tone(440).subarray(0,1600), { segmentId: 'retry', songStartSec: 0 }); },
    async finishTake(reason) { const result = await take.finish(reason); take = null; return result; },
  };
  const sessions = controller(store, player); sessions.analyze = async () => {};
  const initial = sessions.begin(), failed = assert.rejects(initial, /capture initialization/);
  const finishing = sessions.finish({ reason: 'recordingDisabled' });
  gate.reject(new Error('capture initialization')); await failed; assert.equal(await finishing, null);
  assert.equal(sessions.starting, null); assert.equal(sessions.finishing, null); assert.equal(sessions.active, null);
  await sessions.begin(); const result = await sessions.finish({ reason: 'songChanged' });
  assert.equal(result.persistent, true); assert.equal(result.audioBlob.size, 3244); assert.equal(store.values.size, 1);
  assert.equal(sessions.finishing, null); assert.equal(sessions.active, null); assert.equal(player.takeActive, false);
  assert.equal(await sessions.finish(), null); assert.equal(sessions.finishing, null);
});
test('保存不可用时刷新保留已生成的内存复盘状态', async () => {
  const store = fakeStore(); store.listSessions = async () => { throw { code: 'unsupported' }; };
  const sessions = controller(store); await tick();
  sessions.currentId = 'memory'; sessions.memory.set('memory', { id: 'memory', createdAt: new Date().toISOString(), status: 'ready', persistent: false });
  await sessions.refresh(); assert.equal(sessions.status, 'readyMemory'); assert.equal(sessions.sessions[0].persistent, false);
});
test('删除等待在途报告保存，避免未落盘标记导致刷新复活录音', async () => {
  const store = fakeStore(), gate = deferred(), began = deferred();
  store.putSession = async session => { began.resolve(); await gate.promise; store.values.set(session.id, { ...session }); };
  const sessions = controller(store); await tick();
  const audioBlob = encodePcmWav(tone(440));
  const bytes = await audioBlob.arrayBuffer(), digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const report = analyzeRecording(tone(440), 16000, { sourceKind: 'vocal', sourceHash: hash });
  const session = { id: 'race', createdAt: new Date().toISOString(), audioBlob, sourceKind: 'vocal', status: 'ready', durationSec: 3, persistent: false };
  sessions.memory.set(session.id, session);
  const writing = sessions.saveReview({ sessionId: 'race', report, sourceHash: hash }); await began.promise;
  let removed = false;
  const deleting = sessions.action('delete', 'race').then(() => { removed = true; }); await tick();
  assert.equal(removed, false); gate.resolve(); await Promise.all([writing, deleting]);
  assert.equal(removed, true); assert.equal(store.values.has('race'), false); assert.equal(sessions.memory.has('race'), false);
  await sessions.refresh(); assert.equal(sessions.sessions.length, 0);
});
test('已落盘音频的报告更新失败后，删除仍清除本机录音', async () => {
  const store = fakeStore(), sessions = controller(store); await tick();
  const session = { id: 'audio-only', createdAt: new Date().toISOString(), status: 'ready', persistent: false, audioPersistent: true };
  store.values.set(session.id, { ...session }); sessions.memory.set(session.id, session);
  await sessions.action('delete', session.id); assert.equal(store.values.has(session.id), false);
});
