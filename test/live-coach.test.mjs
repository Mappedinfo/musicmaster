import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveSingingCoach } from '../js/live-coach.js';

const frame = (t, overrides = {}) => ({ t, midi: 60, level: 0.1, clarity: 0.99, voiced: true, ...overrides });
const evaluation = (cents = 0, ref = 60) => ({ ref, cents, hit: Math.abs(cents) <= 50, octave: Math.abs(cents) >= 1100 });
function run(coach, start, end, make = (t) => [frame(t), evaluation()], step = 0.05) {
  const states = [];
  for (let t = start; t <= end + 1e-9; t += step) states.push(coach.feed(...make(Number(t.toFixed(4)))));
  return states;
}

test('稳定准音给正向提示，vars/sinceSec有明确口径且返回值不可污染内部状态', () => {
  const coach = new LiveSingingCoach();
  assert.deepEqual(coach.reset(), { code: 'idle', vars: {}, tone: 'neutral', sinceSec: 0 });
  const states = run(coach, 0, 2, (t) => [frame(t), evaluation(8)]);
  assert.equal(states.at(-1).code, 'onPitch');
  assert.equal(states.at(-1).tone, 'positive');
  assert.equal(states.at(-1).vars.n, 8);
  assert.ok(states.at(-1).sinceSec >= 0.9);
  const since = states.at(-1).sinceSec;
  states.at(-1).vars.n = 999;
  assert.equal(coach.feed(frame(2.05), evaluation(8)).vars.n, 8);
  assert.equal(coach.feed(frame(2.1), evaluation(8)).sinceSec, since);
});

test('持续偏高/偏低给方向提示，短毛刺和正常颤音不触发错误', () => {
  for (const [cents, code] of [[80, 'sharp'], [-80, 'flat']]) {
    const coach = new LiveSingingCoach();
    const states = run(coach, 0, 2, (t) => [frame(t, { midi: 60 + cents / 100 }), evaluation(cents)]);
    assert.equal(states.at(-1).code, code);
    assert.equal(states.at(-1).vars.n, 80);
  }
  const coach = new LiveSingingCoach();
  run(coach, 0, 2);
  const pulse = run(coach, 2.05, 2.2, (t) => [frame(t), evaluation(95)]);
  const after = run(coach, 2.25, 3.5);
  assert.ok([...pulse, ...after].every((s) => !['sharp', 'flat'].includes(s.code)));
  const vibrato = run(new LiveSingingCoach(), 0, 3, (t) => {
    const cents = 55 * Math.sin(2 * Math.PI * 6 * t);
    return [frame(t, { midi: 60 + cents / 100 }), evaluation(cents)];
  });
  assert.ok(vibrato.every((s) => !['flat', 'sharp', 'tailDrop'].includes(s.code)));
});

test('八度差单列，1700音分不冒充整八度', () => {
  for (const [cents, code] of [[1205, 'octaveUp'], [-1190, 'octaveDown']]) {
    const states = run(new LiveSingingCoach(), 0, 2, (t) => [frame(t, { midi: 60 + cents / 100 }), evaluation(cents)]);
    assert.equal(states.at(-1).code, code);
    assert.equal(states.at(-1).vars.octaves, 1);
  }
  const state = run(new LiveSingingCoach(), 0, 2, (t) => [frame(t, { midi: 77 }), evaluation(1700)]).at(-1);
  assert.equal(state.code, 'sharp');
});

test('静音前奏只等待，有参考未开口才提示没检测到演唱，无参考唱出声另提示', () => {
  const silent = (t) => frame(t, { midi: null, level: 0, clarity: 0, voiced: false });
  const prelude = run(new LiveSingingCoach(), 0, 4, (t) => [silent(t), null]);
  assert.ok(prelude.every((s) => s.code === 'listening'));
  const missed = run(new LiveSingingCoach(), 0, 2, (t) => [silent(t), { ref: 60, cents: null, hit: false }]);
  assert.equal(missed.at(-1).code, 'noVoice');
  const noRef = run(new LiveSingingCoach(), 0, 2, (t) => [frame(t), null]);
  assert.equal(noRef.at(-1).code, 'noReference');
});

test('低清晰度、响声但没F0都不提示音高错误；质量丢失立即撤去旧错误', () => {
  const coach = new LiveSingingCoach();
  run(coach, 0, 2, (t) => [frame(t), evaluation(-90)]);
  assert.equal(coach.current.code, 'flat');
  const lost = coach.feed(frame(2.05, { clarity: 0.3 }), evaluation(-120));
  assert.equal(lost.code, 'uncertain');
  const states = run(coach, 2.1, 4, (t) => [frame(t, { clarity: 0.3 }), evaluation(-120)]);
  assert.ok(states.every((s) => s.code === 'uncertain'));
  const noise = run(new LiveSingingCoach(), 0, 2, (t) => [frame(t, { midi: null, voiced: false, clarity: 0 }), evaluation()]);
  assert.equal(noise.at(-1).code, 'uncertain');
  const paused = new LiveSingingCoach();
  run(paused, 0, 2, (t) => [frame(t), evaluation(-90)]);
  assert.equal(paused.feed(frame(2, { clarity: 0.3 }), evaluation(-120)).code, 'uncertain');
});

test('音高迟滞与最短显示避免阈值附近闪烁', () => {
  const coach = new LiveSingingCoach();
  run(coach, 0, 2, (t) => [frame(t), evaluation(60)]);
  const edge = run(coach, 2.05, 3.5, (t) => [frame(t), evaluation(Math.round(t * 20) % 2 ? 33 : 41)]);
  assert.ok(edge.every((s) => s.code === 'sharp'));
  const corrected = run(coach, 3.55, 5.5, (t) => [frame(t), evaluation(10)]);
  assert.equal(corrected.at(-1).code, 'onPitch');
  const switches = corrected.filter((s, i) => i && s.code !== corrected[i - 1].code);
  assert.ok(switches.every((s) => s.sinceSec >= 3.55));
});

test('较高RMS需要持续证据且有退出迟滞，不根据响亮推断挤嗓', () => {
  const coach = new LiveSingingCoach();
  run(coach, 0, 2);
  const pulse = run(coach, 2.05, 2.15, (t) => [frame(t, { level: 0.65 }), evaluation()]);
  assert.ok(pulse.every((s) => s.code !== 'tooLoud'));
  run(coach, 2.2, 2.5);
  const loud = run(coach, 2.55, 3.5, (t) => [frame(t, { level: 0.65 }), evaluation()]);
  assert.equal(loud.at(-1).code, 'tooLoud');
  const edge = run(coach, 3.55, 4.5, (t) => [frame(t, { level: 0.4 }), evaluation()]);
  assert.ok(edge.every((s) => s.code === 'tooLoud'));
  assert.equal(run(coach, 4.55, 6, (t) => [frame(t, { level: 0.1 }), evaluation()]).at(-1).code, 'onPitch');
});

test('时间回退、大跳转复位，重复时间与稀疏样本不积累证据', () => {
  const coach = new LiveSingingCoach();
  run(coach, 0, 2, (t) => [frame(t), evaluation(-80)]);
  assert.equal(coach.feed(frame(0.2), evaluation(-80)).code, 'listening');
  assert.equal(coach.feed(frame(25), evaluation(90)).code, 'listening');
  const repeated = coach.feed(frame(25), evaluation(90));
  assert.equal(repeated.code, 'listening');
  const sparse = new LiveSingingCoach();
  const first = sparse.feed(frame(0), evaluation(90));
  const second = sparse.feed(frame(0.6), evaluation(90));
  assert.equal(first.code, 'listening');
  assert.equal(second.code, 'listening');
  assert.equal(sparse.feed(frame(NaN), evaluation()).code, 'listening');
});

test('持续音收弱只报强度变化，动态旋律/滑音/休止不误报尾音', () => {
  const falling = (t, midi = 60, ref = 60) => [frame(t, { midi, level: 0.22 * 10 ** (-Math.min(t, 3) * 7 / 20) }), evaluation((midi - ref) * 100, ref)];
  const held = run(new LiveSingingCoach(), 0, 3, (t) => falling(t));
  assert.ok(held.some((s) => s.code === 'tailDrop'), JSON.stringify(held.at(-1)));
  assert.ok(held.find((s) => s.code === 'tailDrop').vars.dropDb >= 7);
  const melody = run(new LiveSingingCoach(), 0, 4, (t) => falling(t, 60 + Math.floor(t / 0.45) * 2, 60 + Math.floor(t / 0.45) * 2));
  const glide = run(new LiveSingingCoach(), 0, 4, (t) => falling(t, 60 + t * 2, 60 + t * 2));
  assert.ok([...melody, ...glide].every((s) => s.code !== 'tailDrop'));
  const coach = new LiveSingingCoach();
  run(coach, 0, 3, (t) => falling(t));
  const rest = coach.feed(frame(3.05, { midi: null, level: 0, clarity: 0, voiced: false }), null);
  assert.equal(rest.code, 'listening');
});

test('构造参数有界诊断', () => {
  assert.throws(() => new LiveSingingCoach({ minClarity: NaN }), /option/);
  assert.throws(() => new LiveSingingCoach({ minClarity: 2 }), /threshold/);
  assert.throws(() => new LiveSingingCoach({ minEvidenceFrames: 1 }), /threshold/);
});
