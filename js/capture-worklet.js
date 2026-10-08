// AudioWorklet 采集器：把麦克风流按块转发到主线程。
// 主线程运行 YIN 等分析（dsp.js 为 ES Module，worklet 环境不支持 import，
// 因此分析统一放在主线程，worklet 只做低开销转发）。
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(1024);
    this._idx = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      for (let i = 0; i < channel.length; i++) {
        this._buf[this._idx++] = channel[i];
        if (this._idx === 1024) {
          const chunk = this._buf.slice();
          this.port.postMessage(chunk, [chunk.buffer]);
          this._idx = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
