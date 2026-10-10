// ============================================================
// 国际化（i18n）：中文 / English
// 零依赖：字典 + DOM 属性扫描 + 变量插值
// ============================================================
export const LANG_KEY = 'musicmaster.lang.v1';

export const DICT = {
  // ---------- 录音复盘：声学观察与可验证的声乐假设 ----------
  'recording.modeLabel': { zh: 'K歌练习模式', en: 'Singing practice mode' },
  'recording.liveMode': { zh: '实时跟唱', en: 'Live practice' },
  'recording.reviewMode': { zh: '录音复盘', en: 'Recording review' },
  'recording.noMic': { zh: '分析本地人声，无需麦克风', en: 'Review local vocals. No microphone needed.' },
  'recording.liveHint': { zh: '听参考歌曲，用麦克风跟唱', en: 'Listen to a reference and sing into your mic.' },
  'recording.title': { zh: '听懂自己的演唱', en: 'Understand your recording' },
  'recording.subtitle': { zh: '导入干声或分离人声，找到值得再练的片段。音频不会上传。', en: 'Import dry or separated vocals and find passages to practise. Audio stays on this device.' },
  'recording.myVocal': { zh: '我的演唱人声', en: 'My singing vocals' },
  'recording.referenceVocal': { zh: '参考原唱人声（可选）', en: 'Reference vocals (optional)' },
  'recording.referenceTrack': { zh: '参考原唱人声', en: 'Reference vocals' },
  'recording.chooseVocal': { zh: '选择演唱人声', en: 'Choose my vocals' },
  'recording.chooseReference': { zh: '选择参考人声', en: 'Choose reference vocals' },
  'recording.replace': { zh: '替换文件', en: 'Replace file' },
  'recording.remove': { zh: '移除', en: 'Remove' },
  'recording.vocalEmpty': { zh: '干声录音或 vocals.wav', en: 'Dry recording or vocals.wav' },
  'recording.referenceEmpty': { zh: '添加后可比较音准与起音', en: 'Add to compare pitch and note starts' },
  'recording.sourceLabel': { zh: '人声来源', en: 'Vocal source' },
  'recording.source.unknown': { zh: '确认录音来源', en: 'Confirm vocal source' },
  'recording.source.vocal': { zh: '干声录音，无伴奏', en: 'Dry recording, no backing track' },
  'recording.source.separated': { zh: '已分离的人声', en: 'Separated vocals' },
  'recording.checkingFile': { zh: '正在核对文件…', en: 'Checking file identity…' },
  'recording.offset': { zh: '参考时间偏移', en: 'Reference time offset' },
  'recording.autoOffset': { zh: '自动估计偏移', en: 'Estimate offset automatically' },
  'recording.candidateOffset': { zh: '这是候选偏移。请回听两份人声的共同乐句，再勾选确认对齐并重新分析。', en: 'This is a candidate offset. Listen to a shared phrase in both vocals, then confirm alignment and analyze again.' },
  'recording.checkAnchor': { zh: '核对 {time} 附近的对齐', en: 'Check alignment near {time}' },
  'recording.listenMine': { zh: '听演唱', en: 'Hear singing' },
  'recording.offsetUnavailable': { zh: '未能可靠估计偏移，暂用0秒。请回听共同乐句并手动调整，再确认对齐。', en: 'No reliable offset could be estimated; using 0 seconds. Listen to a shared phrase and adjust the offset manually before confirming.' },
  'recording.alignmentReason.alignmentInsufficientVoicing': { zh: '共同有效人声不足', en: 'Too little shared usable vocal material' },
  'recording.alignmentReason.alignmentNotEnoughVariation': { zh: '旋律变化不足以确定位置', en: 'Too little melodic variation to locate the phrase' },
  'recording.alignmentReason.alignmentWeakMatch': { zh: '旋律匹配较弱', en: 'Weak melodic match' },
  'recording.alignmentReason.alignmentAmbiguous': { zh: '有多个相似位置，无法确定', en: 'Multiple similar positions make alignment ambiguous' },
  'recording.alignmentReason.alignmentNonFixedOffset': { zh: '两份人声可能存在速度变化，单一偏移不足', en: 'Timing may vary between recordings; one fixed offset is insufficient' },
  'recording.transpose': { zh: '参考转调', en: 'Reference transpose' },
  'recording.semitones': { zh: '半音', en: 'semitones' },
  'recording.confirmAlignment': { zh: '已试听确认对齐', en: 'I have listened and confirmed alignment' },
  'recording.offsetHint': { zh: '演唱的 t 秒对应参考的 t＋偏移秒。先试听，再确认对齐；更改输入或偏移后需要重新确认。', en: 'Singing at t seconds matches the reference at t + offset. Listen before confirming; confirm again after changing inputs or offset.' },
  'recording.noReferenceHint': { zh: '没有参考时，只分析人声本身，不给音准分。', en: 'Without a reference, review the voice itself; no pitch score is given.' },
  'recording.analyze': { zh: '开始分析', en: 'Analyze recording' },
  'recording.analyzeAgain': { zh: '重新分析', en: 'Analyze again' },
  'recording.cancel': { zh: '取消分析', en: 'Cancel analysis' },
  'recording.readyToAnalyze': { zh: '选择演唱人声后即可分析', en: 'Choose your vocals to begin' },
  'recording.decodingVocal': { zh: '正在读取演唱人声', en: 'Reading your vocals' },
  'recording.decodingReference': { zh: '正在读取参考人声', en: 'Reading reference vocals' },
  'recording.analyzing': { zh: '正在分析人声', en: 'Analyzing vocals' },
  'recording.cancelled': { zh: '分析已取消，输入与上次结果仍保留。', en: 'Analysis cancelled. Inputs and the previous result are retained.' },
  'recording.complete': { zh: '分析完成', en: 'Analysis complete' },
  'recording.failed': { zh: '分析未完成', en: 'Analysis did not finish' },
  'recording.needVocal': { zh: '请先选择演唱人声。', en: 'Choose your singing vocals first.' },
  'recording.confirmSource': { zh: '请确认每份音频是干声或已分离人声；含伴奏录音需先在本地分离。', en: 'Confirm that each file is dry or separated vocals. Separate recordings with backing tracks locally first.' },
  'recording.invalidSettings': { zh: '请使用有效偏移（±1200秒）和转调（±24半音）。', en: 'Use a valid offset (±1200 seconds) and transpose (±24 semitones).' },
  'recording.otherObservation': { zh: '其他观察', en: 'Other observation' },
  'recording.fileError': { zh: '无法读取文件，请重新选择。', en: 'Unable to read the file. Choose it again.' },
  'recording.audioTooLarge': { zh: '请选择小于128 MB的人声文件；长录音可先截取需要练习的片段。', en: 'Choose a vocal file smaller than 128 MB. Trim longer recordings to the passage you want to practise.' },
  'recording.audioTooLong': { zh: '一次分析最多20分钟，请先截取需要复盘的片段。', en: 'Each analysis supports up to 20 minutes. Trim the recording to the passage you want to review.' },
  'recording.reportTooLarge': { zh: '报告超过64 MB，无法导入。请导出较短录音的报告。', en: 'This report exceeds 64 MB. Export a report for a shorter recording.' },
  'recording.analysisError': { zh: '无法完成分析，输入仍保留。请检查音频后重试。', en: 'Analysis could not finish. Inputs are retained; check the audio and retry.' },
  'recording.reportError': { zh: '无法导入这份报告。请使用有效的 MusicMaster JSON 报告。', en: 'Unable to import this report. Use a valid MusicMaster JSON report.' },
  'recording.importReport': { zh: '导入报告', en: 'Import report' },
  'recording.imported': { zh: '报告已导入；选择对应音频可回听片段。', en: 'Report imported. Choose the matching audio to listen to passages.' },
  'recording.export': { zh: '导出报告 JSON', en: 'Export report JSON' },
  'recording.preview': { zh: '试听', en: 'Listen' },
  'recording.previewEmpty': { zh: '选择音频后可试听，无需启动麦克风。', en: 'Choose audio to listen. No microphone is needed.' },
  'recording.loop': { zh: '循环所选片段', en: 'Loop selected passage' },
  'recording.audioMatched': { zh: '文件已核对，可定位并循环报告片段。', en: 'File verified. Report passages can be located and looped.' },
  'recording.needMatchingAudio': { zh: '选择与报告完全对应的音频后，才能回听报告片段。', en: 'Choose the exact audio used in this report to listen to its passages.' },
  'recording.audioUnverifiable': { zh: '这份报告没有可核对的音频标识。重新分析对应音频即可关联回听。', en: 'This report has no verifiable audio identity. Analyze the corresponding audio again to link playback.' },
  'recording.noOverlap': { zh: '这个片段不在参考音频范围内，请调整偏移。', en: 'This passage is outside the reference audio. Adjust the offset.' },
  'recording.playError': { zh: '无法播放。请再次点试听，或更换浏览器支持的音频。', en: 'Playback failed. Try listening again or choose a supported audio file.' },
  'recording.resultTitle': { zh: '演唱复盘', en: 'Recording findings' },
  'recording.previousReport': { zh: '这是上次输入的报告。输入或设置已改变，请重新分析。', en: 'This report belongs to the previous inputs. Inputs or settings changed; analyze again.' },
  'recording.quality.ok': { zh: '人声可分析', en: 'Vocals ready for analysis' },
  'recording.quality.limited': { zh: '结果有局限', en: 'Results have limitations' },
  'recording.quality.insufficient': { zh: '有效人声不足', en: 'Insufficient usable vocals' },
  'recording.effectiveVoice': { zh: '有效人声 {sec} 秒 · 覆盖 {percent}%', en: '{sec}s usable vocals · {percent}% coverage' },
  'recording.reason.tooShort': { zh: '录音过短', en: 'Recording too short' },
  'recording.reason.noVoice': { zh: '未检测到可靠人声', en: 'No reliable vocals detected' },
  'recording.reason.lowVoicedCoverage': { zh: '有效人声覆盖较少', en: 'Low vocal coverage' },
  'recording.reason.lowPitchClarity': { zh: '音高清晰度较低', en: 'Low pitch clarity' },
  'recording.reason.mixedSource': { zh: '伴奏可能干扰检测', en: 'Backing track may affect detection' },
  'recording.reason.unknownSource': { zh: '录音来源未确认', en: 'Vocal source unconfirmed' },
  'recording.reason.separationArtifacts': { zh: '分离残留可能影响判断', en: 'Separation artifacts may affect findings' },
  'recording.reason.clipping': { zh: '检测到削波', en: 'Clipping detected' },
  'recording.reason.lowRecordingLevel': { zh: '录音音量偏低', en: 'Low recording level' },
  'recording.priorityTitle': { zh: '优先练这几处', en: 'Start with these passages' },
  'recording.pitchMatch': { zh: '已配对音高匹配（±50¢）', en: 'paired pitch within ±50¢' },
  'recording.octaveDifferenceHint': { zh: '这一句可能主动换了八度，也可能是音高跟踪错误。分开回听两份人声，检查参考版本与转调设置。', en: 'This phrase may use a different octave, or pitch tracking may be wrong. Listen to both vocals separately and check the reference version and transpose.' },
  'recording.notEnoughVoice': { zh: '可靠人声太少，暂不足以指出练习问题。可录一段更清晰的干声重试。', en: 'Too little reliable vocal material to identify practice issues. Try a clearer dry recording.' },
  'recording.noPriority': { zh: '未发现达到当前规则阈值的优先问题；这不代表演唱没有其他问题。', en: 'No priority issue crossed the current thresholds. Other singing issues may still be present.' },
  'recording.shortEvidenceOnly': { zh: '候选片段的有效配对不足1秒，暂不列为优先问题。完整统计保留这些短片段观察。', en: 'Candidate passages have less than one second of valid pairing. Their observations remain in the full statistics.' },
  'recording.issue.drift': { zh: '持续音在漂移', en: 'Pitch drifts within a held note' },
  'recording.issue.instability': { zh: '持续音波动较大', en: 'A held note varies substantially' },
  'recording.issue.tailFade': { zh: '尾音衰减并伴随音高变化', en: 'The note ending fades and changes pitch' },
  'recording.issue.pitchFlat': { zh: '相对参考偏低', en: 'Below the reference pitch' },
  'recording.issue.pitchSharp': { zh: '相对参考偏高', en: 'Above the reference pitch' },
  'recording.issue.pitchError': { zh: '相对参考偏差较大', en: 'Large deviation from reference pitch' },
  'recording.issue.onsetEarly': { zh: '这一处起音早于参考', en: 'This note starts before the reference' },
  'recording.issue.onsetLate': { zh: '这一处起音晚于参考', en: 'This note starts after the reference' },
  'recording.practice.drift': { zh: '轻声唱同一个音，先稳定前半句，再把尾音延长。', en: 'Hold the same note softly. Steady the first half, then extend the ending.' },
  'recording.practice.instability': { zh: '先用轻声哼鸣唱稳，再用同一元音复唱；对照听是否为刻意颤音。', en: 'Steady the note with a soft hum, then repeat on one vowel. Listen for intentional vibrato.' },
  'recording.practice.tailFade': { zh: '缩短句子、提前规划换气，再比较尾音是否更稳；保留有意的弱收。', en: 'Shorten the phrase and plan the breath, then compare the ending. Keep intentional soft releases.' },
  'recording.practice.pitchFlat': { zh: '先听参考，轻声哼准目标音，再唱歌词。', en: 'Listen to the reference, hum the target softly, then add the words.' },
  'recording.practice.pitchSharp': { zh: '先听参考，用更轻的音量复唱，避免越唱越高。', en: 'Listen to the reference and repeat more softly, keeping the pitch from rising.' },
  'recording.practice.pitchError': { zh: '分开听两份人声，核对版本、转调与时间对齐，再慢速练这一句。', en: 'Listen to both vocals separately. Check version, key and alignment, then practise the phrase slowly.' },
  'recording.practice.onsetEarly': { zh: '听清这一处进入位置，先只拍节奏，再把歌词放回去。', en: 'Listen to this entry, tap its rhythm, then add the words.' },
  'recording.practice.onsetLate': { zh: '听清起音前的准备位置，先轻声按节拍进入，再连唱。', en: 'Listen to the preparation before the entry. Enter softly on the beat, then join the phrase.' },
  'recording.listenSegment': { zh: '回听这一段', en: 'Listen to passage' },
  'recording.listenReference': { zh: '听参考', en: 'Hear reference' },
  'recording.listenEvidence': { zh: '回听依据片段', en: 'Listen to the evidence' },
  'recording.hypothesesTitle': { zh: '可能的发声原因', en: 'Possible vocal explanations' },
  'recording.hypothesesHint': { zh: '以下是可用对照练习验证的假设。音频代理量不能直接确定气息、挤压或声带闭合方式。', en: 'These hypotheses can be checked with comparison exercises. Audio proxies cannot directly establish breath support, vocal pressure or vocal-fold closure.' },
  'recording.hypothesis.breathSupport': { zh: '可能存在气息支持不稳', en: 'Breath support may be inconsistent' },
  'recording.hypothesis.pressedPhonation': { zh: '高音可能有挤压倾向', en: 'Higher notes may be pressed' },
  'recording.hypothesis.breathyClosure': { zh: '可能存在漏气倾向', en: 'Phonation may be breathier' },
  'recording.confidence.low': { zh: '低可信', en: 'Low confidence' },
  'recording.confidence.moderate': { zh: '中等可信', en: 'Moderate confidence' },
  'recording.alternatives': { zh: '其他解释：', en: 'Other explanations: ' },
  'recording.alternative.intentionalExpression': { zh: '刻意的音乐表达', en: 'intentional expression' },
  'recording.alternative.vowelChange': { zh: '元音变化', en: 'vowel changes' },
  'recording.alternative.volumeChange': { zh: '音量变化', en: 'volume changes' },
  'recording.alternative.reverb': { zh: '混响', en: 'reverb' },
  'recording.alternative.separationResidual': { zh: '人声分离残留', en: 'vocal separation artifacts' },
  'recording.alternative.pitchTrackingError': { zh: '音高跟踪错误', en: 'pitch-tracking errors' },
  'recording.verifyTitle': { zh: '验证练习：', en: 'Verification exercise: ' },
  'recording.verify.breathSupport': { zh: '同一音高、同一元音，分别录短句和稍长句，保持舒适音量。比较尾音是否反复同时变弱、走低。', en: 'Record a short and a longer phrase on the same note and vowel at a comfortable volume. Check whether endings repeatedly fade and drop in pitch.' },
  'recording.verify.pressedPhonation': { zh: '在舒适范围内，用同一元音分别轻声和普通音量唱同一高音。比较稳定性与主观用力；若不适，停止并降低音高。', en: 'Within a comfortable range, sing the same high note and vowel softly and at ordinary volume. Compare stability and felt effort. Stop and lower the pitch if uncomfortable.' },
  'recording.verify.breathyClosure': { zh: '同音高、同元音，录轻声哼鸣接元音的干声对照，比较噪声感与稳定性；不靠强行挤紧追求更亮的音色。', en: 'Record a dry comparison at the same note and vowel, moving from a soft hum to the vowel. Compare noise and stability without forcing a tighter, brighter sound.' },
  'recording.noHypotheses': { zh: '没有足够证据推断发声原因。可录同音高、同元音的干声对照再验证。', en: 'There is not enough evidence to infer vocal causes. Try dry comparisons on the same note and vowel.' },
  'recording.hypothesisReason.noStableRegions': { zh: '缺少可比较的持续音', en: 'No comparable held notes' },
  'recording.hypothesisReason.insufficientRepeatedEvidence': { zh: '重复证据不足', en: 'Insufficient repeated evidence' },
  'recording.hypothesisReason.mixedSource': { zh: '伴奏干扰', en: 'Backing-track interference' },
  'recording.hypothesisReason.unknownSource': { zh: '来源未确认', en: 'Source unconfirmed' },
  'recording.hypothesisReason.needDryRecording': { zh: '需要干声对照', en: 'Dry comparison needed' },
  'recording.hypothesisReason.breathSupportInsufficientEvidence': { zh: '气息假设证据不足', en: 'Insufficient evidence for a breath-support hypothesis' },
  'recording.hypothesisReason.pressedPhonationInsufficientEvidence': { zh: '挤压假设证据不足', en: 'Insufficient evidence for a pressed-phonation hypothesis' },
  'recording.hypothesisReason.breathyClosureInsufficientEvidence': { zh: '漏气假设证据不足', en: 'Insufficient evidence for a breathier-phonation hypothesis' },
  'recording.chartTitle': { zh: '音高与片段', en: 'Pitch and passages' },
  'recording.chartSeek': { zh: '音高曲线时间位置，左右箭头每次移动一秒', en: 'Pitch-curve time position. Arrow keys move one second.' },
  'recording.chartHint': { zh: '绿色是演唱，灰色是参考，黄色标记问题片段。点击曲线定位；键盘左右箭头移动一秒。', en: 'Green is your singing, grey is the reference, yellow marks passages. Click to seek; arrow keys move one second.' },
  'recording.noReference': { zh: '未提供参考：这些结果描述人声本身，不判断歌词音符是否唱对。', en: 'No reference provided: these findings describe the voice itself, not whether the intended notes were sung correctly.' },
  'recording.comparison.ready': { zh: '已确认对齐，可以比较。', en: 'Alignment confirmed; comparison is available.' },
  'recording.comparison.unscored': { zh: '参考曲线仅供试听核对，暂不给分。', en: 'Use the reference curve to check alignment by listening. No score yet.' },
  'recording.comparison.rejected': { zh: '这份参考不满足可靠比较条件，暂不给分。', en: 'This reference does not support a reliable comparison. No score is given.' },
  'recording.comparisonReason.alignmentUntrusted': { zh: '时间对齐尚未确认', en: 'Time alignment unconfirmed' },
  'recording.comparisonReason.selfComparison': { zh: '演唱与参考是同一份声音', en: 'Singing and reference contain the same audio' },
  'recording.comparisonReason.referenceInsufficient': { zh: '参考有效人声不足', en: 'Insufficient reference vocals' },
  'recording.comparisonReason.performanceInsufficient': { zh: '演唱有效人声不足', en: 'Insufficient singing vocals' },
  'recording.comparisonReason.sourceUnverified': { zh: '录音来源不满足比较条件', en: 'Vocal source unsuitable for comparison' },
  'recording.comparisonReason.referenceInconsistent': { zh: '参考旋律与演唱不一致', en: 'Reference melody inconsistent with the singing' },
  'recording.comparisonReason.insufficientOverlap': { zh: '可对齐的片段不足', en: 'Too little overlapping material' },
  'recording.comparisonReason.insufficientCoverage': { zh: '有效匹配覆盖不足', en: 'Insufficient matching coverage' },
  'recording.fullDetails': { zh: '完整分段与统计', en: 'All passages and statistics' },
  'recording.range': { zh: '稳健音域', en: 'Robust range' },
  'recording.medianNote': { zh: '中心音高', en: 'Median pitch' },
  'recording.stableCount': { zh: '可比较持续音', en: 'Comparable held notes' },
  'recording.matchedTime': { zh: '有效比较时长', en: 'Matched duration' },
  'recording.eligibleReferenceTime': { zh: '共同范围内有效参考', en: 'Usable reference in overlap' },
  'recording.comparisonCoverage': { zh: '有效配对覆盖', en: 'Valid pairing coverage' },
  'recording.unmatchedReferenceTime': { zh: '未配对参考时长', en: 'Unmatched reference duration' },
  'recording.medianDeviation': { zh: '偏差中位数', en: 'Median deviation' },
  'recording.segment': { zh: '时间片段', en: 'Passage' },
  'recording.segmentFindings': { zh: '观察', en: 'Observations' },
  'recording.allObservations': { zh: '全部观察（含短片段）', en: 'All observations, including short passages' },
  'recording.evidence': { zh: '观察依据', en: 'Observed evidence' },
  'recording.prepareTitle': { zh: '含伴奏录音？先在本地准备人声', en: 'Recording includes a backing track? Prepare vocals locally' },
  'recording.prepareDescription': { zh: '网页只分析导入的人声或报告。项目本地工具会分离含伴奏录音并生成报告；如需对比，可在命令后加 --reference "reference.m4a"。', en: 'This page analyzes imported vocals or reports. The local project tool separates mixed recordings and generates reports. Add --reference "reference.m4a" to compare an independent reference.' },
  'recording.prepareCommand': { zh: '在项目目录运行（替换为自己的文件名）', en: 'Run in the project folder, replacing the example filename' },
  'recording.prepareOutput': { zh: '首次使用需安装 ffmpeg 并准备依赖与模型。结果留在 stems/private/ 中；导入 analysis.json 查看报告，再选择报告对应的 vocals.wav 回听。', en: 'First use requires ffmpeg and dependency/model preparation. Results stay in stems/private/. Import analysis.json to view the report, then choose its matching vocals.wav to listen.' },
  'recording.copy': { zh: '复制命令', en: 'Copy command' },
  'recording.copied': { zh: '已复制', en: 'Copied' },
  'recording.copyFallback': { zh: '复制不可用，命令已选中，可手动复制。', en: 'Clipboard access is unavailable. The command is selected for manual copying.' },
  'recording.metric.driftCents': { zh: '音高变化', en: 'Pitch change' },
  'recording.metric.slopeCentsPerSec': { zh: '变化速度', en: 'Pitch trend per second' },
  'recording.metric.durationSec': { zh: '时长', en: 'Duration' },
  'recording.metric.residualSpreadCents': { zh: '去趋势音高波动', en: 'Pitch spread after removing trend' },
  'recording.metric.levelDropDb': { zh: '尾音音量变化', en: 'Ending level change' },
  'recording.metric.pitchDriftCents': { zh: '尾音音高变化', en: 'Ending pitch change' },
  'recording.metric.medianCents': { zh: '偏差中位数', en: 'Median deviation' },
  'recording.metric.absMedianCents': { zh: '绝对偏差中位数', en: 'Median absolute deviation' },
  'recording.metric.inTuneRatio': { zh: '音高匹配', en: 'Pitch match' },
  'recording.metric.comparedSec': { zh: '比较时长', en: 'Matched duration' },
  'recording.metric.offsetMs': { zh: '局部起音偏差', en: 'Local note-start difference' },
  'recording.metric.referenceTime': { zh: '参考起音时间', en: 'Reference start' },
  'recording.metric.performanceTime': { zh: '演唱起音时间', en: 'Singing start' },
  'recording.metric.repetitions': { zh: '重复片段', en: 'Repeated passages' },
  'recording.metric.meanTailDropDb': { zh: '尾音平均音量变化', en: 'Mean ending level change' },
  'recording.metric.meanPitchDriftCents': { zh: '平均音高变化', en: 'Mean pitch change' },
  'recording.metric.highRegionCount': { zh: '高音片段数', en: 'Higher-note passages' },
  'recording.metric.baselineH1H2Db': { zh: '对照 H1−H2', en: 'Baseline H1−H2' },
  'recording.metric.highH1H2Db': { zh: '高音 H1−H2', en: 'Higher-note H1−H2' },
  'recording.metric.baselineRmsDb': { zh: '对照音量', en: 'Baseline level' },
  'recording.metric.highRmsDb': { zh: '高音音量', en: 'Higher-note level' },
  'recording.metric.observedH1H2Db': { zh: '观察 H1−H2', en: 'Observed H1−H2' },
  'recording.metric.baselineHarmonicRatio': { zh: '对照谐波占比', en: 'Baseline harmonic ratio' },
  'recording.metric.observedHarmonicRatio': { zh: '观察谐波占比', en: 'Observed harmonic ratio' },
  'recording.metric.octaveDifferenceRatio': { zh: '近八度差占比', en: 'Near-octave difference ratio' },
  'recording.metric.octaveShiftSemitones': { zh: '可能的八度变化（半音）', en: 'Possible octave shift (semitones)' },
  // ---------- 组件化工作台 ----------
  'ui.studio': { zh: '歌声练功房', en: 'Vocal Studio' },
  'ui.localAudio': { zh: '音频仅在本机处理', en: 'Audio stays on your device' },
  'ui.octaveLabel': { zh: '音名基准', en: 'Note convention' },
  'ui.octaveC4': { zh: '中央 C = C4', en: 'Middle C = C4' },
  'ui.octaveC3': { zh: '中央 C = C3', en: 'Middle C = C3' },
  'ui.language': { zh: '界面语言', en: 'Language' },
  'ui.installApp': { zh: '安装到本机', en: 'Install app' },
  'ui.installTitle': { zh: '安装为本地应用，用独立窗口打开（Chrome / Edge 菜单里的「安装」同样可用）', en: 'Install as a local app that opens in its own window (Chrome / Edge also offer Install in the browser menu)' },
  'ui.installIos': { zh: '在 Safari 的分享菜单里选择「添加到主屏幕」，就能像本地 App 一样打开。', en: 'In Safari, open the Share menu and choose “Add to Home Screen” to open it like a local app.' },
  'ui.tunerTitle': { zh: '音准仪', en: 'Pitch tuner' },
  'ui.tunerSubtitle': { zh: '看见音高，找到更稳的声音。', en: 'See your pitch. Find a steadier voice.' },
  'ui.realtime': { zh: '实时音高', en: 'Real-time pitch' },
  'ui.currentNote': { zh: '当前音高', en: 'Current pitch' },
  'ui.gaugeLabel': { zh: '音分偏差表盘', en: 'Pitch deviation in cents' },
  'ui.flat': { zh: '偏低', en: 'Flat' },
  'ui.inTune': { zh: '准确', en: 'In tune' },
  'ui.sharp': { zh: '偏高', en: 'Sharp' },
  'ui.signal': { zh: '信号清晰度', en: 'Signal clarity' },
  'ui.yourVoice': { zh: '你的声音', en: 'Your voice' },
  'ui.pitchEmpty': { zh: '启用麦克风，开始哼唱', en: 'Turn on the mic and start humming' },
  'ui.pitchEmptyHint': { zh: '试着把音高曲线唱成一条平稳的线', en: 'Try to hold a smooth, steady pitch line' },
  'ui.recentPitch': { zh: '最近 9 秒', en: 'Last 9 seconds' },
  'ui.semitone': { zh: '每格一个半音', en: 'One semitone per row' },
  'ui.tunerTip': { zh: '先轻声哼唱，再练长音。感觉喉咙不适时，请停下来休息。', en: 'Hum softly, then hold a note. Take a break if your throat feels uncomfortable.' },
  'ui.tunerHelp': { zh: '读懂音准仪与音名基准', en: 'Understanding the tuner and note convention' },
  'ui.footer': { zh: '开源唱歌训练工具 · 无需注册 · 练习记录保存在本机', en: 'Open-source vocal practice · No account needed · Practice history stays on this device' },
  'ui.skip': { zh: '跳到练习区', en: 'Skip to practice' },
  'ui.spectrumEmpty': { zh: '启用麦克风，探索你的音色', en: 'Turn on the mic to explore your tone' },
  'ui.spectrumEmptyHint': { zh: '唱一个长音，观察基频与谐波', en: 'Hold a note to see the fundamental and harmonics' },
  'practice.subtitle': { zh: '选择练习，先听示范，再跟唱。', en: 'Choose an exercise, listen, then sing.' },
  'k.subtitle': { zh: '导入歌曲，跟着旋律练准每一句。', en: 'Import a song and practise each line in tune.' },
  'k.echoShort': { zh: '外放模式', en: 'Speaker mode' },
  'k.echoFailed': { zh: '无法切换外放模式，请停止录音后重试。', en: 'Unable to change speaker mode. Stop listening and try again.' },
  'k.lyricsTitle': { zh: '歌词（可选）', en: 'Lyrics (optional)' },
  'spectrum.subtitle': { zh: '观察音色变化，轻松探索自己的声音。', en: 'Observe your tone and explore your voice.' },
  'learn.subtitle': { zh: '从呼吸、音准到共鸣，按自己的节奏练习。', en: 'Practise breathing, pitch and resonance at your own pace.' },
  // ---------- 通用 / 页头 ----------
  'app.title': { zh: 'MusicMaster · 歌声练功房', en: 'MusicMaster · Vocal Studio' },
  'app.description': {
    zh: '纯浏览器端的唱歌基本功练习工具：实时音高分析、跟唱评分、共鸣频谱探索与入门课程。所有数据不离开你的设备。',
    en: 'A browser-only vocal training tool: real-time pitch analysis, sing-along scoring, resonance spectrum, and beginner lessons. Your data never leaves your device.',
  },
  'mic.enable': { zh: '启用麦克风', en: 'Enable microphone' },
  'mic.stop': { zh: '停止录音', en: 'Stop listening' },
  'mic.requesting': { zh: '正在请求权限…', en: 'Requesting permission…' },
  'mic.listening': { zh: '正在监听 · 对着麦克风哼 "wu——" 试试', en: 'Listening · try humming "woo—" into the mic' },
  'mic.privacy': { zh: '麦克风未启用 · 音频仅在本机处理', en: 'Microphone off · Audio is processed locally' },

  // ---------- 选项卡 ----------
  'tab.tuner': { zh: '音准仪', en: 'Tuner' },
  'tab.practice': { zh: '跟唱练习', en: 'Exercises' },
  'tab.karaoke': { zh: 'K歌跟唱', en: 'Sing-along' },
  'tab.spectrum': { zh: '共鸣与频谱', en: 'Spectrum' },
  'tab.learn': { zh: '入门课程', en: 'Lessons' },

  // ---------- 音准仪 ----------
  'tuner.clarityHint': { zh: '清晰度越高，音高检测越可靠。轻声哼 "wu——" 通常最稳定。', en: 'Higher clarity means more reliable pitch detection. A soft "woo—" hum is usually the steadiest.' },
  'tuner.clarityTitle': { zh: '信号清晰度（泛音周期性强度）', en: 'Signal clarity (strength of harmonic periodicity)' },
  'tuner.curveTitle': { zh: '音高曲线', en: 'Pitch curve' },
  'tuner.curveHint': { zh: '横轴是时间，纵轴是音高（每格一个半音）。试着唱一条平稳直线，再试试滑音。', en: 'Time runs left to right; pitch runs bottom to top (one semitone per row). Try holding a steady line, then a glide.' },
  'octave.label': { zh: '音名八度基准', en: 'Note-name octave base' },
  'octave.hint': { zh: '同一个音在不同软件里八度编号可能差一位。选和你的琴/软件一致的那项，界面上所有音名都会跟着变；音高检测本身不受影响。', en: 'The same note can be numbered one octave apart in different software. Pick the one that matches your instrument or DAW; every note name in the app follows, and pitch detection itself is unaffected.' },
  'octave.helpLi1': { zh: '约 131 Hz', en: '~131 Hz' },
  'octave.helpLi1b': { zh: '男声常用的低音 C（GarageBand 里叫 C3，Cubase 里叫 C2）', en: 'the low C used in male voices (C3 in GarageBand, C2 in Cubase)' },
  'octave.helpLi2': { zh: '约 262 Hz', en: '~262 Hz' },
  'octave.helpLi2b': { zh: '中央 C，也就是钢琴正中间那个 C（GarageBand 里叫 C4，Cubase 里叫 C3）', en: 'middle C, the C in the middle of the piano (C4 in GarageBand, C3 in Cubase)' },
  'octave.helpLi3': { zh: '约 440 Hz', en: '~440 Hz' },
  'octave.helpLi3b': { zh: '标准音 A', en: 'the reference pitch A' },
  'octave.helpP2': { zh: '用你的琴弹一个音，看这里显示的 Hz 是否和上面一致。若你的软件把中央 C 写作 C3，就选第二项，两边就对齐了。', en: 'Play a note on your instrument and check whether the Hz shown here matches. If your software calls middle C "C3", choose the second option and the two will agree.' },
  'octave.toastC3': { zh: '已切换：C3 为中央 C（Cubase/MuseScore 习惯）', en: 'Switched: C3 is middle C (Cubase/MuseScore convention)' },
  'octave.toastC4': { zh: '已切换：C4 为中央 C（GarageBand/Logic 习惯）', en: 'Switched: C4 is middle C (GarageBand/Logic convention)' },

  // ---------- 跟唱练习 ----------
  'practice.keyLabel': { zh: '选择调性', en: 'Choose key' },
  'practice.keyHint': { zh: '音高偏高或偏低都可以换调，选你唱着最舒服的。', en: 'If the notes sit too high or too low, change key and pick what feels comfortable.' },
  'practice.stop': { zh: '结束练习', en: 'End exercise' },
  'practice.ready': { zh: '准备', en: 'Ready' },
  'practice.listen': { zh: '🔊 听示范音', en: '🔊 Listen' },
  'practice.sing': { zh: '🎤 唱！', en: '🎤 Sing!' },
  'practice.done': { zh: '完成', en: 'Done' },
  'practice.stopped': { zh: '已停止', en: 'Stopped' },
  'practice.start': { zh: '▶ 开始练习', en: '▶ Start exercise' },
  'practice.again': { zh: '再练一次', en: 'Practise again' },
  'range.title': { zh: '音域测试', en: 'Range test' },
  'range.desc': { zh: '在舒适范围内，先唱你最低的音、再唱最高的音（可以分次）。工具会记录你能稳定发出的音域。', en: 'Within a comfortable range, sing your lowest note then your highest (separate takes are fine). The tool records the range you can produce steadily.' },
  'range.start': { zh: '开始记录', en: 'Start recording' },
  'range.clear': { zh: '清除', en: 'Clear' },
  'range.empty': { zh: '尚未记录。录音开始后随便哼唱即可。', en: 'Nothing recorded yet. Just hum once you turn the mic on.' },
  'history.title': { zh: '练习记录', en: 'Practice history' },
  'history.empty': { zh: '还没有练习记录，完成一次跟唱练习后会自动保存在本机。', en: 'No practice records yet. Finish one exercise and it will be saved on this device.' },

  // ---------- 共鸣与频谱 ----------
  'spectrum.title': { zh: '实时频谱', en: 'Live spectrum' },
  'spectrum.fundamental': { zh: '基频', en: 'Fundamental' },
  'spectrum.hint': { zh: '纵轴是能量，横轴是频率（对数刻度）。唱歌时能看到基频和一串谐波峰。', en: 'Vertical axis is energy, horizontal is frequency (log scale). When you sing you can see the fundamental and a series of harmonic peaks.' },
  'metric.centroid': { zh: '频谱质心', en: 'Spectral centroid' },
  'metric.centroidDesc': { zh: '声音的"明亮度"重心，Hz', en: 'Centre of gravity of brightness, in Hz' },
  'metric.sf': { zh: '歌手共振峰', en: "Singer's formant" },
  'metric.sfDesc': { zh: '2.5–3.5kHz 能量占比；歌声"穿透力"的代理', en: 'Share of energy at 2.5–3.5 kHz; a proxy for vocal "ring"' },
  'metric.h1h2': { zh: 'H1−H2（声区倾向）', en: 'H1−H2 (register tendency)' },
  'metric.h1h2Desc': { zh: '前两谐波幅度差 dB；同音高下：数值小偏胸声，大偏头声', en: 'Level difference between the first two harmonics, in dB. At the same pitch: smaller leans chest voice, larger leans head voice' },
  'metric.lh': { zh: '低/高频能量比', en: 'Low/high energy ratio' },
  'metric.lhDesc': { zh: 'dB；越高越低沉厚重，越低越明亮', en: 'dB; higher is darker and heavier, lower is brighter' },
  'metric.hnr': { zh: '谐波占比', en: 'Harmonic ratio' },
  'metric.hnrDesc': { zh: '周期性谐波能量比例；气声多会变低', en: 'Proportion of periodic harmonic energy; drops with breathiness' },
  'exp.title': { zh: '小实验：感受胸声与头声', en: 'Try this: feel chest voice and head voice' },
  'exp.li1': { zh: "<span>用平时说话的感觉唱一个低音（比如 C3–G3 附近的 \"wu\"），这是偏<strong>胸声</strong>的发声：观察低/高频能量比通常较高、质心较低。</span>", en: "<span>Sing a low note the way you speak (say \"woo\" around C3–G3). This is towards <strong>chest voice</strong>: the low/high energy ratio is usually higher and the centroid lower.</span>" },
  'exp.li2': { zh: "<span>再用轻飘飘、像吹口哨的感觉唱高八度，这是偏<strong>头声</strong>的发声：能量比通常会下降、谐波占比可能更纯净。</span>", en: "<span>Then sing an octave up, light and whistle-like. This is towards <strong>head voice</strong>: the energy ratio usually drops and the harmonics may sound purer.</span>" },
  'exp.li3': { zh: '最后尝试在两者之间平滑滑动（滑音），找到不"破音"的过渡——这就是混声要训练的东西。', en: 'Finally glide smoothly between them to find the transition where your voice does not crack — that is exactly what mixing trains.' },
  'exp.note': { zh: '说明：胸声/头声在声学上没有单一的判定指标，这里的数值是帮助你建立直觉的近似参考，不是医学或声乐诊断。', en: 'Note: there is no single acoustic measure that decides chest versus head voice. These numbers are approximate guides to build intuition, not a medical or vocal diagnosis.' },

  // ---------- K歌跟唱 ----------
  'k.title': { zh: 'K歌跟唱', en: 'Sing-along' },
  'k.desc1': { zh: '选一首歌（BGM 或原唱），浏览器会在本地分析出它的旋律线，然后你跟着唱，工具实时对比你和原唱的每个音，唱完给出逐句指导。', en: 'Pick a song (backing track or the original), and the browser extracts its melody line locally. Sing along and the tool compares every note with the original in real time, then gives line-by-line coaching.' },
  'k.desc2': { zh: '音频只在你的浏览器内存里，不会上传，也不会保存在本机。', en: 'Audio stays in your browser memory only. It is never uploaded and never saved to this device.' },
  'k.prepare': { zh: '准备中…', en: 'Preparing…' },
  'k.play': { zh: '▶ 开始跟唱', en: '▶ Start singing' },
  'k.pause': { zh: '⏸ 暂停', en: '⏸ Pause' },
  'k.restart': { zh: '↺ 重唱', en: '↺ Restart' },
  'k.volume': { zh: '伴奏音量', en: 'Track volume' },
  'k.echo': { zh: '外放模式（回声消除，建议戴耳机时关闭）', en: 'Speaker mode (echo cancellation; turn off if you wear headphones)' },
  'k.hintIdle': { zh: '选择歌曲、启用麦克风，即可跟唱。戴耳机时关闭外放模式。', en: 'Choose a song and enable the mic to sing along. Turn off speaker mode when using headphones.' },
  'k.hintLive': { zh: '正在跟唱 · 灰色是原唱旋律，你的点越靠线越准。', en: 'Singing · the grey line is the original melody; the closer your dots sit to it, the more in tune you are.' },
  'k.hintDone': { zh: '唱完了。看下面的报告，针对最弱的那一句再练十遍。', en: 'Done. Check the report below and drill the weakest line ten more times.' },
  'k.timeLabel': { zh: '分', en: 'pts' },
  'k.statusTitle': { zh: '实时状态', en: 'Live status' },
  'k.refNote': { zh: '参考音', en: 'Reference' },
  'k.myNote': { zh: '你的音', en: 'You' },
  'k.centsDiff': { zh: '音分差', en: 'Cents off' },
  'k.micLevel': { zh: '麦克风', en: 'Microphone' },
  'k.lyricEmpty': { zh: '（上传 .lrc 歌词后，会在这里逐句显示）', en: '(Upload an .lrc file and each line will appear here)' },
  'k.lrcBtn': { zh: '添加歌词 .lrc', en: 'Add lyrics .lrc' },
  'k.pickTitle': { zh: '选择歌曲', en: 'Choose a song' },
  'k.pickBtn': { zh: '选择本地音频', en: 'Choose local audio' },
  'k.pickInfo': { zh: '支持 mp3 / m4a / wav / flac。文件不会离开你的设备。', en: 'Supports mp3 / m4a / wav / flac. The file never leaves your device.' },
  'k.pickWarning': { zh: '用「带人声的歌曲」效果最好，因为工具要听出原唱的旋律；纯伴奏因为没有清晰主旋律，分析结果可能不准。', en: 'Songs with vocals work best, because the tool needs to hear the original melody. A pure backing track has no clear lead line, so the analysis may be unreliable.' },
  'k.canvasCaption': { zh: '灰色线是参考音高，彩色点是你唱的音；点在线上方表示唱高、下方表示唱低。绿=准，黄=接近，红=偏。', en: 'The grey line is the reference pitch; coloured dots are your notes. Above the line means sharp, below means flat. Green = in tune, amber = close, red = off.' },
  'k.canvasEmpty': { zh: '选择歌曲后，这里会出现原唱旋律线和你的音高轨迹', en: 'Pick a song and the original melody plus your pitch trail will appear here' },
  'k.nextLyric': { zh: '下一句：', en: 'Next: ' },
  'k.guideTitle': { zh: '怎么练才有效', en: 'How to actually improve' },
  'k.guideLi1': { zh: '戴耳机：手机上外放的话，工具会把伴奏也当成你的声音，评分就失真了。', en: 'Use headphones: on a phone speaker the tool hears the backing track as your voice and the score becomes meaningless.' },
  'k.guideLi2': { zh: '第一遍别用力，先轻声跟一遍，让工具判断"偏高"还是"偏低"。', en: 'Do not push on the first pass. Sing quietly so the tool can tell whether you run sharp or flat.' },
  'k.guideLi3': { zh: '第二遍只练报告里点出的最难那一句，循环十次，再连起来唱。', en: 'On the second pass practise only the hardest line the report flagged, ten times in a loop, then sing it through.' },
  'k.guideLi4': { zh: '拿到 80 分以上，把这首歌放到「共鸣与频谱」里看胸声/头声倾向，检验高音是不是硬挤出来的。', en: 'Once you score above 80, check the song in "Spectrum" to see your chest/head tendency and whether the high notes are being squeezed out.' },
  'k.guideNote': { zh: '说明：本工具的参考旋律是从你的音频里自动提取的，可能受伴奏影响；评分和指导是练习参考，不是声乐或医学诊断。', en: 'Note: the reference melody is extracted automatically from your audio and may be affected by the accompaniment. Scores and coaching are practice guidance, not a vocal or medical diagnosis.' },
  'k.toastNeedSong': { zh: '请先点击「选择本地音频」导入歌曲', en: 'Import a song with "Choose local audio" first' },
  'k.toastNeedMic': { zh: '请先启用麦克风，才能分析你的声音', en: 'Enable the microphone first to analyze your voice' },
  'k.toastLrc': { zh: '🎵 已载入 {n} 行歌词，唱完会逐句给分', en: '🎵 Loaded {n} lyric lines; you will get per-line scores after singing' },
  'k.toastReady': { zh: '✅ 旋律线已提取完成，点「开始跟唱」', en: '✅ Melody extracted. Hit "Start singing"' },
  'k.decode': { zh: '正在解码「{name}」…', en: 'Decoding "{name}"…' },
  'k.extracting': { zh: '提取旋律 {p}%…（长歌曲需要十几秒）', en: 'Extracting melody {p}%… (a long song takes a few tens of seconds)' },
  'k.ready': { zh: '已就绪：{name}（{dur}，检测到 {sec} 秒人声旋律）', en: 'Ready: {name} ({dur}, {sec}s of vocal melody detected)' },
  'k.loadFail': { zh: '分析失败：{msg}', en: 'Analysis failed: {msg}' },
  'k.loadFailToast': { zh: '加载失败：{msg}', en: 'Load failed: {msg}' },
  'k.noMelody': { zh: '几乎没提取到稳定旋律。这首可能是纯伴奏或纯打击乐，请换成带人声的版本。', en: 'Almost no stable melody was found. This may be a pure backing track or percussion; try a version with vocals.' },
  'k.donePct': { zh: '完成！点「开始跟唱」开唱', en: 'Done! Hit "Start singing"' },
  'k.jumpToast': { zh: '已跳到 {time}，从这一句开始重唱', en: 'Jumped to {time}; sing again from this line' },
  'k.reportTitle': { zh: '🎧 本次跟唱报告', en: '🎧 Sing-along report' },
  'k.statPitch': { zh: '音准', en: 'In tune' },
  'k.statAvgDev': { zh: '平均偏差', en: 'Mean deviation' },
  'k.statTendency': { zh: '整体倾向', en: 'Overall tendency' },
  'k.statWobble': { zh: '波动', en: 'Wobble' },
  'k.statCoverage': { zh: '覆盖率', en: 'Coverage' },
  'k.reportTips': { zh: '练习建议', en: 'Coaching' },
  'k.reportSegs': { zh: '最需要单独练的片段（点击可跳过去重唱）', en: 'Lines that need the most work (tap to jump and retry)' },
  'k.noLyric': { zh: '（无歌词）', en: '(no lyrics)' },
  'k.singHere': { zh: '从这里唱', en: 'Sing from here' },

  // ---------- K歌练习建议（按统计生成） ----------
  'tip.tooShort': { zh: '唱到的片段太短，先完整跟唱一段（30 秒以上）再来看指导。', en: 'The captured stretch is too short. Sing a full section (30 seconds or more) and then check the coaching.' },
  'tip.noVoice': { zh: '麦克风没怎么听到你的声音（可能没开口，或者被伴奏盖住了）。建议戴耳机、把伴奏音量调到能听见自己，再把麦克风靠近一些，重新唱一遍。', en: 'The microphone barely heard you (maybe you did not sing, or the track drowned you out). Use headphones, set the volume so you can hear yourself, move closer to the mic, and try again.' },
  'tip.octaveUp': { zh: '你的音整体比原唱高了一个八度以上，说明这首歌对你偏低。可以整体升 key 唱，或者直接用胸声往下压着唱。', en: 'You are singing more than an octave above the original, so the song sits low for you. Raise the key, or deliberately press down with chest voice.' },
  'tip.octaveDown': { zh: '你的音整体比原唱低了一个八度以上，说明副歌的高音超出了你目前的音域。建议先降 key、用头声轻声把高音带过去，别硬喊。', en: 'You are singing more than an octave below the original, so the chorus sits above your current range. Lower the key and carry the high notes lightly in head voice instead of shouting.' },
  'tip.octaveExtra': { zh: '先用「跟唱练习」把这首歌的最高音和最低音单独哼几遍，确认自己能稳定发出，再回来整首跟唱。', en: 'Hum the highest and lowest notes of this song separately in "Exercises" until they are steady, then come back and sing the whole thing.' },
  'tip.flat': { zh: '整体偏低约 {n} 音分。练法：跟着伴奏先只唱每句的最后一个长音，用钢琴或本工具的音准仪定住，再回到整句；起句时稍微"往上顶"一点，不要一开口就松。', en: 'You run about {n} cents flat overall. Practise the last long note of each line against a piano or the tuner, then sing the whole line. Aim slightly high when you start a phrase instead of relaxing immediately.' },
  'tip.sharp': { zh: '整体偏高约 {n} 音分。练法：很多人一紧张就越唱越高。试试把音量降一点、气息放稳，先轻声哼一遍找准高度再放声。', en: 'You run about {n} cents sharp overall. Many singers drift up when nervous. Lower the volume, steady your breath, hum through once to find the height, then sing out.' },
  'tip.stable': { zh: '整体音高很稳（平均偏差 {n} 音分），方向感没问题，可以开始练长音的稳定度和换气。', en: 'Your overall pitch is steady (mean deviation {n} cents). Your sense of direction is fine, so start working on long-note steadiness and breath planning.' },
  'tip.unsystematic': { zh: '没有系统性偏高或偏低，但每个字落点不够准。建议放慢到 0.75 倍速，先唱准再恢复原速。', en: 'There is no systematic sharpness or flatness, but each note lands imprecisely. Slow the track to 0.75× and only return to full speed once it is accurate.' },
  'tip.wobble': { zh: '音高波动较大（±{n} 音分）。多练长音（一口气唱 6-8 秒同一个音），把曲线唱成直线再唱歌词。', en: 'Your pitch wobbles a lot (±{n} cents). Practise long notes (6–8 seconds on a single pitch) until the curve is a straight line, then add words.' },
  'tip.octaveFrames': { zh: '有 {n} 帧和原唱差了一个八度以上，通常是这首歌超出了你目前的舒适音域。可以换调唱，或者用假声/头声把高音部分带过去。', en: '{n} frames sit more than an octave away from the original, which usually means the song exceeds your comfortable range. Change key, or carry the high part in falsetto/head voice.' },
  'tip.worstSeg': { zh: '最需要单独练的是 {label}（约 {t}s 处，音准 {acc}%）。把这一句单独循环 10 遍，唱对了再连起来。', en: 'The part that needs the most work is {label} (around {t}s, {acc}% accurate). Loop that line ten times, then sing it in context.' },
  'tip.worstNear': { zh: '{t}s 附近', en: 'around {t}s' },
  'tip.keepGoing': { zh: '继续保持，可以尝试更难的歌或提高对自己的要求。', en: 'Keep going — try a harder song or raise your own bar.' },

  // ---------- 练习 / 音域 / 错误提示 ----------
  "ex.best": { zh: "最好成绩 {n} 分", en: "Best {n} pts" },
  "ex.points": { zh: " 分", en: " pts" },
  "ex.stable": { zh: "稳 {v}¢", en: "steadiness {v}¢" },
  "ex.summary": { zh: "完成 {sung}/{steps} 个音。", en: "Sang {sung}/{steps} notes. " },
  "ex.notHeard": { zh: "{note} 没听清你的声音", en: "Could not hear you on {note}" },
  "summary.85": { zh: "非常棒！音准和稳定性都很出色，可以试试更高难度或换个调。", en: "Excellent! Both pitch and steadiness are strong. Try a harder exercise or a different key." },
  "summary.70": { zh: "不错！大部分音都唱准了，注意个别偏低/偏高的音。", en: "Nice work. Most notes landed; watch the few that went flat or sharp." },
  "summary.50": { zh: "有进步空间。跟着示范音慢一些唱，先求准再求稳。", en: "Room to grow. Sing with the reference more slowly — accuracy first, steadiness second." },
  "summary.low": { zh: "没关系，初学者大多从这里开始。先练「单音模唱」，每次只专注于一个音。", en: "That is normal; most beginners start here. Practise \"Match a single note\" and focus on one pitch at a time." },
  "range.result": { zh: "你的可用音域大约是 <b>{lo}</b> — <b>{hi}</b>（约 {n} 个半音）。普通人的舒适音域一般在 12–18 个半音，练声可以逐步扩展。", en: "Your working range is about <b>{lo}</b> — <b>{hi}</b> (roughly {n} semitones). Most untrained singers have a comfortable range of 12–18 semitones; practice extends it gradually." },
  "range.tooFew": { zh: "采集到的有效声音太少，再试一次（唱清楚一点、时间长一点）。", en: "Too little usable sound was captured. Try again — sing more clearly and for longer." },
  "history.item": { zh: "{sung}/{steps} 音", en: "{sung}/{steps} notes" },
  "toast.needMic": { zh: "请先启用麦克风", en: "Enable the microphone first" },
  "toast.micOn": { zh: "🎙️ 麦克风已开启，开始唱吧！", en: "🎙️ Microphone is on — start singing!" },
  "micErr.generic": { zh: "无法访问麦克风。", en: "Cannot access the microphone." },
  "micErr.https": { zh: "浏览器只允许在 HTTPS 或 localhost 下使用麦克风，请通过 GitHub Pages 地址访问。", en: "Browsers only allow microphone access over HTTPS or localhost. Please use the GitHub Pages address." },
  "micErr.denied": { zh: "麦克风权限被拒绝。请点击地址栏左侧的锁形图标，允许麦克风后重试。", en: "Microphone permission was denied. Click the lock icon in the address bar, allow the microphone, and try again." },
  "micErr.noDevice": { zh: "没有检测到麦克风设备。", en: "No microphone device was detected." },

  "learn.weekTitle": { zh: "🗓️ 入门四周计划", en: "🗓️ Four-week starter plan" },
  "learn.weekSub": { zh: "每天 10–15 分钟即可，贵在坚持。练习前后各喝温水，嗓子疼就休息。", en: "Ten to fifteen minutes a day is enough — consistency matters more. Drink warm water before and after, and rest if your throat hurts." },
  "unit.cents": { zh: "音分", en: "cents" },
  "k.decoded": { zh: "已解码 {sec} 秒音频，正在逐帧提取旋律…", en: "Decoded {sec}s of audio; extracting melody frame by frame…" },
  "tuner.solfege": { zh: "唱名 ", en: "solfege " },
  "range.stop": { zh: "停止并查看结果", en: "Stop and see result" },
  "range.recording": { zh: "记录中……先哼一个最低的音，再哼一个最高的音。", en: "Recording… hum your lowest note first, then your highest." },
  "k.lrcLoaded": { zh: "已载入 {n} 行歌词；{name}。", en: "Loaded {n} lyric lines; {name}." },
  "k.historyPrefix": { zh: "K歌：", en: "Sing-along: " },
  "k.pairTitle": { zh: "伴奏（可选）", en: "Backing track (optional)" },
  "k.pairDesc": { zh: "单文件混音里伴奏会盖住人声，旋律提取率只有约 10%。再上传一份<strong>同样的伴奏</strong>，工具会自动对齐时间轴并把伴奏减掉，得到干净人声——实测人声段旋律覆盖率能从 12% 提到 100%。", en: "In a single mix the backing track masks the voice and melody extraction only recovers about 10%. Upload the <strong>matching backing track</strong> too and the tool aligns the timeline and subtracts it to get a clean vocal — measured coverage in vocal sections goes from 12% to 100%." },
  "k.pairBtn": { zh: "添加伴奏", en: "Add backing track" },
  "k.pairIdle": { zh: "未使用伴奏时按单文件模式分析。", en: "Without a backing track the tool analyses the single file." },
  "k.pairWorking": { zh: "正在对齐并相减「{name}」…", en: "Aligning and subtracting \"{name}\"…" },
  "k.pairOk": { zh: "精准模式已就绪：延迟 {ms}ms，增益 {g}，相减质量 {snr}dB（人声段覆盖率 {cov}%）。", en: "Precise mode ready: delay {ms}ms, gain {g}, subtraction {snr}dB (vocal coverage {cov}%)." },
  "k.pairPoor": { zh: "两个文件可能不是同一版本（对齐相关度偏低）。相减后质量可能反而更差，建议换成同一版本的伴奏。", en: "These two files may not be the same version (low alignment correlation). Subtraction may make things worse — try the matching backing track." },
  "k.pairFail": { zh: "伴奏处理失败：{msg}，已退回单文件模式。", en: "Backing track failed: {msg}. Falling back to single-file mode." },
  "k.pairSel": { zh: "已选择伴奏「{name}」，选好原唱后会自动相减分析。", en: "Backing track \"{name}\" selected; it will be subtracted once you pick the original." },
  // ---------- 课程 ----------
};

let currentLang = 'zh';
const listeners = [];

export function getLang() { return currentLang; }

export function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (err) { /* 隐私模式 */ }
  const nav = (navigator.language || 'zh').toLowerCase();
  return nav.startsWith('zh') ? 'zh' : 'en';
}

/** 取文案；支持 {name} 形式的插值。缺失的键回退到中文，再回退到键本身。 */
export function t(key, vars) {
  const entry = DICT[key];
  let s = entry ? (entry[currentLang] != null ? entry[currentLang] : entry.zh) : key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  }
  return s;
}

/** 双语内联：直接给两种语言的字符串，按当前语言取。 */
export function L(zh, en) { return currentLang === 'en' ? en : zh; }

export function onLangChange(fn) { listeners.push(fn); }

export function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') return;
  currentLang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* ignore */ }
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  applyI18n(document);
  for (const fn of listeners) {
    try { fn(lang); } catch (err) { console.error(err); }
  }
}

export function initI18n() {
  currentLang = detectLang();
  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';
  applyI18n(document);
  return currentLang;
}

/**
 * 扫描 DOM 并替换文案。
 * data-i18n            -> textContent
 * data-i18n-html       -> innerHTML（用于含 <b> 等标记的段落）
 * data-i18n-attr       -> "attr:key,attr:key"，例如 "placeholder:foo,title:bar"
 */
export function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) el.innerHTML = t(key);
  });
  scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const spec = el.getAttribute('data-i18n-attr');
    if (!spec) return;
    for (const pair of spec.split(',')) {
      const idx = pair.indexOf(':');
      if (idx < 0) continue;
      const attr = pair.slice(0, idx).trim();
      const key = pair.slice(idx + 1).trim();
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
