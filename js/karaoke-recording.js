// 连续采集、流式重采样与 WAV 编码。只接受本地麦克风 PCM，不访问网络或存储。
export const RECORDING_SR=16000;
export const MAX_TAKE_SEC=1200;
export class KaraokeRecordingError extends Error {
  constructor(code,message,cause){super(message,{cause});this.name='KaraokeRecordingError';this.code=code;}
}
const error=(code,message,cause)=>new KaraokeRecordingError(code,message,cause);
const nextTurn=()=>new Promise(resolve=>setTimeout(resolve,0));

/** 分块积分平均，保持跨块的分数采样相位；浏览器原生 16k 时直接复制。 */
export class StreamingResampler {
  constructor(inputRate,outputRate=RECORDING_SR){
    if(!Number.isFinite(inputRate)||inputRate<outputRate||inputRate>192000)throw error('invalid','录音采样率不支持');
    this.inputRate=inputRate;this.outputRate=outputRate;this.width=inputRate/outputRate;this.weight=0;this.sum=0;this.outputCount=0;
  }
  process(input){
    const output=new Float32Array(Math.ceil((input.length+this.weight)/this.width)+1);let n=0;
    for(let i=0;i<input.length;i++){
      const value=input[i];if(!Number.isFinite(value))throw error('capture','麦克风采样不合法');
      let left=1;
      while(left>1e-10){const used=Math.min(left,this.width-this.weight);this.sum+=value*used;this.weight+=used;left-=used;
        if(this.weight>=this.width-1e-10){output[n++]=this.sum/this.width;this.weight=0;this.sum=0;}}
    }
    this.outputCount+=n;return output.slice(0,n);
  }
  finish(){
    if(this.weight<1e-10)return new Float32Array(0);
    const value=this.sum/this.weight;this.weight=0;this.sum=0;this.outputCount++;return Float32Array.of(value);
  }
}

function wavView(length,sampleRate){
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isSafeInteger(length)||length<0||length>sampleRate*MAX_TAKE_SEC)throw error('invalid','WAV 参数不合法');
  const view=new DataView(new ArrayBuffer(44+length*2));
  const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);return view;
}
function writeSamples(view,pcm,from,to){for(let i=from;i<to;i++){const value=Math.max(-1,Math.min(1,Number.isFinite(pcm[i])?pcm[i]:0));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}}
export function encodePcmWav(pcm,sampleRate=RECORDING_SR){const view=wavView(pcm.length,sampleRate);writeSamples(view,pcm,0,pcm.length);return new Blob([view.buffer],{type:'audio/wav'});}
async function encodeYielding(pcm,sampleRate){const view=wavView(pcm.length,sampleRate);for(let from=0;from<pcm.length;from+=131072){writeSamples(view,pcm,from,Math.min(pcm.length,from+131072));if(from+131072<pcm.length)await nextTurn();}return new Blob([view.buffer],{type:'audio/wav'});}

/** 按录音时序保存 PCM；歌曲时间映射分段记录，暂停墙钟时间不进入 WAV。 */
export class TakeBuffer {
  constructor({startedAtSongSec=0,maxDurationSec=MAX_TAKE_SEC}={}){
    if(!Number.isFinite(startedAtSongSec)||startedAtSongSec<0||!Number.isFinite(maxDurationSec)||maxDurationSec<=0||maxDurationSec>MAX_TAKE_SEC)throw error('invalid','录音起点或时长上限不合法');
    this.id=globalThis.crypto?.randomUUID?.()??`take-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.startedAtSongSec=startedAtSongSec;this.maxSamples=Math.floor(maxDurationSec*RECORDING_SR);if(this.maxSamples<1)throw error('invalid','录音时长上限过短');this.sampleCount=0;this.chunks=[];this.segments=[];this.truncated=false;this.incomplete=false;this.flushFailed=false;
  }
  append(pcm,{segmentId,songStartSec,inputSampleRate}={}){
    if(!(pcm instanceof Float32Array)||!Number.isFinite(songStartSec)||songStartSec<0)throw error('capture','录音区段数据不合法');
    const count=Math.min(pcm.length,this.maxSamples-this.sampleCount);if(count<=0){this.truncated=true;return 0;}
    const start=this.sampleCount/RECORDING_SR;const chunk=pcm.slice(0,count);
    for(const value of chunk)if(!Number.isFinite(value))throw error('capture','录音含不合法采样');
    this.chunks.push(chunk);this.sampleCount+=count;
    const previous=this.segments.at(-1);
    if(previous?.id===segmentId){previous.recordingEndSec=this.sampleCount/RECORDING_SR;previous.songEndSec=songStartSec+count/RECORDING_SR;}
    else this.segments.push({id:segmentId,recordingStartSec:start,recordingEndSec:this.sampleCount/RECORDING_SR,songStartSec,songEndSec:songStartSec+count/RECORDING_SR,inputSampleRate});
    if(this.sampleCount>=this.maxSamples)this.truncated=true;
    return count;
  }
  async finish(reason='finished'){
    if(!this.sampleCount)return null;
    const pcm=new Float32Array(this.sampleCount);let offset=0;
    for(let i=0;i<this.chunks.length;i++){pcm.set(this.chunks[i],offset);offset+=this.chunks[i].length;if(i%256===255)await nextTurn();}
    const blob=await encodeYielding(pcm,RECORDING_SR);
    return {id:this.id,blob,pcm,sampleRate:RECORDING_SR,durationSec:this.sampleCount/RECORDING_SR,startedAtSongSec:this.segments[0]?.songStartSec??this.startedAtSongSec,
      capture:{method:'continuousAudioWorklet',timeline:'recordingSecondsToSongSeconds',segments:this.segments.map(s=>({...s})),initialStartedAtSongSec:this.startedAtSongSec,endedAtSongSec:this.segments.at(-1)?.songEndSec??this.startedAtSongSec,
        truncated:this.truncated,incomplete:this.incomplete,flushFailed:this.flushFailed,reason:this.truncated?'durationLimit':reason,maxDurationSec:this.maxSamples/RECORDING_SR,resampling:'native16kOrStreamingBoxAverage'}};
  }
}

/** 音频图可卸载/重新连接，take 缓冲继续保留；finish/discard 由 controller 显式决定。 */
export class KaraokeRecorder {
  constructor({getSongTime=()=>0,onLimit=()=>{},onError=()=>{}}={}){
    this.getSongTime=getSongTime;this.onLimit=onLimit;this.onError=onError;this.take=null;this.lastTake=null;this.context=null;this.source=null;this.node=null;this.run=null;this.sequence=0;this.requests=new Map();this._pause=null;this._finish=null;this._limitNotified=false;this._wantCapture=false;
  }
  get takeActive(){return!!this.take;}
  get takeId(){return this.take?.id??null;}
  get takeState(){return this._finish?'finishing':!this.take?'inactive':this.run&&!this._pause?'active':'paused';}
  async attach(context,source){
    if(this.node&&this.context===context)return;
    if(this.node)await this.detach();
    if(!context?.audioWorklet?.addModule||typeof AudioWorkletNode!=='function')throw error('unsupported','浏览器不支持连续录音；可继续实时练习。');
    let node;
    try{await context.audioWorklet.addModule(new URL('./karaoke-capture-worklet.js',import.meta.url));node=new AudioWorkletNode(context,'karaoke-capture-processor',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      node.port.onmessage=event=>this._message(event.data);source.connect(node);node.connect(context.destination);this.context=context;this.source=source;this.node=node;
    }catch(cause){try{source?.disconnect(node);node?.disconnect();node?.port.close();}catch{}throw error('unsupported','无法启动连续麦克风录音；录音尚未保存。',cause);}
  }
  begin(options={}){
    if(this.take||this._finish)throw error('takeActive','请先完成或放弃当前录音。');
    if(!this.node)throw error('mediaUnavailable','麦克风连续采集尚未准备好。');
    this.take=new TakeBuffer({startedAtSongSec:this.getSongTime(),...options});this.lastTake=null;this._limitNotified=false;return{id:this.take.id,sampleRate:RECORDING_SR,startedAtSongSec:this.take.startedAtSongSec};
  }
  async resume(){
    this._wantCapture=true;
    if(this._pause)await this._pause;
    if(!this._wantCapture||this._finish||!this.take||this.run||!this.node||this.take.truncated)return;
    this.run={id:`${this.take.id}:${++this.sequence}`,songAnchor:this.getSongTime(),contextAnchor:this.context.currentTime,startContext:null,resampler:new StreamingResampler(this.context.sampleRate),rawEndFrame:null};
    this.node.port.postMessage({type:'start',segmentId:this.run.id,maxInputSamples:Math.ceil((this.take.maxSamples-this.take.sampleCount)/RECORDING_SR*this.context.sampleRate)});
  }
  _notifyError(cause){try{this.onError(cause);}catch{/* UI 回调不能破坏已取得的 PCM。 */}}
  _limit(){if(!this.take||this._limitNotified)return;this._limitNotified=true;try{this.onLimit({takeId:this.take.id,reason:'durationLimit'});}catch(cause){this._notifyError(cause);}void this.pause();}
  _append(pcm){
    if(!this.run||!this.take||!pcm.length)return;
    const before=this.run.resampler.outputCount-pcm.length;
    const songStart=this.run.songAnchor+(this.run.startContext-this.run.contextAnchor)+before/RECORDING_SR;
    this.take.append(pcm,{segmentId:this.run.id,songStartSec:Math.max(0,songStart),inputSampleRate:this.run.resampler.inputRate});
    if(this.take.truncated)this._limit();
  }
  _message(message){
    if(message?.type==='flushed'){const pending=this.requests.get(message.requestId);if(pending){clearTimeout(pending.timer);this.requests.delete(message.requestId);pending.resolve();}return;}
    if(!this.take||!this.run||message?.segmentId!==this.run.id)return;
    if(message.type==='limit'){this._limit();return;}
    if(message.type!=='pcm')return;
    try{
      if(!(message.pcm instanceof Float32Array)||message.sampleRate!==this.run.resampler.inputRate||!Number.isFinite(message.startFrame))throw error('capture','连续录音块不合法');
      if(this.run.rawEndFrame!=null&&message.startFrame!==this.run.rawEndFrame)this.take.incomplete=true;
      this.run.rawEndFrame=message.startFrame+message.pcm.length;
      if(this.run.startContext==null)this.run.startContext=message.startFrame/message.sampleRate;
      this._append(this.run.resampler.process(message.pcm));
    }catch(cause){this.take.incomplete=true;this._notifyError(cause);void this.pause();}
  }
  async _flush(){
    if(!this.node)return;
    const requestId=++this.sequence;
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.requests.delete(requestId);reject(error('captureInterrupted','连续录音尾块未确认；请保留当前录音并重试。'));},800);this.requests.set(requestId,{resolve,reject,timer});try{this.node.port.postMessage({type:'flush',requestId});}catch(cause){clearTimeout(timer);this.requests.delete(requestId);reject(error('captureInterrupted','连续录音尾块未确认；已采集录音仍保留。',cause));}});
  }
  pause(){
    this._wantCapture=false;
    if(this._pause)return this._pause;
    if(!this.run)return Promise.resolve();
    this._pause=(async()=>{try{await this._flush();}catch(cause){if(this.take){this.take.incomplete=true;this.take.flushFailed=true;}this._notifyError(cause);}finally{if(this.run&&this.take)this._append(this.run.resampler.finish());this.run=null;this._pause=null;}})();return this._pause;
  }
  finish(reason='finished'){
    if(this._finish)return this._finish;
    if(!this.take)return Promise.resolve(this.lastTake);
    this._finish=(async()=>{await this.pause();const result=await this.take.finish(reason);this.lastTake=result;this.take=null;return result;})().catch(cause=>{this._notifyError(cause);throw cause;}).finally(()=>{this._finish=null;});return this._finish;
  }
  async discard(){if(this._finish)await this._finish;await this.pause();this.take=null;this.lastTake=null;this._limitNotified=false;}
  async detach(){await this.pause();if(this.node){try{this.source?.disconnect(this.node);}catch{}try{this.node.disconnect();this.node.port.onmessage=null;this.node.port.close();}catch{}}this.node=null;this.context=null;this.source=null;}
}
