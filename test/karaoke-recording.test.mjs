// 真实连续 PCM、WAV 与歌曲时间映射；模拟音频线程事件，不从检测帧生成录音。
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { StreamingResampler, TakeBuffer, KaraokeRecorder, encodePcmWav } from '../js/karaoke-recording.js';

const concat = chunks => { const out=new Float32Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out; };
const tone = (rate,sec=.37) => Float32Array.from({length:Math.round(rate*sec)},(_,i)=>.4*Math.sin(2*Math.PI*440*i/rate));
const code = name => error => error.code===name;

test('16k / 44.1k / 48k 任意音频块连续相位与实际 440Hz 波形',()=>{
  for(const rate of [16000,44100,48000]){
    const input=tone(rate),whole=new StreamingResampler(rate),split=new StreamingResampler(rate);
    const expected=concat([whole.process(input),whole.finish()]),chunks=[];
    for(let offset=0;offset<input.length;offset+=137)chunks.push(split.process(input.subarray(offset,offset+137)));
    chunks.push(split.finish());const actual=concat(chunks);
    assert.deepEqual(actual,expected);assert.equal(actual.length,Math.ceil(input.length/rate*16000));
    let crossings=0;for(let i=1;i<actual.length;i++)if(actual[i-1]<0&&actual[i]>=0)crossings++;
    assert.ok(Math.abs(crossings/.37-440)<4);assert.ok(actual.some(v=>v>.35));
  }
});

test('标准16-bit mono WAV保存实际采样并夹限',async()=>{
  const blob=encodePcmWav(Float32Array.of(-2,-.5,0,.5,2));const view=new DataView(await blob.arrayBuffer());
  assert.equal(blob.type,'audio/wav');assert.equal(blob.size,54);
  assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(34,true),16);assert.equal(view.getUint32(40,true),10);
  assert.deepEqual(Array.from({length:5},(_,i)=>view.getInt16(44+i*2,true)),[-32768,-16384,0,16383,32767]);
});

test('暂停墙钟不进入音频，歌曲起点/恢复映射封为独立区段',async()=>{
  const take=new TakeBuffer({startedAtSongSec:12});
  take.append(tone(16000,.25),{segmentId:'a',songStartSec:12.02,inputSampleRate:16000});
  take.append(tone(16000,.25),{segmentId:'a',songStartSec:12.27,inputSampleRate:16000});
  take.append(tone(16000,.1),{segmentId:'b',songStartSec:13,inputSampleRate:48000});
  const result=await take.finish('manual');assert.equal(result.durationSec,.6);assert.equal(result.pcm.length,9600);assert.equal(result.startedAtSongSec,12.02);
  assert.equal(result.capture.initialStartedAtSongSec,12);assert.equal(result.capture.segments.length,2);
  assert.equal(result.capture.segments[0].recordingEndSec,.5);assert.equal(result.capture.segments[1].recordingStartSec,.5);
  assert.equal(result.capture.segments[1].songStartSec,13);assert.equal(result.capture.reason,'manual');assert.equal(result.capture.incomplete,false);
});

test('硬上限截断真实PCM，空录音与非法时长不冒充保存',async()=>{
  const take=new TakeBuffer({maxDurationSec:.1});take.append(tone(16000,1),{segmentId:'a',songStartSec:0});
  const result=await take.finish();assert.equal(result.pcm.length,1600);assert.equal(result.durationSec,.1);assert.equal(result.capture.truncated,true);assert.equal(result.capture.reason,'durationLimit');
  assert.equal(await new TakeBuffer().finish(),null);
  for(const maxDurationSec of [0,1201,NaN,1e-8])assert.throws(()=>new TakeBuffer({maxDurationSec}),code('invalid'));
  assert.throws(()=>new StreamingResampler(0),code('invalid'));
});

test('长录音完成编码让出事件循环',async()=>{
  const take=new TakeBuffer();take.append(tone(16000,20),{segmentId:'a',songStartSec:0});
  let yielded=false;setTimeout(()=>{yielded=true;},0);const result=await take.finish();assert.equal(yielded,true);assert.equal(result.blob.size,44+320000*2);
});

async function worklet(){
  const messages=[];let Processor;
  class AudioWorkletProcessor{constructor(){this.port={onmessage:null,postMessage:message=>messages.push(message)};}}
  const context=vm.createContext({AudioWorkletProcessor,Float32Array,currentFrame:0,sampleRate:48000,registerProcessor:(name,P)=>{assert.equal(name,'karaoke-capture-processor');Processor=P;}});
  vm.runInContext(await readFile(new URL('../js/karaoke-capture-worklet.js',import.meta.url),'utf8'),context);
  return {p:new Processor(),messages,context};
}
test('worklet从每个128采样音频块采集全部PCM及尾块，无RAF，输出保持静音',async()=>{
  const {p,messages,context}=await worklet();const blocks=[];
  p.port.onmessage({data:{type:'start',segmentId:'a',maxInputSamples:10000}});
  for(let i=0;i<20;i++){
    context.currentFrame=i*128;const pcm=Float32Array.from({length:128},(_,j)=>(i*128+j)/3000),out=Float32Array.from({length:128},()=>1);
    p.process([[pcm]],[[out]]);assert.ok(out.every(v=>v===0));blocks.push(pcm);
  }
  p.port.onmessage({data:{type:'flush',requestId:7}});
  const packets=messages.filter(m=>m.type==='pcm');assert.deepEqual(packets.map(m=>m.pcm.length),[1024,1024,512]);assert.deepEqual(packets.map(m=>m.startFrame),[0,1024,2048]);
  assert.deepEqual(concat(packets.map(m=>m.pcm)),concat(blocks));assert.equal(messages.at(-1).type,'flushed');assert.equal(messages.at(-1).requestId,7);
  p.process([[new Float32Array(128)]],[[new Float32Array(128)]]);assert.equal(messages.length,4);
});

test('worklet本身硬停在限定采样数量，主线程挂起也不会超录',async()=>{
  const {p,messages,context}=await worklet();p.port.onmessage({data:{type:'start',segmentId:'limit',maxInputSamples:1000}});
  for(let i=0;i<30;i++){context.currentFrame=i*128;p.process([[new Float32Array(128).fill(.2)]],[[new Float32Array(128)]]);}
  assert.equal(messages.filter(m=>m.type==='pcm').reduce((n,m)=>n+m.pcm.length,0),1000);assert.equal(messages.filter(m=>m.type==='limit').length,1);
});

class FakeWorklet {
  constructor(context){this.context=context;this.messages=[];this.closed=false;this.port={onmessage:null,close:()=>{this.closed=true;},postMessage:message=>{
    this.messages.push(message);if(message.type==='start')this.segmentId=message.segmentId;
    if(message.type==='flush')queueMicrotask(()=>this.send({type:'flushed',requestId:message.requestId}));
  }};}
  connect(){} disconnect(){}
  send(data){this.port.onmessage?.({data});}
  pcm(pcm,startFrame){this.send({type:'pcm',pcm,startFrame,sampleRate:this.context.sampleRate,segmentId:this.segmentId});}
}
globalThis.AudioWorkletNode=FakeWorklet;
const ctx = (rate=16000,time=2) => ({sampleRate:rate,currentTime:time,audioWorklet:{addModule:async url=>{assert.ok(url.pathname.endsWith('karaoke-capture-worklet.js'));}},destination:{}});
const source = ()=>({connect(){},disconnect(){}});
test('begin等待playing，暂停/重新连接麦克风保护已录，finish只执行一次',async()=>{
  let song=8;const recorder=new KaraokeRecorder({getSongTime:()=>song});const context=ctx();await recorder.attach(context,source());recorder.begin();
  assert.equal(recorder.takeState,'paused');assert.equal(recorder.node.messages.length,0);
  await recorder.resume();assert.equal(recorder.takeState,'active');const first=recorder.node;
  first.pcm(tone(16000,.1),32000);await recorder.pause();assert.equal(recorder.takeState,'paused');assert.equal(recorder.takeActive,true);
  await recorder.detach();assert.equal(first.closed,true);song=8.1;await recorder.attach(ctx(48000,5),source());await recorder.resume();recorder.node.pcm(tone(48000,.1),240000);
  const promise=recorder.finish('ended');assert.equal(recorder.finish('duplicate'),promise);const result=await promise;
  assert.equal(result.sampleRate,16000);assert.equal(result.durationSec,.2);assert.equal(result.capture.segments.length,2);assert.equal(result.capture.segments[1].songStartSec,8.1);assert.equal(recorder.takeActive,false);assert.equal(await recorder.finish(),result);
  assert.ok(result.pcm.some(v=>v>.35));assert.equal(result.capture.reason,'ended');await recorder.detach();
});

test('上限callback只触发一次，丢弃及新take清空前次数据',async()=>{
  const limits=[];const recorder=new KaraokeRecorder({onLimit:event=>limits.push(event)});await recorder.attach(ctx(),source());recorder.begin({maxDurationSec:.1});await recorder.resume();
  recorder.node.pcm(tone(16000,.2),32000);recorder.node.send({type:'limit',segmentId:recorder.node.segmentId});
  const result=await recorder.finish();assert.equal(limits.length,1);assert.equal(result.durationSec,.1);assert.equal(result.capture.truncated,true);
  recorder.begin();await recorder.discard();assert.equal(recorder.takeActive,false);assert.equal(await recorder.finish(),null);await recorder.detach();
});

test('暂停封尾尚未完成时快速播放再暂停，旧resume不能偷偷继续采集',async()=>{
  const recorder=new KaraokeRecorder();await recorder.attach(ctx(),source());recorder.begin();await recorder.resume();
  let ack;recorder.node.port.postMessage=message=>{if(message.type==='flush')ack=()=>recorder.node.send({type:'flushed',requestId:message.requestId});};
  const pausing=recorder.pause(),resuming=recorder.resume();recorder.pause();ack();await Promise.all([pausing,resuming]);
  assert.equal(recorder.takeState,'paused');assert.equal(recorder.run,null);await recorder.discard();await recorder.detach();
});

test('音频块丢失标记不完整；不支持或未开mic返回明确错误',async()=>{
  const recorder=new KaraokeRecorder();assert.throws(()=>recorder.begin(),code('mediaUnavailable'));await assert.rejects(recorder.attach({},source()),code('unsupported'));
  await recorder.attach(ctx(),source());recorder.begin();assert.throws(()=>recorder.begin(),code('takeActive'));await recorder.resume();
  recorder.node.pcm(tone(16000,.1),32000);recorder.node.pcm(tone(16000,.1),34000);const result=await recorder.finish();assert.equal(result.capture.incomplete,true);assert.equal(result.capture.flushFailed,false);await recorder.detach();
});

test('尾块无法确认保留已有真实PCM并回报错误，不误称完整录音',async()=>{
  const errors=[];const recorder=new KaraokeRecorder({onError:error=>errors.push(error)});await recorder.attach(ctx(),source());recorder.begin();await recorder.resume();recorder.node.pcm(tone(16000,.1),32000);
  recorder.node.port.postMessage=()=>{throw new Error('closed');};const result=await recorder.finish();assert.equal(result.durationSec,.1);assert.equal(result.capture.incomplete,true);assert.equal(result.capture.flushFailed,true);assert.equal(errors[0].code,'captureInterrupted');await recorder.detach();
});

test('KaraokePlayer播放/暂停/结束保留take，seek/restart必须完成前次',async()=>{
  class FakeAudio {
    constructor(){this.handlers={};this.currentTime=0;this.duration=3;this.volume=.9;this.paused=true;}
    addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);} emit(name){for(const fn of this.handlers[name]??[])fn();}
    async play(){this.paused=false;this.emit('playing');} pause(){this.paused=true;this.emit('pause');} removeAttribute(){} load(){}
  }
  globalThis.Audio=FakeAudio;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const {KaraokePlayer}=await import('../js/karaoke.js');let ended=0;const player=new KaraokePlayer({onEnded:()=>ended++});player.url='blob:local';player.duration=3;player.micOn=true;player.micCtx=ctx();player._micSource=source();
  await player.beginTake();assert.equal(player.takeState,'paused');await player.play();await Promise.resolve();assert.equal(player.takeState,'active');player._recorder.node.pcm(tone(16000,.1),32000);
  await assert.rejects(player.seek(1),code('takeActive'));assert.throws(()=>player.restart(),code('takeActive'));await player.pause();assert.equal(player.takeActive,true);
  player.audio.currentTime=.1;await player.play();await Promise.resolve();player._recorder.node.pcm(tone(16000,.1),33600);player.audio.emit('ended');await player._recorder.pause();assert.equal(player.takeActive,true);assert.equal(ended,1);assert.equal(player._raf,0);
  const result=await player.finishTake('ended');assert.equal(result.durationSec,.2);await player.seek(1);assert.equal(player.currentTime,1);player.restart();assert.equal(player.currentTime,0);await player._recorder.detach();delete globalThis.Audio;
});

test('同时启用只申请一次mic；权限等待期间关闭会释放后到的stream',async()=>{
  const navDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');const previousContext=globalThis.AudioContext;
  let resolveMic,requests=0,stopped=0,closed=0;
  const stream={getTracks:()=>[{stop:()=>stopped++}]};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{requests++;return new Promise(resolve=>{resolveMic=resolve;});}}}});
  globalThis.AudioContext=class {constructor(options){this.sampleRate=options.sampleRate;this.currentTime=0;this.state='running';}createMediaStreamSource(){return source();}createAnalyser(){return{};}async close(){closed++;}};
  try{
    const {KaraokePlayer}=await import('../js/karaoke.js');const player=new KaraokePlayer();
    const first=player.startMic(),second=player.startMic();resolveMic(stream);await Promise.all([first,second]);assert.equal(requests,1);assert.equal(player.micOn,true);await player.stopMicrophone();assert.equal(stopped,1);assert.equal(closed,1);
    const pending=player.startMic();await player.stopMicrophone();resolveMic(stream);await assert.rejects(pending,code('mediaUnavailable'));assert.equal(player.micOn,false);assert.equal(stopped,2);
  }finally{if(navDescriptor)Object.defineProperty(globalThis,'navigator',navDescriptor);else delete globalThis.navigator;if(previousContext)globalThis.AudioContext=previousContext;else delete globalThis.AudioContext;}
});
