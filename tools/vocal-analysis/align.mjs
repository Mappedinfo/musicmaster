/**
 * 根据伴奏而非演唱音高估计固定偏移。正偏移：referenceTime = performanceTime + offsetSec。
 * 多窗口复核避免把唱者抢拍/拖拍用旋律动态拉伸消除；这不是不同编曲的匹配器。
 */
export function estimateFixedOffset(performancePcm, referencePcm, sampleRate = 16000, options = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('采样率必须为正数');
  const hopSec = options.hopSec ?? 0.04;
  const maxOffsetSec = options.maxOffsetSec ?? 600;
  if (!Number.isFinite(hopSec) || hopSec < 0.01 || hopSec > 0.1 || !Number.isFinite(maxOffsetSec) || maxOffsetSec < 0 || maxOffsetSec > 600) throw new Error('对齐参数不合法');
  const hop = Math.max(1, Math.round(sampleRate * hopSec));
  const stepSec = hop / sampleRate;
  const envelope = pcm => {
    if (!pcm || !Number.isFinite(pcm.length) || pcm.length > sampleRate * 3600) throw new Error('伴奏 PCM 不合法或超过 60 分钟');
    const result = new Float64Array(Math.floor(pcm.length / hop));
    for (let f = 0; f < result.length; f++) {
      let energy = 0;
      for (let j = 0; j < hop; j++) {
        const value = pcm[f * hop + j];
        if (!Number.isFinite(value)) throw new Error('伴奏包含非有限采样');
        energy += value * value;
      }
      // dB 包络削弱整体增益差；静音地板避免 log(0)。
      result[f] = 10 * Math.log10(Math.max(1e-8, energy / hop));
    }
    for (let i = result.length * hop; i < pcm.length; i++) {
      if (!Number.isFinite(pcm[i])) throw new Error('伴奏包含非有限采样');
    }
    return result;
  };
  const a = envelope(performancePcm), b = envelope(referencePcm);
  const minDuration = Math.min(a.length, b.length) * stepSec;
  const empty = reasons => ({ offsetSec: 0, alignmentTrusted: false, method: 'accompaniment', verified: false,
    notes: '伴奏包络固定偏移估计未通过多窗口一致性检查。', anchors: [], correlation: null, reasons });
  if (minDuration < 45) return empty(['alignmentTooShort']);
  const required = Math.ceil(Math.max(30, minDuration * 0.7) / stepSec);
  const bounds = lag => [Math.max(0, -lag), Math.min(a.length, b.length - lag)];
  const correlation = (lag, start, end, stride = 1) => {
    const [lo, hi] = bounds(lag);
    const from = Math.max(lo, start), to = Math.min(hi, end);
    let n = 0, sumA = 0, sumB = 0, aa = 0, bb = 0, ab = 0;
    for (let i = from; i < to; i += stride) {
      const x = a[i], y = b[i + lag];
      // 裁剪后的静音尾巴不能抬高方差或主导匹配；只比较两边都有伴奏的帧。
      if (x <= -65 || y <= -65) continue;
      n++; sumA += x; sumB += y; aa += x * x; bb += y * y; ab += x * y;
    }
    if (n < Math.max(20, (to - from) / stride * 0.25)) return null;
    const va = aa - sumA * sumA / n, vb = bb - sumB * sumB / n;
    if (va / n < 0.04 || vb / n < 0.04) return null;
    return Math.max(-1, Math.min(1, (ab - sumA * sumB / n) / Math.sqrt(va * vb)));
  };
  const maxLag = Math.ceil(maxOffsetSec / stepSec);
  let bestLag = 0, best = -Infinity;
  const candidates = [];
  // 首轮 80ms 网格与抽样加速；之后在相邻格细化到40ms。
  for (let lag = -maxLag; lag <= maxLag; lag += 2) {
    const [lo, hi] = bounds(lag);
    if (hi - lo < required) continue;
    const score = correlation(lag, lo, hi, Math.max(2, Math.ceil((hi - lo) / 4000)));
    if (score == null) continue;
    candidates.push({ lag, score });
    if (score > best) { best = score; bestLag = lag; }
  }
  if (!Number.isFinite(best)) return empty(['alignmentNoEnvelopeVariation']);
  for (let lag = bestLag - 2, end = bestLag + 2; lag <= end; lag++) {
    const [lo, hi] = bounds(lag);
    if (Math.abs(lag) > maxLag || hi - lo < required) continue;
    const score = correlation(lag, lo, hi);
    if (score != null && score > best) { best = score; bestLag = lag; }
  }
  let offsetSec = bestLag * stepSec;
  const [lo, hi] = bounds(bestLag);
  const width = Math.min(Math.floor(12 / stepSec), Math.floor((hi - lo) / 5));
  const search = Math.ceil(0.8 / stepSec);
  const anchors = [0.12, 0.5, 0.88].map(ratio => {
    const center = Math.floor(lo + (hi - lo) * ratio);
    const start = Math.max(lo, center - Math.floor(width / 2)), end = Math.min(hi, start + width);
    let localLag = bestLag, score = correlation(bestLag, start, end);
    for (let lag = bestLag - search; lag <= bestLag + search; lag++) {
      const value = correlation(lag, start, end);
      if (value != null && (score == null || value > score + 1e-9)) { score = value; localLag = lag; }
    }
    const performanceSec = center * stepSec;
    return { performanceSec, referenceSec: performanceSec + localLag * stepSec, correlation: score };
  });
  const reasons = [];
  if (best < (options.minCorrelation ?? 0.6)) reasons.push('alignmentWeakCorrelation');
  if (anchors.some(anchor => anchor.correlation == null || anchor.correlation < (options.minLocalCorrelation ?? 0.55))) reasons.push('alignmentWeakLocalMatch');
  if (anchors.some(anchor => Math.abs(anchor.referenceSec - anchor.performanceSec - offsetSec) > 0.12 + 1e-9)) reasons.push('alignmentNonFixedOffset');
  if (anchors.at(-1).performanceSec - anchors[0].performanceSec < 30) reasons.push('alignmentAnchorsTooClose');
  // 周期节拍可能有多个强峰；远峰几乎一样强时不能自行选择小节。
  const alternative = Math.max(-Infinity, ...candidates.filter(c => Math.abs(c.lag - bestLag) * stepSec >= 2).map(c => c.score));
  if (Number.isFinite(alternative) && best - alternative < 0.04) reasons.push('alignmentAmbiguous');

  // RMS 强弱节奏相同不证明伴奏相同。三处另用归一化、去 DC 波形验证实际内容。
  // 允许总体增益 / 极性变化，但声源分离、麦克风染色或混响可使此检查不通过；
  // 这时保留包络候选供人工公共乐句核验，不能降低门槛自动给演唱打分。
  const contentWindow = Math.round(sampleRate * 2), contentStride = Math.max(1, Math.floor(sampleRate / 4000));
  const normalizedWaveform = (start, count, offsetSamples) => {
    let n = 0, sx = 0, sy = 0, xx = 0, yy = 0, xy = 0;
    for (let i = start, end = start + count; i < end; i += contentStride) {
      const j = i + offsetSamples;
      if (i < 0 || i >= performancePcm.length || j < 0 || j >= referencePcm.length) continue;
      const x = performancePcm[i], y = referencePcm[j];
      n++; sx += x; sy += y; xx += x * x; yy += y * y; xy += x * y;
    }
    const vx = xx - sx * sx / Math.max(n, 1), vy = yy - sy * sy / Math.max(n, 1);
    if (n < Math.max(20, count / contentStride * 0.9) || vx / n < 1e-8 || vy / n < 1e-8) return 0;
    return Math.min(1, Math.abs((xy - sx * sy / n) / Math.sqrt(vx * vy)));
  };
  const baseSamples = bestLag * hop, searchStep = Math.max(1, Math.round(sampleRate * 0.0005));
  const contentAnchors = anchors.map(anchor => {
    const center = Math.round(anchor.performanceSec * sampleRate), start = center - Math.floor(contentWindow / 2);
    let contentOffsetSamples = baseSamples, contentCorrelation = normalizedWaveform(start, contentWindow, baseSamples);
    for (let shift = baseSamples - hop; shift <= baseSamples + hop; shift += searchStep) {
      const value = normalizedWaveform(start, contentWindow, shift);
      if (value > contentCorrelation) { contentCorrelation = value; contentOffsetSamples = shift; }
    }
    const coarseBest = contentOffsetSamples;
    for (let shift = coarseBest - searchStep; shift <= coarseBest + searchStep; shift++) {
      const value = normalizedWaveform(start, contentWindow, shift);
      if (value > contentCorrelation) { contentCorrelation = value; contentOffsetSamples = shift; }
    }
    return { ...anchor, contentCorrelation, contentOffsetSec: contentOffsetSamples / sampleRate };
  });
  const contentOffsets = contentAnchors.map(anchor => anchor.contentOffsetSec).sort((x, y) => x - y);
  const contentOffsetSec = contentOffsets[1];
  const maxContentResidualSec = Math.max(...contentOffsets.map(value => Math.abs(value - contentOffsetSec)));
  // 至少两窗必须有强同源证据；剩余窗仍需支持，允许一处独立噪声 / 分离残留。
  // 不能拿两处匹配抵消第三处无关内容，也不能只依靠相同强弱节奏。
  if (contentAnchors.filter(anchor => anchor.contentCorrelation >= 0.85).length < 2 || contentAnchors.some(anchor => anchor.contentCorrelation < 0.65)) reasons.push('alignmentContentMismatch');
  if (maxContentResidualSec > 0.003 + 1e-9) reasons.push('alignmentContentNonFixedOffset');
  if (!reasons.length) offsetSec = contentOffsetSec;
  const trusted = reasons.length === 0;
  return { offsetSec, alignmentTrusted: trusted, method: 'accompaniment', verified: trusted,
    notes: `两份分离伴奏的 dB RMS 包络候选；${stepSec.toFixed(3)} 秒网格；三处归一化波形内容复核；未拉伸演唱时间。`,
    anchors: contentAnchors, correlation: best, reasons,
    contentEvidence: { method: 'normalizedWaveform', strongCorrelation: 0.85, requiredStrongAnchors: 2, minSupportingCorrelation: 0.65, maxAllowedResidualSec: 0.003, maxResidualSec: maxContentResidualSec } };
}
