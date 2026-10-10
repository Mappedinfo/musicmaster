#!/usr/bin/env node
/** 全本地录音报告 CLI。计算复用网页内核；私有输出默认留在 stems/private。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { renderReport } from './report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRIVATE = path.join(ROOT, 'stems/private');
const CACHE = path.join(ROOT, 'stems/.model-cache');
const help = `本地录音分析（不会上传音频）
node tools/vocal-analysis/analyze.mjs INPUT [选项]
  --input-kind mixed|vocal   默认 mixed，先分离人声；vocal 是已准备的干声
  --reference FILE          可选独立参考录音，默认也先分离
  --reference-kind mixed|vocal
  --offset SECONDS           固定对齐：参考时间 = 演唱时间 + offset（默认自动估计，或未验证的 0）
  --transpose SEMITONES      参考音高加此半音数（默认 0）
  --alignment-evidence FILE  人工核验锚点 JSON；无自动可信证据时需要
  --out DIR                  默认 stems/private/<时间戳>；仅允许此私有目录内
  --offline                  依赖/模型已缓存后严格离线，不准备或下载
  --reuse-separated DIR      核验上一私有 run 的来源身份后，复用分离 WAV 重算
  --python FILE              指定已有 Demucs Python 解释器
  --model NAME               默认 htdemucs
  --device cpu|mps|cuda       默认 cpu
  --label TEXT               本地报告标题（默认 我的录音）
  --help
首次联网只用于依赖/模型准备，推理子进程始终 HF_HUB_OFFLINE=1。
无独立参考、对齐未验证或来源不可靠时，音准评分为空。`;

export function parseArgs(argv) {
  const opts = { inputKind: 'mixed', referenceKind: 'mixed', offset: 0, transpose: 0,
    model: 'htdemucs', device: 'cpu', label: '我的录音', offline: false };
  const keys = { '--input-kind': 'inputKind', '--reference-kind': 'referenceKind', '--reference': 'reference',
    '--offset': 'offset', '--transpose': 'transpose', '--alignment-evidence': 'evidence', '--out': 'out',
    '--python': 'python', '--model': 'model', '--device': 'device', '--label': 'label', '--reuse-separated': 'reuse' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--offline') { opts.offline = true; continue; }
    if (keys[arg]) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${arg} 缺少值`);
      opts[keys[arg]] = argv[++i];
      if (arg === '--offset') opts.offsetProvided = true;
    } else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`);
    else if (opts.input) throw new Error('只能指定一份演唱录音；参考使用 --reference');
    else opts.input = arg;
  }
  if (opts.help) return opts;
  if (!opts.input) throw new Error('缺少输入录音');
  if (opts.evidence && !opts.reference) throw new Error('--alignment-evidence 需要独立参考录音');
  if (opts.reuse && opts.inputKind !== 'mixed') throw new Error('--reuse-separated 只用于已分离的 mixed 输入');
  for (const k of ['inputKind', 'referenceKind']) if (!['mixed', 'vocal'].includes(opts[k])) throw new Error(`${k} 必须是 mixed 或 vocal`);
  if (!['cpu', 'mps', 'cuda'].includes(opts.device)) throw new Error('device 必须是 cpu、mps 或 cuda');
  for (const k of ['offset', 'transpose']) { opts[k] = Number(opts[k]); if (!Number.isFinite(opts[k])) throw new Error(`${k} 必须是有限数值`); }
  if (Math.abs(opts.offset) > 1200) throw new Error('offset 范围为 -1200 到 1200 秒');
  if (Math.abs(opts.transpose) > 24) throw new Error('transpose 范围为 -24 到 24 半音');
  return opts;
}

export function verifyAlignment(data, offset) {
  const errors = [];
  if (!Number.isFinite(offset) || Math.abs(offset)>1200) errors.push('固定 offset 必须是 -1200 到 1200 的有限秒数');
  if (!data || typeof data !== 'object' || !['accompaniment', 'public-phrase'].includes(data.method)) errors.push('method 需要 accompaniment 或 public-phrase');
  if (data?.verified !== true || typeof data?.notes !== 'string' || !data.notes.trim() || data.notes.length>10000) errors.push('需要 verified:true 与不超过 10000 字的 notes 核验说明');
  const anchors = data?.anchors;
  if (!Array.isArray(anchors) || anchors.length < 3 || anchors.length > 100) errors.push('需要 3 到 100 个独立锚点');
  else {
    const times = [];
    for (const a of anchors) {
      if (!a || typeof a!=='object' || Array.isArray(a) || !Number.isFinite(a.performanceSec) || !Number.isFinite(a.referenceSec) || a.performanceSec < 0 || a.referenceSec < 0) { errors.push('锚点时间必须为非负有限数值'); continue; }
      if (Math.abs(a.referenceSec - a.performanceSec - offset) > 0.25) errors.push('锚点与固定 offset 偏差超过 250ms，不可按整曲长度拉伸');
      times.push(a.performanceSec);
    }
    if (times.length !== anchors.length || Math.max(...times) - Math.min(...times) < 30) errors.push('有效锚点须覆盖至少 30 秒');
    if (new Set(times).size !== times.length) errors.push('锚点不能重复');
  }
  return { trusted: errors.length === 0, errors };
}

async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function identity(file) {
  const bytes = await fs.readFile(file);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, name: path.basename(file) };
}

async function run(command, args, logFile, env = {}, capture = false) {
  const handle = await fs.open(logFile, 'a');
  await handle.write(`\n${new Date().toISOString()} ${JSON.stringify([command, ...args])}\n`);
  return await new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const proc = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', b => { if (capture) { size += b.length; if (size > 512 * 1024 * 1024) proc.kill(); else chunks.push(b); } else handle.write(b); });
    proc.stderr.on('data', b => handle.write(b));
    proc.on('error', async err => { await handle.close(); reject(err); });
    proc.on('close', async code => { await handle.close(); if (code !== 0) reject(new Error(`${path.basename(command)} 退出码 ${code}；详见 ${logFile}`)); else resolve(capture ? Buffer.concat(chunks) : undefined); });
  });
}

async function prepare(opts, out) {
  const python = opts.python ? path.resolve(opts.python) : path.join(CACHE, 'venv/bin/python');
  const env = { UV_CACHE_DIR: path.join(CACHE, 'uv'), TORCH_HOME: CACHE,
    HF_HOME: path.join(CACHE, 'huggingface'), HF_HUB_CACHE: path.join(CACHE, 'huggingface/hub') };
  let dependenciesReady = false;
  if (await exists(python)) {
    try { await run(python, ['-c', 'import demucs, torch, numpy, sphn; print(torch.__version__)'], path.join(out, 'dependencies.log'), env); dependenciesReady = true; } catch { /* 有界恢复：同一私有环境补齐依赖。 */ }
  }
  if (!dependenciesReady) {
    if (opts.offline || opts.python) throw new Error('缺少 Demucs Python 环境；先联网准备依赖');
    console.log('准备私有依赖缓存……');
    if (!await exists(python)) await run('uv', ['venv', '--python', '3.11', path.join(CACHE, 'venv')], path.join(out, 'dependencies.log'), env);
    await run('uv', ['pip', 'install', '--python', python, '-r', 'tools/stem-separation/requirements.txt'], path.join(out, 'dependencies.log'), env);
  }
  if (!opts.offline) {
    console.log('准备并验证本地模型缓存……');
    await run(python, ['tools/stem-separation/separate.py', '--prepare-model', '--model', opts.model, '--cache-dir', CACHE], path.join(out, 'model-prepare.log'), env);
  }
  return { python, env: { ...env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } };
}

async function findStem(dir, stem = 'vocals.wav') {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === stem) return p;
    if (entry.isDirectory()) { const found = await findStem(p, stem); if (found) return found; }
  }
}

async function audioForAnalysis(input, kind, role, opts, out, prepared) {
  if (kind === 'mixed') {
    if (opts.reuse) {
      const dir = path.join(opts.reuse, role, 'separated');
      const vocal = await findStem(dir);
      if (!vocal) throw new Error('旧 run 缺少 ' + role + ' vocals.wav');
      const oldReport = JSON.parse(await fs.readFile(path.join(opts.reuse,role==='performance'?'analysis.json':'reference-analysis.json'),'utf8'));
      const current = await identity(vocal), recorded = oldReport.metadata?.audioIdentity;
      if (!recorded || recorded.sha256!==current.sha256 || recorded.byteLength!==current.byteLength) throw new Error('旧 run 的 '+role+' 人声身份不匹配，不能复用');
      return { file: vocal, accompaniment: await findStem(dir, 'no_vocals.wav'), sourceKind: 'separated' };
    }
    console.log(`离线分离${role === 'performance' ? '演唱' : '参考'}人声……`);
    const dir = path.join(out, role, 'separated');
    await run(prepared.python, ['tools/stem-separation/separate.py', input, '--offline', '--cache-dir', CACHE,
      '--model', opts.model, '--device', opts.device, '--shifts', '0', '--two-stems', 'vocals', '--out', dir], path.join(out, `${role}-separation.log`), prepared.env);
    const vocal = await findStem(dir);
    if (!vocal) throw new Error('分离退出成功但没有找到 vocals.wav');
    return { file: vocal, accompaniment: await findStem(dir, 'no_vocals.wav'), sourceKind: 'separated' };
  }
  // 本地副本方便 file:// 报告回听；原文件保持不变，仅写入私有输出目录。
  const file = path.join(out, `${role}-vocals.wav`);
  await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-c:a', 'pcm_s16le', file], path.join(out, 'decode.log'));
  return { file, sourceKind: 'vocal' };
}

async function decode(file, out) {
  const bytes = await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', file,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], path.join(out, 'decode.log'), {}, true);
  if (bytes.byteLength % 4 || bytes.byteLength < 4) throw new Error('音频解码结果为空或 PCM 长度不合法');
  if (bytes.byteLength / 4 > 16000 * 60 * 20) throw new Error('最多分析 20 分钟音频');
  const pcm = new Float32Array(bytes.byteLength / 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = bytes.readFloatLE(i * 4);
  return pcm;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { console.log(help); return; }
  const input = await fs.realpath(path.resolve(opts.input));
  const reference = opts.reference ? await fs.realpath(path.resolve(opts.reference)) : null;
  const inputId = await identity(input);
  const referenceId = reference ? await identity(reference) : null;
  if (referenceId?.sha256 === inputId.sha256) throw new Error('参考与演唱是同一文件，不能用自己给自己评分');
  let reuseValidation = null;
  if (opts.reuse) {
    opts.reuse = await fs.realpath(path.resolve(opts.reuse));
    if (!opts.reuse.startsWith((await fs.realpath(PRIVATE)) + path.sep)) throw new Error('复用目录必须位于 stems/private/ 内');
    const previous = JSON.parse(await fs.readFile(path.join(opts.reuse,'provenance.json'),'utf8'));
    if (previous.inputIdentity?.sha256 !== inputId.sha256) throw new Error('旧 run 的演唱原件身份不匹配');
    if (reference) {
      if (previous.referenceIdentity) {
        if (previous.referenceIdentity.sha256 !== referenceId.sha256) throw new Error('旧 run 的参考原件身份不匹配');
        reuseValidation = '演唱与参考原件 SHA-256 已核验';
      } else {
        // 兼容本轮初版 run：仅允许相同参考路径且文件在该 run 创建后未改动。
        const stat = await fs.stat(reference), created = Date.parse(previous.createdAt);
        if (previous.reference !== reference || !Number.isFinite(created) || stat.mtimeMs > created) throw new Error('旧 run 没有可核验的参考身份，需要重新提供可靠来源');
        reuseValidation = '演唱 SHA-256 已核验；旧版参考以相同真实路径及未改动时间核验';
      }
    } else reuseValidation = '演唱原件 SHA-256 已核验';
  }
  const out = path.resolve(opts.out ?? path.join(PRIVATE, new Date().toISOString().replace(/[:.]/g, '-') + '-' + inputId.sha256.slice(0, 8)));
  if (!out.startsWith(PRIVATE + path.sep)) throw new Error('--out 必须位于 stems/private/ 内，以免私人报告被构建或提交');
  await fs.mkdir(out, { recursive: true });
  if (!(await fs.realpath(out)).startsWith((await fs.realpath(PRIVATE)) + path.sep)) throw new Error('输出目录符号链接指向了私有目录之外');
  if (await exists(path.join(out, 'analysis.json'))) throw new Error('该输出目录已有报告；请换一个 run-id，避免覆盖');
  await fs.writeFile(path.join(out, 'provenance.json'), JSON.stringify({ createdAt: new Date().toISOString(), input, inputIdentity: inputId, reference, referenceIdentity:referenceId, reuseValidation,
    settings: opts, network: 'Only dependency/model preparation; audio inference uses explicit offline flags' }, null, 2));
  let evidence = null, trusted = false;
  if (opts.evidence) {
    evidence = JSON.parse(await fs.readFile(opts.evidence, 'utf8'));
    const check = verifyAlignment(evidence, opts.offset);
    if (!check.trusted) throw new Error('参考对齐证据未通过：' + check.errors.join('；'));
    trusted = true;
  }
  const prepared = !opts.reuse && (opts.inputKind === 'mixed' || (reference && opts.referenceKind === 'mixed')) ? await prepare(opts, out) : null;
  const audio = await audioForAnalysis(input, opts.inputKind, 'performance', opts, out, prepared);
  const { analyzeRecording, compareRecording, validateRecordingReport } = await import('../../js/recording-analysis.js');
  console.log('计算录音观察与声乐假设……');
  const audioIdentity = await identity(audio.file);
  let report = analyzeRecording(await decode(audio.file, out), 16000, { label: opts.label, sourceKind: audio.sourceKind, sourceHash: audioIdentity.sha256 });
  report.metadata = { ...report.metadata, audioIdentity };
  let referenceAudio = null;
  if (reference) {
    referenceAudio = await audioForAnalysis(reference, opts.referenceKind, 'reference', opts, out, prepared);
    const refIdentity = await identity(referenceAudio.file);
    const ref = analyzeRecording(await decode(referenceAudio.file, out), 16000, { label: '独立参考', sourceKind: referenceAudio.sourceKind, sourceHash: refIdentity.sha256 });
    ref.metadata = { ...ref.metadata, audioIdentity: refIdentity };
    if (ref.metadata.audioIdentity.sha256 === report.metadata.audioIdentity.sha256) throw new Error('实际分析的演唱与参考人声相同，不能自评分');
    if (!opts.offsetProvided && !opts.evidence && audio.accompaniment && referenceAudio.accompaniment) {
      console.log('核验伴奏内容和固定时间偏移……');
      const { estimateFixedOffset } = await import('./align.mjs');
      evidence = estimateFixedOffset(await decode(audio.accompaniment, out), await decode(referenceAudio.accompaniment, out), 16000);
      opts.offset = evidence.offsetSec;
      trusted = evidence.alignmentTrusted === true && verifyAlignment(evidence, opts.offset).trusted;
    }
    report = compareRecording(report, ref, { offsetSec: opts.offset, transposeSemitones: opts.transpose, alignmentTrusted: trusted });
    await fs.writeFile(path.join(out, 'reference-analysis.json'), JSON.stringify(ref));
  }
  const validation = validateRecordingReport(report);
  if (!validation.valid) throw new Error('分析结果校验失败：' + validation.errors.join('；'));
  await fs.writeFile(path.join(out, 'analysis.json'), JSON.stringify(report));
  if (evidence) await fs.writeFile(path.join(out, 'alignment-evidence.json'), JSON.stringify(evidence, null, 2));
  const relative = f => path.relative(out, f).split(path.sep).map(encodeURIComponent).join('/');
  await fs.writeFile(path.join(out, 'report.html'), renderReport(report, { audioUrl: relative(audio.file), referenceUrl: referenceAudio ? relative(referenceAudio.file) : null, alignmentEvidence:evidence }));
  console.log(`已生成本地报告：${path.join(out, 'report.html')}`);
  console.log(`有效有声音频 ${report.quality.effectiveVoicedSec?.toFixed(1) ?? '—'} 秒；质量 ${report.quality.status}；音准分 ${report.comparison?.score ?? '未评分'}`);
  return { out, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error('错误：' + err.message); process.exitCode = 1; });
}
