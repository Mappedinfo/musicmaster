import { t } from '../../js/i18n.js';

// 固定报告代码到界面文案的映射：未知导入值不会作为翻译键泄漏到界面。
const labels = {
  source: { unknown: 'recording.source.unknown', vocal: 'recording.source.vocal', separated: 'recording.source.separated', mixed: 'recording.source.mixed' },
  quality: { ok: 'recording.quality.ok', limited: 'recording.quality.limited', insufficient: 'recording.quality.insufficient' },
  reason: {
    tooShort: 'recording.reason.tooShort', noVoice: 'recording.reason.noVoice', lowVoicedCoverage: 'recording.reason.lowVoicedCoverage',
    lowPitchClarity: 'recording.reason.lowPitchClarity', mixedSource: 'recording.reason.mixedSource', unknownSource: 'recording.reason.unknownSource', captureIncomplete: 'recording.reason.captureIncomplete',
    separationArtifacts: 'recording.reason.separationArtifacts', clipping: 'recording.reason.clipping', lowRecordingLevel: 'recording.reason.lowRecordingLevel',
  },
  issue: {
    drift: 'recording.issue.drift', instability: 'recording.issue.instability', tailFade: 'recording.issue.tailFade',
    pitchFlat: 'recording.issue.pitchFlat', pitchSharp: 'recording.issue.pitchSharp', pitchError: 'recording.issue.pitchError',
    onsetEarly: 'recording.issue.onsetEarly', onsetLate: 'recording.issue.onsetLate',
  },
  practice: {
    drift: 'recording.practice.drift', instability: 'recording.practice.instability', tailFade: 'recording.practice.tailFade',
    pitchFlat: 'recording.practice.pitchFlat', pitchSharp: 'recording.practice.pitchSharp', pitchError: 'recording.practice.pitchError',
    onsetEarly: 'recording.practice.onsetEarly', onsetLate: 'recording.practice.onsetLate',
  },
  hypothesis: { breathSupport: 'recording.hypothesis.breathSupport', pressedPhonation: 'recording.hypothesis.pressedPhonation', breathyClosure: 'recording.hypothesis.breathyClosure' },
  verification: { breathSupport: 'recording.verify.breathSupport', pressedPhonation: 'recording.verify.pressedPhonation', breathyClosure: 'recording.verify.breathyClosure' },
  confidence: { low: 'recording.confidence.low', moderate: 'recording.confidence.moderate' },
  alternative: {
    intentionalExpression: 'recording.alternative.intentionalExpression', vowelChange: 'recording.alternative.vowelChange',
    volumeChange: 'recording.alternative.volumeChange', reverb: 'recording.alternative.reverb',
    separationResidual: 'recording.alternative.separationResidual', pitchTrackingError: 'recording.alternative.pitchTrackingError',
  },
  hypothesisReason: {
    noStableRegions: 'recording.hypothesisReason.noStableRegions', insufficientRepeatedEvidence: 'recording.hypothesisReason.insufficientRepeatedEvidence',
    mixedSource: 'recording.hypothesisReason.mixedSource', unknownSource: 'recording.hypothesisReason.unknownSource', needDryRecording: 'recording.hypothesisReason.needDryRecording', captureIncomplete: 'recording.hypothesisReason.captureIncomplete',
    breathSupportInsufficientEvidence: 'recording.hypothesisReason.breathSupportInsufficientEvidence',
    pressedPhonationInsufficientEvidence: 'recording.hypothesisReason.pressedPhonationInsufficientEvidence',
    breathyClosureInsufficientEvidence: 'recording.hypothesisReason.breathyClosureInsufficientEvidence',
  },
  comparison: { ready: 'recording.comparison.ready', unscored: 'recording.comparison.unscored', rejected: 'recording.comparison.rejected' },
  comparisonReason: {
    alignmentUntrusted: 'recording.comparisonReason.alignmentUntrusted', selfComparison: 'recording.comparisonReason.selfComparison',
    referenceInsufficient: 'recording.comparisonReason.referenceInsufficient', performanceInsufficient: 'recording.comparisonReason.performanceInsufficient',
    sourceUnverified: 'recording.comparisonReason.sourceUnverified', referenceInconsistent: 'recording.comparisonReason.referenceInconsistent',
    insufficientOverlap: 'recording.comparisonReason.insufficientOverlap', insufficientCoverage: 'recording.comparisonReason.insufficientCoverage',
    captureIncomplete: 'recording.comparisonReason.captureIncomplete',
  },
  alignmentReason: {
    alignmentInsufficientVoicing: 'recording.alignmentReason.alignmentInsufficientVoicing',
    alignmentNotEnoughVariation: 'recording.alignmentReason.alignmentNotEnoughVariation',
    alignmentWeakMatch: 'recording.alignmentReason.alignmentWeakMatch',
    alignmentAmbiguous: 'recording.alignmentReason.alignmentAmbiguous',
    alignmentNonFixedOffset: 'recording.alignmentReason.alignmentNonFixedOffset',
  },
  metric: {
    driftCents: 'recording.metric.driftCents', slopeCentsPerSec: 'recording.metric.slopeCentsPerSec', durationSec: 'recording.metric.durationSec',
    residualSpreadCents: 'recording.metric.residualSpreadCents', levelDropDb: 'recording.metric.levelDropDb', pitchDriftCents: 'recording.metric.pitchDriftCents',
    medianCents: 'recording.metric.medianCents', absMedianCents: 'recording.metric.absMedianCents', inTuneRatio: 'recording.metric.inTuneRatio',
    comparedSec: 'recording.metric.comparedSec', offsetMs: 'recording.metric.offsetMs', referenceTime: 'recording.metric.referenceTime', performanceTime: 'recording.metric.performanceTime',
    repetitions: 'recording.metric.repetitions', meanTailDropDb: 'recording.metric.meanTailDropDb', meanPitchDriftCents: 'recording.metric.meanPitchDriftCents',
    highRegionCount: 'recording.metric.highRegionCount', baselineH1H2Db: 'recording.metric.baselineH1H2Db', highH1H2Db: 'recording.metric.highH1H2Db',
    baselineRmsDb: 'recording.metric.baselineRmsDb', highRmsDb: 'recording.metric.highRmsDb', observedH1H2Db: 'recording.metric.observedH1H2Db',
    baselineHarmonicRatio: 'recording.metric.baselineHarmonicRatio', observedHarmonicRatio: 'recording.metric.observedHarmonicRatio',
    octaveDifferenceRatio: 'recording.metric.octaveDifferenceRatio', octaveShiftSemitones: 'recording.metric.octaveShiftSemitones',
  },
};

export function reviewLabel(group, code) {
  const key = labels[group]?.[code];
  return key ? t(key) : t('recording.otherObservation');
}
