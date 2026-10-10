// 可 terminate 的离线录音作业；消息始终携带 jobId，调用者忽略过期作业。
import { analyzeRecording, compareRecording, estimateRecordingOffset, validateRecordingReport } from './recording-analysis.js';

function pcmArray(value) {
  if (value instanceof Float32Array) return value;
  if (value instanceof Float64Array || Array.isArray(value)) {
    if (value.length > 192000 * 1200) throw new RangeError('PCM exceeds analysis limit');
    return new Float32Array(value);
  }
  if (value instanceof ArrayBuffer && value.byteLength % 4 === 0 && value.byteLength <= 192000 * 1200 * 4) return new Float32Array(value);
  throw new TypeError('Missing or invalid PCM');
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type !== 'analyze') return;
  const jobId = message.jobId;
  try {
    const pcm = pcmArray(message.pcm);
    const options = { ...(message.options || {}) };
    const hasReference = message.reference != null;
    const progress = (value) => self.postMessage({ type: 'progress', jobId, progress: value });
    let report = analyzeRecording(pcm, message.sampleRate ?? 16000, { ...options, onProgress: (p) => progress(p * (hasReference ? 0.45 : 1)) });
    if (hasReference) {
      let reference = message.reference;
      if (reference == null || typeof reference !== 'object') throw new TypeError('Invalid reference');
      if (reference.schemaVersion !== 1) {
        const referencePcm = pcmArray(reference.pcm);
        reference = analyzeRecording(referencePcm, reference.sampleRate ?? 16000, { ...reference.options, onProgress: (p) => progress(0.45 + p * 0.45) });
      }
      const estimate = options.autoOffset === true && options.alignmentTrusted !== true ? estimateRecordingOffset(report, reference, options) : null;
      report = compareRecording(report, reference, { ...options, ...(estimate ? { offsetSec: estimate.offsetSec } : {}) });
      if (estimate) report.comparison.alignmentEstimate = estimate;
    }
    const validation = validateRecordingReport(report);
    if (!validation.valid) throw new Error(validation.errors[0]);
    progress(1);
    self.postMessage({ type: 'result', jobId, report });
  } catch (error) {
    self.postMessage({ type: 'error', jobId, message: error instanceof Error ? error.message : String(error) });
  }
};
