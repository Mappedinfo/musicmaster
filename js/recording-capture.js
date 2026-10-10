// 采集事实随录音保留，重新分析不能把不完整的音频变成可靠的声乐判断。
const COMPARISON_ISSUES = new Set(['pitchFlat', 'pitchSharp', 'pitchError', 'onsetEarly', 'onsetLate']);
export function applyRecordingCapture(report, capture) {
  if (!capture) return report;
  report.metadata.capture = capture;
  if (!capture.incomplete && !capture.flushFailed) return report;
  if (report.quality.status !== 'insufficient') report.quality.status = 'limited';
  report.quality.reasons = [...new Set([...report.quality.reasons, 'captureIncomplete'])];
  report.summary.hypothesisReasons = [...new Set([...report.summary.hypothesisReasons, 'captureIncomplete'])];
  report.hypotheses = [];
  if (report.comparison) {
    const comparison = report.comparison;
    comparison.status = 'rejected'; comparison.alignmentTrusted = false;
    comparison.reasons = [...new Set([...comparison.reasons, 'captureIncomplete'])];
    for (const key of ['score', 'inTuneRatio', 'medianCents', 'octaveDifferenceRatio', 'octaveUpRatio', 'octaveDownRatio', 'intervalComparison']) comparison[key] = null;
    report.issues = report.issues.filter(issue => !COMPARISON_ISSUES.has(issue.code));
  }
  return report;
}
