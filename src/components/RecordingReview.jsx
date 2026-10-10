import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../../js/i18n.js';
import { decodeMono, TARGET_SR } from '../../js/karaoke.js';
import { validateRecordingReport } from '../../js/recording-analysis.js';
import RecordingReviewChart from './RecordingReviewChart.jsx';
import { reviewDuration, reviewFileHash, reviewInitialOctave, reviewNote, reviewNumber, reviewSourceMatches, reviewTime, useReviewLanguage } from './recordingReviewUtils.js';
import { reviewLabel } from './recordingReviewLabels.jsx';

const ACCEPT_AUDIO = 'audio/*,.wav,.mp3,.m4a,.flac,.aac,.ogg';
const PREPARE_COMMAND = 'npm run analyze:recording -- "my-recording.m4a" --input-kind mixed';
const SOURCE_TYPES = ['unknown', 'vocal', 'separated'];

function metricText(key, value) {
  if (!Number.isFinite(value)) return null;
  const percentage = /Ratio|coverage/i.test(key);
  const number = percentage ? `${Math.round(value * 100)}%` : reviewNumber(value, /Count|repetitions/.test(key) ? 0 : 1);
  const unit = /Cents/.test(key) ? ' ¢' : /Ms$/.test(key) ? ' ms' : /Db$/.test(key) ? ' dB' : /Sec$|Time$/.test(key) ? ' s' : /Hz$/.test(key) ? ' Hz' : '';
  return `${reviewLabel('metric', key)} ${number}${unit}`;
}

function Evidence({ values }) {
  return <p className="review-evidence">{Object.entries(values || {}).map(([key, value]) => metricText(key, value)).filter(Boolean).join(' · ')}</p>;
}

function SourceInput({ role, source, kind, onFile, onKind, onRemove }) {
  const id = role === 'vocal' ? 'reviewVocalFile' : 'reviewReferenceFile';
  const input = useRef(null);
  return <div className="review-source">
    <div className="review-source-heading"><label htmlFor={id}>{t(role === 'vocal' ? 'recording.myVocal' : 'recording.referenceVocal')}</label>
      {source && <button type="button" className="review-text-button" onClick={onRemove}>{t('recording.remove')}</button>}
    </div>
    <div className="review-file-row"><button type="button" className={`file-btn ${role === 'vocal' ? 'review-vocal-button' : ''}`} onClick={() => input.current.click()}>
      {t(source ? 'recording.replace' : role === 'vocal' ? 'recording.chooseVocal' : 'recording.chooseReference')}</button>
      <span className="review-filename" title={source?.file.name}>{source?.file.name || t(role === 'vocal' ? 'recording.vocalEmpty' : 'recording.referenceEmpty')}</span>
    </div>
    <input ref={input} type="file" id={id} accept={ACCEPT_AUDIO} hidden onChange={event => {
      const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = '';
    }} />
    <label className="review-source-kind">{t('recording.sourceLabel')}
      <select id={role === 'vocal' ? 'reviewVocalKind' : 'reviewReferenceKind'} value={kind} onChange={event => onKind(event.target.value)}>
        {SOURCE_TYPES.map(type => <option key={type} value={type}>{reviewLabel('source', type)}</option>)}
      </select>
    </label>
    {source && !source.hash && !source.error && <p className="muted" role="status">{t('recording.checkingFile')}</p>}
  </div>;
}

export default function RecordingReview({ active }) {
  const language = useReviewLanguage();
  const [sources, setSources] = useState({ vocal: null, reference: null });
  const [kinds, setKinds] = useState({ vocal: 'unknown', reference: 'unknown' });
  const [offset, setOffset] = useState('0');
  const [transpose, setTranspose] = useState('0');
  const [autoOffset, setAutoOffset] = useState(true);
  const [alignmentConfirmed, setAlignmentConfirmed] = useState(false);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('recording.readyToAnalyze');
  const [notice, setNotice] = useState(null);
  const [track, setTrack] = useState('vocal');
  const [time, setTime] = useState(0);
  const [selection, setSelection] = useState(null);
  const [loop, setLoop] = useState(false);
  const [copied, setCopied] = useState(false);
  const [octaveBase, setOctaveBase] = useState(reviewInitialOctave);
  const audio = useRef(null), reportInput = useRef(null), command = useRef(null);
  const worker = useRef(null), jobId = useRef(0), fileVersions = useRef({ vocal: 0, reference: 0, report: 0 });
  const alignmentResetByFile = useRef(false);
  const urls = useRef({ vocal: '', reference: '' }), pcmCache = useRef(new Map());
  const reportRef = useRef(report), activeRef = useRef(active);
  reportRef.current = report; activeRef.current = active;
  const settingsMatch = !report?.comparison || (Number(offset) === report.comparison.offsetSec
    && Number(transpose) === report.comparison.transposeSemitones && alignmentConfirmed === report.comparison.alignmentTrusted);
  const bindingsMatch = !report || ['vocal', 'reference'].every(role => {
    const metadata = role === 'vocal' ? report.metadata : report.comparison?.referenceMetadata;
    return !sources[role] || (reviewSourceMatches(sources[role], metadata) && kinds[role] === metadata?.sourceKind);
  });
  const dirty = !!report && (!settingsMatch || !bindingsMatch);

  function pause() { audio.current?.pause(); }
  function stopWorker() {
    ++jobId.current; worker.current?.terminate(); worker.current = null;
  }
  function cancelAnalysis() {
    stopWorker(); setBusy(false); setProgress(0); setPhase('recording.cancelled');
  }

  useEffect(() => {
    const onTab = event => { if (event.detail?.tab !== 'karaoke') audio.current?.pause(); };
    const onOctave = event => setOctaveBase(Number(event.detail?.octaveBase) || 0);
    window.addEventListener('musicmaster:tab-change', onTab);
    window.addEventListener('musicmaster:octave-change', onOctave);
    return () => {
      window.removeEventListener('musicmaster:tab-change', onTab);
      window.removeEventListener('musicmaster:octave-change', onOctave);
      ++jobId.current; worker.current?.terminate(); audio.current?.pause();
      for (const url of Object.values(urls.current)) if (url) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => { if (!active) pause(); }, [active]);
  useEffect(() => {
    if (!alignmentResetByFile.current || !report || !bindingsMatch) return;
    const comparison = report.comparison;
    if (!comparison || (Number(offset) === comparison.offsetSec && Number(transpose) === comparison.transposeSemitones)) {
      setAlignmentConfirmed(comparison?.alignmentTrusted === true);
      alignmentResetByFile.current = false;
    }
  }, [report, sources, kinds, offset, transpose, alignmentConfirmed, bindingsMatch]);

  async function chooseSource(role, file) {
    if (file.size > 128 * 1024 * 1024) { setNotice({ key: 'recording.audioTooLarge' }); return; }
    ++fileVersions.current.report;
    stopWorker(); setBusy(false); pause(); setSelection(null); setTime(0); setNotice(null);
    const version = ++fileVersions.current[role];
    if (urls.current[role]) URL.revokeObjectURL(urls.current[role]);
    urls.current[role] = '';
    pcmCache.current.delete(role);
    setSources(current => ({ ...current, [role]: { file, hash: '', url: '' } }));
    setKinds(current => ({ ...current, [role]: 'unknown' }));
    try {
      const hash = await reviewFileHash(file);
      if (fileVersions.current[role] !== version) return;
      const url = URL.createObjectURL(file); urls.current[role] = url;
      const metadata = role === 'vocal' ? reportRef.current?.metadata : reportRef.current?.comparison?.referenceMetadata;
      setSources(current => ({ ...current, [role]: { file, hash, url } }));
      if (reportRef.current) {
        const matches = reviewSourceMatches({ hash }, metadata);
        if (!matches) { alignmentResetByFile.current = true; setAlignmentConfirmed(false); }
        else {
          if (SOURCE_TYPES.includes(metadata.sourceKind)) setKinds(current => ({ ...current, [role]: metadata.sourceKind }));
        }
      } else {
        setAlignmentConfirmed(false);
      }
    } catch (error) {
      if (fileVersions.current[role] === version) {
        setSources(current => ({ ...current, [role]: { ...current[role], error: true } }));
        setNotice({ key: 'recording.fileError', detail: error.message });
      }
    }
  }
  function removeSource(role) {
    ++fileVersions.current[role]; ++fileVersions.current.report; stopWorker(); setBusy(false); pause();
    if (urls.current[role]) URL.revokeObjectURL(urls.current[role]);
    urls.current[role] = ''; pcmCache.current.delete(role);
    setSources(current => ({ ...current, [role]: null }));
    setKinds(current => ({ ...current, [role]: 'unknown' }));
    if (role === track) setTrack('vocal');
    setSelection(null); setTime(0);
  }
  function changeSetting(setter, value) {
    ++fileVersions.current.report; alignmentResetByFile.current = false;
    cancelAnalysis(); pause(); setter(value); setAlignmentConfirmed(false);
  }
  function changeKind(role, value) {
    if (kinds[role] === value) return;
    changeSetting(next => setKinds(current => ({ ...current, [role]: next })), value);
  }
  function changeOffset(value) { setAutoOffset(false); changeSetting(setOffset, value); }
  async function decoded(role, source, token) {
    const cached = pcmCache.current.get(role);
    if (cached?.hash === source.hash) return cached.pcm;
    const pcm = await decodeMono(source.file, TARGET_SR);
    if (jobId.current !== token) return null;
    if (pcm.length / TARGET_SR > 1200) throw new Error(t('recording.audioTooLong'));
    pcmCache.current.set(role, { hash: source.hash, pcm });
    return pcm;
  }

  async function analyze() {
    ++fileVersions.current.report;
    if (!sources.vocal?.hash) { setNotice({ key: 'recording.needVocal' }); return; }
    if (kinds.vocal === 'unknown' || (sources.reference && kinds.reference === 'unknown')) {
      setNotice({ key: 'recording.confirmSource' });
      document.getElementById(kinds.vocal === 'unknown' ? 'reviewVocalKind' : 'reviewReferenceKind').focus(); return;
    }
    const offsetSec = Number(offset), transposeSemitones = Number(transpose);
    if (!Number.isFinite(offsetSec) || Math.abs(offsetSec) > 1200 || !Number.isFinite(transposeSemitones) || Math.abs(transposeSemitones) > 24) {
      setNotice({ key: 'recording.invalidSettings' }); return;
    }
    stopWorker(); pause(); const token = jobId.current;
    const inputs = { ...sources }, sourceKinds = { ...kinds };
    setBusy(true); setProgress(0); setNotice(null); setPhase('recording.decodingVocal');
    try {
      const pcm = await decoded('vocal', inputs.vocal, token);
      if (!pcm || jobId.current !== token) return;
      let referencePcm = null;
      if (inputs.reference) {
        setPhase('recording.decodingReference'); setProgress(.1);
        referencePcm = await decoded('reference', inputs.reference, token);
        if (!referencePcm || jobId.current !== token) return;
      }
      setPhase('recording.analyzing'); setProgress(.2);
      const instance = new Worker(new URL('../../js/recording-worker.js', import.meta.url), { type: 'module' });
      worker.current = instance;
      const fail = message => {
        if (jobId.current !== token) return;
        instance.terminate(); worker.current = null; setBusy(false); setPhase('recording.failed');
        setNotice({ key: 'recording.analysisError', detail: message });
      };
      instance.onerror = event => fail(event.message || t('recording.failed'));
      instance.onmessage = event => {
        const data = event.data;
        if (jobId.current !== token || data.jobId !== token) return;
        if (data.type === 'progress') {
          setProgress(.2 + .8 * Math.max(0, Math.min(1, Number(data.progress ?? data.value ?? data.p) || 0)));
        } else if (data.type === 'error') fail(data.error?.message || data.error || data.message || t('recording.failed'));
        else if (data.type === 'result') {
          const result = data.report;
          const validation = validateRecordingReport(result);
          if (!validation.valid) { fail(validation.errors.join('; ')); return; }
          result.metadata.audioIdentity = { sha256: inputs.vocal.hash, byteLength: inputs.vocal.file.size, name: inputs.vocal.file.name };
          if (inputs.reference && result.comparison?.referenceMetadata)
            result.comparison.referenceMetadata.audioIdentity = { sha256: inputs.reference.hash, byteLength: inputs.reference.file.size, name: inputs.reference.file.name };
          instance.terminate(); worker.current = null;
          if (result.comparison) {
            setOffset(String(result.comparison.offsetSec));
            setAlignmentConfirmed(result.comparison.alignmentTrusted === true);
          }
          setReport(result); setBusy(false); setProgress(1); setPhase('recording.complete'); alignmentResetByFile.current = false;
          setSelection(null); setTime(0);
        }
      };
      const copy = pcm.slice(), referenceCopy = referencePcm?.slice();
      const options = { label: inputs.vocal.file.name, sourceKind: sourceKinds.vocal, sourceHash: inputs.vocal.hash, offsetSec, transposeSemitones,
        alignmentTrusted: alignmentConfirmed, autoOffset: autoOffset && !alignmentConfirmed, bucketSec: 4 };
      const message = { type: 'analyze', jobId: token, pcm: copy, sampleRate: TARGET_SR, options };
      const transfers = [copy.buffer];
      if (referenceCopy) {
        message.reference = { pcm: referenceCopy, sampleRate: TARGET_SR,
          options: { label: inputs.reference.file.name, sourceKind: sourceKinds.reference, sourceHash: inputs.reference.hash } };
        transfers.push(referenceCopy.buffer);
      }
      instance.postMessage(message, transfers);
    } catch (error) {
      if (jobId.current === token) {
        worker.current?.terminate(); worker.current = null; setBusy(false); setPhase('recording.failed');
        setNotice({ key: 'recording.analysisError', detail: error.message });
      }
    }
  }

  async function importReport(file) {
    if (file.size > 64 * 1024 * 1024) { setNotice({ key: 'recording.reportTooLarge' }); return; }
    const token = ++fileVersions.current.report;
    cancelAnalysis(); pause(); setNotice(null);
    try {
      const imported = JSON.parse(await file.text());
      if (token !== fileVersions.current.report) return;
      const validation = validateRecordingReport(imported);
      if (!validation.valid) throw new Error(validation.errors.join('; '));
      setReport(imported); setSelection(null); setTime(0); setPhase('recording.imported'); alignmentResetByFile.current = false;
      setOffset(String(imported.comparison?.offsetSec ?? imported.parameters?.offsetSec ?? 0));
      setTranspose(String(imported.comparison?.transposeSemitones ?? imported.parameters?.transposeSemitones ?? 0));
      setAlignmentConfirmed(imported.comparison?.alignmentTrusted === true);
      setAutoOffset(false);
      setKinds(current => ({ ...current, vocal: SOURCE_TYPES.includes(imported.metadata.sourceKind) ? imported.metadata.sourceKind : 'unknown',
        reference: SOURCE_TYPES.includes(imported.comparison?.referenceMetadata?.sourceKind) ? imported.comparison.referenceMetadata.sourceKind : 'unknown' }));
    } catch (error) {
      if (token === fileVersions.current.report) setNotice({ key: 'recording.reportError', detail: error.message });
    }
  }

  function exportReport() {
    if (!report || dirty) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'musicmaster-recording-report.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function sourceMatches(role) {
    const metadata = role === 'vocal' ? report?.metadata : report?.comparison?.referenceMetadata;
    return !dirty && reviewSourceMatches(sources[role], metadata);
  }
  async function playSegment(start, end, source = 'vocal') {
    if (!sourceMatches(source)) { setNotice({ key: 'recording.needMatchingAudio' }); return; }
    const shift = source === 'reference' ? report.comparison.offsetSec || 0 : 0;
    const url = sources[source]?.url;
    if (!url) return;
    pause();
    // 先让 React 完成曲目切换，再 seek/play；否则 src 的再次写入会取消播放。
    flushSync(() => { setTrack(source); setSelection({ start, end }); setTime(start); });
    const element = audio.current;
    if (!element) return;
    const from = Math.max(0, start + shift), until = end + shift;
    if (until <= 0) { setNotice({ key: 'recording.noOverlap' }); return; }
    element.currentTime = from;
    try { await element.play(); if (!activeRef.current) element.pause(); }
    catch { setNotice({ key: 'recording.playError' }); }
  }
  function seek(second) {
    setSelection(null); setTime(second);
    if (!sourceMatches(track) || !audio.current) return;
    const shift = track === 'reference' ? report.comparison.offsetSec || 0 : 0;
    audio.current.currentTime = Math.max(0, second + shift);
  }
  function audioTime() {
    const element = audio.current;
    const shift = track === 'reference' ? Number(report?.comparison?.offsetSec || offset || 0) : 0;
    if (!report || sourceMatches(track)) setTime(Math.max(0, element.currentTime - shift));
    if (selection && sourceMatches(track) && element.currentTime >= selection.end + shift) {
      if (loop) element.currentTime = Math.max(0, selection.start + shift);
      else element.pause();
    }
  }
  function changeTrack(next) { pause(); setTrack(next); setSelection(null); setTime(0); }
  async function copyCommand() {
    try { await navigator.clipboard.writeText(PREPARE_COMMAND); setCopied(true); }
    catch { command.current.focus(); command.current.select(); setCopied(false); setNotice({ key: 'recording.copyFallback' }); }
  }

  const comparison = report?.comparison;
  const quality = report?.quality;
  const hasScore = !dirty && Number.isFinite(comparison?.score);
  const range = report?.summary?.robustRange;
  const evidenceDuration = issue => issue.metrics?.comparedSec ?? issue.metrics?.durationSec ?? (issue.end - issue.start);
  const priority = [...(report?.issues || [])].filter(issue => !Number.isFinite(issue.metrics?.comparedSec) || issue.metrics.comparedSec >= 1)
    .sort((a, b) => ({ warning: 2, notice: 1 }[b.severity] || 0) - ({ warning: 2, notice: 1 }[a.severity] || 0)
      || evidenceDuration(b) - evidenceDuration(a)).slice(0, 3);
  const hypotheses = report?.hypotheses || [];
  const previewSource = sources[track];

  return <div id="recordingReview" className="recording-review" hidden={!active}>
    <div className="card review-input-card">
      <div className="review-section-heading"><div><h3>{t('recording.title')}</h3><p className="muted">{t('recording.subtitle')}</p></div>
        <button type="button" className="btn btn-ghost" onClick={() => reportInput.current.click()}>{t('recording.importReport')}</button>
        <input ref={reportInput} type="file" id="reviewReportFile" accept=".json,application/json" hidden onChange={event => {
          const file = event.target.files?.[0]; if (file) importReport(file); event.target.value = '';
        }} />
      </div>
      <div className="review-source-grid">
        <SourceInput role="vocal" source={sources.vocal} kind={kinds.vocal} onFile={file => chooseSource('vocal', file)} onKind={value => changeKind('vocal', value)} onRemove={() => removeSource('vocal')} />
        <SourceInput role="reference" source={sources.reference} kind={kinds.reference} onFile={file => chooseSource('reference', file)} onKind={value => changeKind('reference', value)} onRemove={() => removeSource('reference')} />
      </div>
      <div className="review-analysis-controls">
        <label className="review-check review-auto-offset"><input id="reviewAutoOffset" type="checkbox" checked={autoOffset} disabled={!sources.reference} onChange={event => changeSetting(setAutoOffset, event.target.checked)} /><span>{t('recording.autoOffset')}</span></label>
        <label>{t('recording.offset')}<span className="review-number-field"><input id="reviewOffset" type="number" min="-1200" max="1200" step="0.01" value={offset} onChange={event => changeOffset(event.target.value)} /><span>s</span></span></label>
        <label>{t('recording.transpose')}<select id="reviewTranspose" value={transpose} onChange={event => changeSetting(setTranspose, event.target.value)}>
          {Array.from({ length: 49 }, (_, index) => index - 24).map(value => <option key={value} value={value}>{value > 0 ? '+' : ''}{value} {t('recording.semitones')}</option>)}
        </select></label>
        <label className="review-check"><input id="reviewAlignment" type="checkbox" checked={alignmentConfirmed} disabled={!sources.reference} onChange={event => {
          ++fileVersions.current.report; alignmentResetByFile.current = false; cancelAnalysis(); pause(); setAutoOffset(false); setAlignmentConfirmed(event.target.checked);
        }} /><span>{t('recording.confirmAlignment')}</span></label>
        <button type="button" className="btn btn-primary" id="reviewAnalyzeBtn" disabled={busy || !sources.vocal?.hash || (sources.reference && !sources.reference.hash)} onClick={analyze}>{t(report ? 'recording.analyzeAgain' : 'recording.analyze')}</button>
        {busy && <button type="button" className="btn btn-ghost" id="reviewCancelBtn" onClick={cancelAnalysis}>{t('recording.cancel')}</button>}
      </div>
      <p className="review-control-hint">{t('recording.offsetHint')} {t('recording.noReferenceHint')}</p>
      {comparison?.alignmentEstimate && !comparison.alignmentTrusted && !dirty && <p className="review-offset-estimate" role="status">{t(comparison.alignmentEstimate.status === 'estimated' ? 'recording.candidateOffset' : 'recording.offsetUnavailable')}
        {' '}{(comparison.alignmentEstimate.reasons || []).map(reason => reviewLabel('alignmentReason', reason)).join(' · ')}</p>}
      {comparison?.alignmentEstimate?.status === 'estimated' && !dirty && <div className="review-alignment-anchors">
        {(comparison.alignmentEstimate.anchors || []).filter(anchor => Number.isFinite(anchor.performanceSec)).map((anchor, index) => {
          const start = Math.max(0, anchor.performanceSec - 3), end = Math.min(reviewDuration(report), anchor.performanceSec + 3);
          return <div className="review-alignment-anchor" key={index} role="group" aria-label={t('recording.checkAnchor', { time: reviewTime(anchor.performanceSec) })}>
            <span>{reviewTime(anchor.performanceSec)}</span><button type="button" className="review-text-button" disabled={!sourceMatches('vocal')} onClick={() => playSegment(start, end)}>{t('recording.listenMine')}</button>
            <button type="button" className="review-text-button" disabled={!sourceMatches('reference')} onClick={() => playSegment(start, end, 'reference')}>{t('recording.listenReference')}</button>
          </div>;
        })}
      </div>}
      {busy && <div className="review-progress" role="status"><progress id="reviewProgress" max="1" value={progress} aria-label={t('recording.analyzing')} /><span>{t(phase)} · {Math.round(progress * 100)}%</span></div>}
      {!busy && phase !== 'recording.readyToAnalyze' && <p className="review-status" role="status">{t(phase)}</p>}
      {notice && <p className="review-notice" role="alert">{t(notice.key)}{notice.detail ? ` ${notice.detail}` : ''}</p>}
    </div>

    <div className="review-preview-bar card">
      <div className="review-preview-options"><label htmlFor="reviewPreviewTrack">{t('recording.preview')}</label><select id="reviewPreviewTrack" value={track} onChange={event => changeTrack(event.target.value)}>
        <option value="vocal">{t('recording.myVocal')}</option><option value="reference" disabled={!sources.reference}>{t('recording.referenceTrack')}</option>
      </select><label className="review-check"><input id="reviewLoop" type="checkbox" checked={loop} onChange={event => setLoop(event.target.checked)} /><span>{t('recording.loop')}</span></label></div>
      {previewSource?.url ? <audio ref={audio} id="reviewAudio" src={previewSource.url} controls preload="metadata" onTimeUpdate={audioTime} onEnded={() => {
        if (loop && selection && sourceMatches(track)) playSegment(selection.start, selection.end, track);
      }} /> : <p className="muted">{t('recording.previewEmpty')}</p>}
      {report && <p className="review-audio-match" data-matched={sourceMatches(track)}>{t(sourceMatches(track) ? 'recording.audioMatched' : (report.metadata.audioIdentity?.sha256 || report.metadata.sourceHash) ? 'recording.needMatchingAudio' : 'recording.audioUnverifiable')}</p>}
    </div>

    {report && <div id="reviewReport" className="review-report" data-stale={dirty} data-quality={quality.status}>
      {dirty && <p className="review-stale" role="status">{t('recording.previousReport')}</p>}
      <div className="review-section-heading review-result-heading"><div><h3>{t('recording.resultTitle')}</h3><p className="muted">{report.metadata.audioIdentity?.name || report.metadata.label} · {reviewTime(reviewDuration(report))}</p></div>
        <button type="button" className="btn btn-ghost" id="reviewExportBtn" onClick={exportReport} disabled={dirty || busy}>{t('recording.export')}</button>
      </div>
      <div className="review-quality" data-quality={quality.status}><strong>{reviewLabel('quality', quality.status)}</strong>
        <span>{t('recording.effectiveVoice', { sec: reviewNumber(quality.effectiveVoicedSec), percent: Math.round((quality.voicedRatio || 0) * 100) })}</span>
        {(quality.reasons || []).map(reason => <span key={reason}>{reviewLabel('reason', reason)}</span>)}
      </div>
      <section className="review-priority" aria-label={t('recording.priorityTitle')}><div className="review-section-heading"><h3>{t('recording.priorityTitle')}</h3>
        {hasScore && <p className="review-score">{Math.round(comparison.score)}%<small>{t('recording.pitchMatch')}</small></p>}</div>
        {priority.length ? <div className="review-issue-list">{priority.map(issue => <article className="review-issue" key={issue.id}>
          <div className="review-issue-body"><span className="review-time-tag">{reviewTime(issue.start)}–{reviewTime(issue.end)}</span><h4>{reviewLabel('issue', issue.code)}</h4>
            <Evidence values={issue.metrics} /><p>{issue.metrics?.octaveDifferenceRatio >= .5 ? t('recording.octaveDifferenceHint') : reviewLabel('practice', issue.code)}</p></div>
          <div className="review-issue-actions"><button type="button" className="btn btn-secondary" disabled={!sourceMatches('vocal')} onClick={() => playSegment(issue.start, issue.end)}>{t('recording.listenSegment')}</button>
            {comparison && <button type="button" className="btn btn-ghost" disabled={!sourceMatches('reference')} onClick={() => playSegment(issue.start, issue.end, 'reference')}>{t('recording.listenReference')}</button>}</div>
        </article>)}</div> : <p className="muted">{t(quality.status === 'insufficient' ? 'recording.notEnoughVoice' : report.issues.length ? 'recording.shortEvidenceOnly' : 'recording.noPriority')}</p>}
      </section>

      <section className="card review-hypotheses"><h3>{t('recording.hypothesesTitle')}</h3><p className="muted">{t('recording.hypothesesHint')}</p>
        {hypotheses.length ? <div className="review-hypothesis-grid">{hypotheses.map(hypothesis => <article key={hypothesis.id} className="review-hypothesis">
          <div className="review-hypothesis-heading"><h4>{reviewLabel('hypothesis', hypothesis.code)}</h4><span className="review-confidence">{reviewLabel('confidence', hypothesis.confidence)}</span></div>
          <p className="review-time-tag">{reviewTime(hypothesis.start)}–{reviewTime(hypothesis.end)}</p>
          <Evidence values={hypothesis.evidence} />
          <p><b>{t('recording.alternatives')}</b>{hypothesis.alternatives.map(code => reviewLabel('alternative', code)).join(language === 'en' ? '; ' : '、')}</p>
          <p className="review-verification"><b>{t('recording.verifyTitle')}</b>{reviewLabel('verification', hypothesis.code)}</p>
          <button type="button" className="review-text-button" disabled={!sourceMatches('vocal')} onClick={() => playSegment(hypothesis.start, hypothesis.end)}>{t('recording.listenEvidence')}</button>
        </article>)}</div> : <p className="review-empty-hypotheses">{t('recording.noHypotheses')} {(report.summary.hypothesisReasons || []).map(reason => reviewLabel('hypothesisReason', reason)).join(' · ')}</p>}
      </section>

      <div className="card review-chart-card"><div className="review-section-heading"><h3>{t('recording.chartTitle')}</h3><div className="review-chart-legend"><span className="review-legend-vocal">{t('recording.myVocal')}</span>{comparison?.referenceFrames?.length > 0 && <span className="review-legend-reference">{t('recording.referenceTrack')}</span>}</div></div>
        <RecordingReviewChart report={report} time={time} selection={selection} onSeek={seek} octaveBase={octaveBase} language={language} />
        <p className="muted">{t('recording.chartHint')}</p>
        {comparison ? <p className={`review-comparison-status ${comparison.status === 'ready' ? 'ready' : ''}`}>
          {reviewLabel('comparison', comparison.status)} {(comparison.reasons || []).map(reason => reviewLabel('comparisonReason', reason)).join(' · ')}
        </p> : <p className="review-comparison-status">{t('recording.noReference')}</p>}
      </div>

      <details className="guide-details review-details"><summary>{t('recording.fullDetails')}</summary><div className="guide-body">
        <dl className="review-summary"><div><dt>{t('recording.range')}</dt><dd>{reviewNote(range?.lowMidi, octaveBase)} – {reviewNote(range?.highMidi, octaveBase)}</dd></div>
          <div><dt>{t('recording.medianNote')}</dt><dd>{reviewNote(report.summary.medianMidi, octaveBase)}</dd></div>
          <div><dt>{t('recording.stableCount')}</dt><dd>{report.summary.stableRegions?.length || 0}</dd></div>
          {hasScore && <><div><dt>{t('recording.matchedTime')}</dt><dd>{reviewNumber(comparison.matchedSec)} s</dd></div><div><dt>{t('recording.medianDeviation')}</dt><dd>{reviewNumber(comparison.medianCents)} ¢</dd></div>
            {Number.isFinite(comparison.eligibleReferenceSec) && <div><dt>{t('recording.eligibleReferenceTime')}</dt><dd>{reviewNumber(comparison.eligibleReferenceSec)} s</dd></div>}
            {Number.isFinite(comparison.validComparisonRatio) && <div><dt>{t('recording.comparisonCoverage')}</dt><dd>{Math.round(comparison.validComparisonRatio * 100)}%</dd></div>}
            {Number.isFinite(comparison.unmatchedReferenceSec) && <div><dt>{t('recording.unmatchedReferenceTime')}</dt><dd>{reviewNumber(comparison.unmatchedReferenceSec)} s</dd></div>}
          </>}
        </dl>
        <div className="review-table-scroll"><table className="review-segment-table"><thead><tr><th>{t('recording.segment')}</th><th>{t('recording.range')}</th><th>{t('recording.segmentFindings')}</th><th>{t('recording.preview')}</th></tr></thead><tbody>
          {(report.segments || []).map((segment, index) => <tr key={segment.id || index}><td>{reviewTime(segment.start)}–{reviewTime(segment.end)}</td>
            <td>{reviewNote(segment.lowMidi ?? segment.robustRange?.lowMidi, octaveBase)} – {reviewNote(segment.highMidi ?? segment.robustRange?.highMidi, octaveBase)}</td>
            <td>{(report.issues || []).filter(issue => issue.start < segment.end && issue.end > segment.start).map(issue => reviewLabel('issue', issue.code)).join(' · ') || '—'}</td>
            <td><button type="button" className="review-text-button" disabled={!sourceMatches('vocal')} onClick={() => playSegment(segment.start, segment.end)}>{t('recording.listenSegment')}</button></td></tr>)}
        </tbody></table></div>
        {report.issues.length > 0 && <><h4 className="review-all-observations">{t('recording.allObservations')}</h4>
          <div className="review-table-scroll"><table className="review-segment-table"><thead><tr><th>{t('recording.segment')}</th><th>{t('recording.segmentFindings')}</th><th>{t('recording.evidence')}</th><th>{t('recording.preview')}</th></tr></thead><tbody>
            {report.issues.map(issue => <tr key={issue.id}><td>{reviewTime(issue.start)}–{reviewTime(issue.end)}</td><td>{reviewLabel('issue', issue.code)}</td>
              <td><Evidence values={issue.metrics} /></td><td><button type="button" className="review-text-button" disabled={!sourceMatches('vocal')} onClick={() => playSegment(issue.start, issue.end)}>{t('recording.listenSegment')}</button></td></tr>)}
          </tbody></table></div></>}
      </div></details>
    </div>}

    <details className="guide-details review-preparation"><summary>{t('recording.prepareTitle')}</summary><div className="guide-body">
      <p>{t('recording.prepareDescription')}</p><label htmlFor="reviewPrepareCommand">{t('recording.prepareCommand')}</label>
      <div className="review-command"><input ref={command} id="reviewPrepareCommand" value={PREPARE_COMMAND} readOnly /><button type="button" className="btn btn-ghost" onClick={copyCommand}>{t(copied ? 'recording.copied' : 'recording.copy')}</button></div>
      <p className="muted">{t('recording.prepareOutput')}</p>
    </div></details>
  </div>;
}
