// 专用连续录音器。与 RAF 的实时检测独立；所有原始 PCM 来自麦克风音频渲染线程。
// 时间戳采用 AudioContext 帧时钟，主线程收到消息的延迟不会移动录音位置。
// start 开始一个采集区段；flush 把尚未满 1024 采样的尾块发出并暂停，ack 在尾块之后。
// 本处理器不输出麦克风声音，连接 destination 只是维持音频图运行。
class KaraokeCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled=false;
    this.segmentId=null;
    this.buffer=new Float32Array(1024);
    this.size=0;
    this.startFrame=0;
    this.remaining=0;
    this.port.onmessage=event=>{
      const message=event.data??{};
      if(message.type==='start'){
        this.size=0;this.enabled=true;this.segmentId=message.segmentId;
        this.remaining=Number.isFinite(message.maxInputSamples)?Math.max(0,Math.floor(message.maxInputSamples)):0;
      } else if(message.type==='flush'){
        this.flush();this.enabled=false;
        this.port.postMessage({type:'flushed',requestId:message.requestId,contextTime:currentFrame/sampleRate});
      }
    };
  }
  flush(){
    if(!this.size)return;
    const pcm=this.buffer.slice(0,this.size);
    this.port.postMessage({type:'pcm',segmentId:this.segmentId,startFrame:this.startFrame,sampleRate,pcm},[pcm.buffer]);
    this.size=0;
  }
  process(inputs,outputs){
    for(const output of outputs)for(const channel of output)channel.fill(0);
    const channel=inputs[0]?.[0];
    if(!this.enabled||!channel)return true;
    for(let i=0;i<channel.length;i++){
      if(this.remaining<=0){this.flush();this.enabled=false;this.port.postMessage({type:'limit',segmentId:this.segmentId});break;}
      if(!this.size)this.startFrame=currentFrame+i;
      this.buffer[this.size++]=channel[i];this.remaining--;
      if(this.size===this.buffer.length)this.flush();
    }
    if(this.enabled&&this.remaining===0){this.flush();this.enabled=false;this.port.postMessage({type:'limit',segmentId:this.segmentId});}
    return true;
  }
}
registerProcessor('karaoke-capture-processor',KaraokeCaptureProcessor);
