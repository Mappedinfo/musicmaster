import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, verifyAlignment, main } from './analyze.mjs';
import { validateRecordingReport } from '../../js/recording-analysis.js';
import { renderReport } from './report.mjs';

test('CLI rejects ambiguous inputs and non-finite settings', () => {
  assert.equal(parseArgs(['take.wav']).inputKind, 'mixed');
  assert.equal(parseArgs(['take.wav', '--offset', '-2']).offsetProvided, true);
  for (const args of [[], ['a.wav', 'b.wav'], ['a.wav', '--offset', 'NaN'], ['a.wav', '--offset','1201'], ['a.wav', '--transpose', '25'], ['a.wav', '--input-kind', 'unknown'], ['a.wav', '--alignment-evidence', 'anchors.json'], ['a.wav','--input-kind','vocal','--reuse-separated','x']]) assert.throws(() => parseArgs(args));
});

test('alignment evidence checks offset sign, independent anchors, span, and residual', () => {
  const data = { method:'public-phrase', verified:true, notes:'synthetic test anchors', anchors:[0,30,60].map(t=>({performanceSec:t,referenceSec:t+4})) };
  assert.equal(verifyAlignment(data, 4).trusted, true);
  assert.equal(verifyAlignment(data, -4).trusted, false);
  assert.equal(verifyAlignment({...data,verified:false},4).trusted,false);
  assert.equal(verifyAlignment({...data,anchors:data.anchors.slice(0,2)},4).trusted,false);
  assert.equal(verifyAlignment({...data,anchors:[data.anchors[0],data.anchors[0],data.anchors[2]]},4).trusted,false);
  assert.equal(verifyAlignment({...data,anchors:[{performanceSec:0,referenceSec:4},{performanceSec:5,referenceSec:9},{performanceSec:10,referenceSec:14}]},4).trusted,false);
  assert.equal(verifyAlignment({...data,anchors:[...data.anchors.slice(0,2),{performanceSec:60,referenceSec:64.3}]},4).trusted,false);
  assert.equal(verifyAlignment({...data,notes:7},4).trusted,false);
  assert.equal(verifyAlignment({...data,anchors:[null,null,null]},4).trusted,false);
  assert.equal(verifyAlignment(data,NaN).trusted,false);
});

test('vocal CLI produces a valid private self-contained report with real audio identity', async () => {
  const dir = path.resolve('stems/private/test-cli-' + Date.now());
  await fs.mkdir(dir, {recursive:true});
  const input = path.join(dir,'synthetic.wav');
  const ffmpeg = spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=220:duration=4','-y',input]);
  assert.equal(ffmpeg.status,0,ffmpeg.stderr.toString());
  const {out, report} = await main([input,'--input-kind','vocal','--out',path.join(dir,'report'),'--label','测试 </script><img src=x onerror=alert(1)>']);
  assert.equal(validateRecordingReport(report).valid,true);
  assert.equal(report.metadata.sourceKind,'vocal');
  assert.match(report.metadata.audioIdentity.sha256,/^[a-f0-9]{64}$/);
  assert.ok(report.metadata.audioIdentity.byteLength>1000);
  assert.equal(report.metadata.sourceHash,report.metadata.audioIdentity.sha256);
  assert.equal(report.comparison,undefined);
  const html=await fs.readFile(path.join(out,'report.html'),'utf8');
  assert.ok(html.includes('未评分'));
  assert.ok(html.includes('可测到的观察'));
  assert.ok(html.includes('需要验证的声乐假设'));
  assert.ok(html.includes('src="performance-vocals.wav"'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script src='));
  assert.ok(html.includes('\\u003c/script'));
  const audio=await fs.stat(path.join(out,report.metadata.audioIdentity.name));
  assert.equal(audio.size,report.metadata.audioIdentity.byteLength);
  await assert.rejects(main([input,'--reference',input,'--input-kind','vocal']),/不能用自己/);
  await assert.rejects(main([input,'--input-kind','vocal','--out',path.resolve('public/private-report')]),/stems\/private/);
  await assert.rejects(main([input,'--input-kind','vocal','--out',out]),/已有报告/);
  // 模拟已存在的私有分离 run，验证离线复算只用旧 WAV，且核验原件/衍生文件身份。
  const prior=path.join(dir,'prior'),stem=path.join(prior,'performance/separated/htdemucs/take');
  await fs.mkdir(stem,{recursive:true});
  await fs.copyFile(path.join(out,report.metadata.audioIdentity.name),path.join(stem,'vocals.wav'));
  await fs.copyFile(path.join(out,'analysis.json'),path.join(prior,'analysis.json'));
  await fs.copyFile(path.join(out,'provenance.json'),path.join(prior,'provenance.json'));
  const recomputed=await main([input,'--offline','--reuse-separated',prior,'--out',path.join(dir,'recomputed')]);
  assert.equal(recomputed.report.metadata.sourceKind,'separated');
  assert.equal(recomputed.report.metadata.audioIdentity.sha256,report.metadata.audioIdentity.sha256);
  await assert.rejects(fs.access(path.join(recomputed.out,'model-prepare.log')));
  await assert.rejects(fs.access(path.join(recomputed.out,'performance-separation.log')));
  await fs.appendFile(path.join(stem,'vocals.wav'),'corrupted');
  await assert.rejects(main([input,'--offline','--reuse-separated',prior,'--out',path.join(dir,'corrupt')]),/人声身份不匹配/);
});

test('HTML tolerates silent reports and labels hypotheses as uncertain with verification', () => {
  const report={version:1,metadata:{label:'测试',durationSec:1,sourceKind:'vocal'},quality:{status:'insufficient',effectiveVoicedSec:0,reasons:['noVoice']},frames:[],segments:[],issues:[],summary:{},hypotheses:[{code:'pressedPhonation',confidence:'low',start:0,end:1,evidence:{highRegionCount:2},alternatives:['vowelChange','volumeChange'],verificationKey:'recording.verify.pressedPhonation'}]};
  const html=renderReport(report,{audioUrl:'take.wav'});
  assert.ok(html.includes('可能存在偏紧的发声'));
  assert.ok(html.includes('可信度：低'));
  assert.ok(html.includes('元音变化；音量变化'));
  assert.ok(html.includes('验证练习'));
  assert.ok(html.includes('轻柔的唇颤音'));
});

test('priority report preserves all observations but shows at most 3 reliable longer candidates first', () => {
  const base={schemaVersion:1,metadata:{label:'测试',durationSec:60,sourceKind:'vocal'},quality:{status:'ok',effectiveVoicedSec:40,reasons:[]},frames:[],segments:[],summary:{},hypotheses:[]};
  const issues=[0.5,2,3,1,4].map((seconds,i)=>({code:'pitchFlat',start:i*10,end:i*10+5,severity:'notice',metrics:{comparedSec:seconds}}));
  const html=renderReport({...base,issues},{audioUrl:'take.wav'}), priority=html.split('id="priority"')[1].split('</section>')[0];
  assert.equal((priority.match(/<article>/g)||[]).length,3);
  assert.ok(!priority.includes('回听 0.0–5.0 秒'));
  assert.ok(priority.indexOf('回听 40.0–45.0 秒')<priority.indexOf('回听 20.0–25.0 秒'));
  assert.ok(priority.includes('建议练习'));
  assert.ok(html.includes('全部 5 项'));
  assert.ok(html.indexOf('先看数据质量')<html.indexOf('优先回听与练习'));
  assert.ok(html.indexOf('需要验证的声乐假设')<html.indexOf('回听、曲线与乐句'));
  assert.ok(html.indexOf('回听、曲线与乐句')<html.indexOf('完整统计与全部观察'));
});
