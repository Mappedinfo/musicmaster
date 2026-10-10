// 连续演唱录音 → 本机保存 → 共用 Worker 复盘。仅持久化用户开启录音后的演唱。
import { decodeMono, TARGET_SR } from './karaoke.js';
import { validateRecordingReport } from './recording-analysis.js';
import { applyRecordingCapture } from './recording-capture.js';
import { putSession, getSession, listSessions, deleteSession, updateSessionReport } from './session-store.js';

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const storageKey = error => ({ quota: 'session.storageQuota', unsupported: 'session.storageUnavailable', blocked: 'session.storageBlocked' })[error?.code] || 'session.storageFailed';
async function hashBlob(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
function summary(session) {
  const { id, createdAt, songName, durationSec, status, sourceKind, audioName, persistent, audioPersistent, errorKey } = session;
  return { id, createdAt, songName, durationSec, status, sourceKind, audioName, persistent, audioPersistent, errorKey,
    canRetry: status === 'error' || status === 'ready' && !persistent };
}

export class KaraokeSessionController {
  constructor({ player, getContext, mayAutoOpen = () => true, onState = () => {},
    store = { putSession, getSession, listSessions, deleteSession, updateSessionReport } }) {
    this.player = player; this.getContext = getContext; this.mayAutoOpen = mayAutoOpen; this.onState = onState;
    this.store = store; this.writes = new Map();
    this.active = null; this.starting = null; this.finishing = null; this.finishingStart = null; this.currentId = null; this.status = 'idle'; this.errorKey = null;
    this.memory = new Map(); this.sessions = []; this.jobs = new Map(); this.deleted = new Set(); this.refreshVersion = 0;
    window.addEventListener('musicmaster:sessions-request', () => this.emit());
    window.addEventListener('musicmaster:session-action', event => {
      const { action, id } = event.detail || {};
      if (typeof id !== 'string') return;
      this.action(action, id).catch(() => { this.errorKey = 'session.storageFailed'; this.status = 'error'; this.emit(); });
    });
    window.addEventListener('musicmaster:session-report', event => {
      this.saveReview(event.detail).catch(() => {});
    });
    this.refresh();
  }
  emit() {
    this.onState({ status: this.status, takeActive: !!this.active });
    emit('musicmaster:session-state', { status: this.status, currentId: this.currentId, errorKey: this.errorKey, sessions: this.sessions });
  }
  async write(id, operation) {
    const previous = this.writes.get(id) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => {
      if (this.deleted.has(id)) throw new Error('Session deleted');
      return operation();
    });
    this.writes.set(id, pending);
    try { return await pending; } finally { if (this.writes.get(id) === pending) this.writes.delete(id); }
  }
  async refresh() {
    const version = ++this.refreshVersion;
    try {
      const stored = await this.store.listSessions();
      if (version !== this.refreshVersion) return;
      const byId = new Map(stored.filter(item => !this.deleted.has(item.id)).map(item => [item.id, { ...item, persistent: true, audioPersistent: true,
        canRetry: item.status === 'error' || item.status === 'analyzing' && !this.jobs.has(item.id) }]));
      for (const session of this.memory.values()) if (!this.deleted.has(session.id)) byId.set(session.id, summary(session));
      this.sessions = [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch (error) {
      if (version !== this.refreshVersion) return;
      this.errorKey = storageKey(error);
      if (!this.active) {
        const current = this.memory.get(this.currentId);
        this.status = current?.status === 'ready' ? 'readyMemory' : current?.status === 'analyzing' ? 'analyzingMemory' : 'error';
      }
      this.sessions = [...this.memory.values()].filter(item => !this.deleted.has(item.id)).map(summary).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    this.emit();
  }
  async begin() {
    if (this.starting) return this.starting;
    if (this.active) return;
    this.starting = (async () => {
      const finishing = this.finishing;
      if (finishing) await finishing;
      if (this.active) return;
      const context = this.getContext(), id = crypto.randomUUID();
      try {
        await this.player.beginTake({ maxDurationSec: 1200 });
        this.active = { ...context, id, createdAt: new Date().toISOString() };
        this.currentId = id; this.status = 'recording'; this.errorKey = null; this.emit();
      } catch (error) {
        this.status = 'error'; this.errorKey = 'session.captureFailed'; this.emit(); throw error;
      }
    })();
    try { return await this.starting; } finally { this.starting = null; }
  }
  paused() { if (this.active) { this.status = 'paused'; this.emit(); } }
  resumed() { if (this.active) { this.status = 'recording'; this.emit(); } }
  finish({ autoOpen = false, reason = 'finished' } = {}) {
    const previous = this.finishing;
    // 只等调用瞬间已存在的 begin。新的 begin 可以等待本次 finishing，
    // 但不能把它加入 finish 的等待链，否则两端会互等。
    const starting = this.starting;
    if (previous && (!starting || starting === this.finishingStart)) return previous;
    let context = this.active;
    if (!previous && !starting && !context) return Promise.resolve(null);
    // 已开始的 take 立即交给 finish，让紧随其后的 begin 排到 finishing 后面。
    if (context) this.active = null;
    // 延到微任务后执行，确保 finishing 在任何等待/提前返回之前已经赋值。
    const finishing = Promise.resolve().then(async () => {
      if (previous) await previous;
      if (starting) { try { await starting; } catch { return null; } }
      if (!context) { context = this.active; this.active = null; }
      if (!context) return null;
      this.status = 'saving'; this.emit();
      try {
        const recording = await this.player.finishTake(reason);
        if (!recording?.blob || recording.durationSec <= 0) throw new Error('No recorded samples');
        const session = { id: context.id, createdAt: context.createdAt, songName: context.songName,
          audioBlob: recording.blob, audioName: `musicmaster-${context.id}.wav`, durationSec: recording.durationSec,
          sourceKind: context.sourceKind, referenceBlob: context.referenceBlob || null, referenceName: context.referenceName || '',
          referenceKind: context.referenceKind || 'unknown', capture: { ...recording.capture, startedAtSongSec: recording.startedAtSongSec, finishReason: reason },
          status: 'analyzing', report: null, persistent: false, errorKey: null };
        this.memory.set(session.id, session);
        try { await this.write(session.id, () => this.store.putSession(session)); session.persistent = true; session.audioPersistent = true; }
        catch (error) { session.errorKey = storageKey(error); }
        if (this.deleted.has(session.id)) return null;
        if (this.currentId === session.id) {
          this.status = session.persistent ? 'analyzing' : 'analyzingMemory'; this.errorKey = session.errorKey;
        }
        await this.refresh();
        // 保存完成便释放录制端；复盘独立进行，下一次跟唱无需等待分析。
        this.analyze(session, recording.pcm, autoOpen).catch(() => {});
        return session;
      } catch (error) {
        if (this.player.takeActive) this.active = context;
        if (this.currentId === context.id) { this.status = 'error'; this.errorKey = 'session.captureFailed'; this.emit(); }
        return null;
      }
    }).finally(() => { if (this.finishing === finishing) { this.finishing = null; this.finishingStart = null; } });
    this.finishing = finishing;
    this.finishingStart = starting;
    return finishing;
  }
  async analyze(session, suppliedPcm = null, autoOpen = false) {
    if (this.jobs.has(session.id) || this.deleted.has(session.id)) return;
    const job = { cancelled: false, worker: null }; this.jobs.set(session.id, job);
    const current = () => !job.cancelled && !this.deleted.has(session.id);
    session.status = 'analyzing'; this.memory.set(session.id, session);
    if (this.currentId === session.id && !this.active) { this.status = session.persistent ? 'analyzing' : 'analyzingMemory'; this.emit(); }
    try {
      const pcm = suppliedPcm || await decodeMono(session.audioBlob, TARGET_SR);
      if (!current()) return;
      const sourceHash = await hashBlob(session.audioBlob);
      let reference = null;
      if (session.referenceBlob) {
        const referencePcm = await decodeMono(session.referenceBlob, TARGET_SR);
        reference = { pcm: referencePcm, sampleRate: TARGET_SR, options: { sourceKind: session.referenceKind,
          sourceHash: await hashBlob(session.referenceBlob), label: session.referenceName } };
      }
      if (!current()) return;
      const instance = new Worker(new URL('./recording-worker.js', import.meta.url), { type: 'module' }); job.worker = instance;
      const result = await new Promise((resolve, reject) => {
        job.reject = reject;
        instance.onerror = event => reject(new Error(event.message || 'Worker failed'));
        instance.onmessage = event => {
          const data = event.data;
          if (!current() || data.jobId !== session.id) return;
          if (data.type === 'result') resolve(data.report);
          if (data.type === 'error') reject(new Error(data.message || 'Analysis failed'));
        };
        const message = { type: 'analyze', jobId: session.id, pcm, sampleRate: TARGET_SR,
          options: { sourceKind: session.sourceKind, label: session.audioName, sourceHash,
            offsetSec: session.capture?.startedAtSongSec || 0, transposeSemitones: 0, alignmentTrusted: false, autoOffset: false } };
        const transfers = [pcm.buffer];
        if (reference) { message.reference = reference; transfers.push(reference.pcm.buffer); }
        instance.postMessage(message, transfers);
      });
      instance.terminate(); job.worker = null;
      if (!current()) return;
      const validation = validateRecordingReport(result);
      if (!validation.valid) throw new Error(validation.errors[0]);
      result.metadata.audioIdentity = { sha256: sourceHash, byteLength: session.audioBlob.size, name: session.audioName };
      applyRecordingCapture(result, session.capture);
      if (reference && result.comparison?.referenceMetadata) result.comparison.referenceMetadata.audioIdentity = {
        sha256: reference.options.sourceHash, byteLength: session.referenceBlob.size, name: session.referenceName };
      session.report = result; session.status = 'ready';
      if (session.persistent) {
        try { await this.write(session.id, () => this.store.updateSessionReport(session.id, result)); session.errorKey = session.capture?.incomplete || session.capture?.flushFailed ? 'session.captureIncomplete'
          : session.capture?.truncated ? 'session.durationLimit' : null; }
        catch (error) { session.persistent = false; session.errorKey = storageKey(error); }
      }
      if (!current()) return;
      if (this.currentId === session.id && !this.active) {
        this.status = session.persistent ? 'ready' : 'readyMemory'; this.errorKey = session.errorKey;
      }
      if (session.persistent) this.memory.delete(session.id);
      await this.refresh();
      if (autoOpen && this.currentId === session.id && !this.active && this.mayAutoOpen()) await this.open(session);
    } catch (error) {
      if (!current()) return;
      job.worker?.terminate(); session.status = 'error'; session.errorKey ||= 'session.analysisFailed';
      if (session.persistent) {
        try { await this.write(session.id, () => this.store.updateSessionReport(session.id, null, { status: 'error', error: 'analysisFailed' })); }
        catch (storageError) { session.persistent = false; session.errorKey = storageKey(storageError); }
      }
      if (this.currentId === session.id && !this.active) { this.status = 'error'; this.errorKey = session.errorKey; }
      await this.refresh();
    } finally { job.worker?.terminate(); this.jobs.delete(session.id); }
  }
  async open(session) {
    if (this.deleted.has(session.id)) return;
    emit('musicmaster:navigate', { tab: 'karaoke' });
    emit('musicmaster:show-review');
    emit('musicmaster:open-session', { sessionId: session.id, report: session.report,
      vocalFile: new File([session.audioBlob], session.audioName, { type: 'audio/wav' }),
      referenceFile: session.referenceBlob ? new File([session.referenceBlob], session.referenceName || 'reference-audio', { type: session.referenceBlob.type }) : null,
      sourceKind: session.sourceKind, referenceKind: session.referenceKind, status: session.status, error: session.errorKey, persistent: session.persistent,
      offsetSec: session.capture?.startedAtSongSec || 0, capture: session.capture });
  }
  async saveReview(detail) {
    if (!detail || this.deleted.has(detail.sessionId) || !validateRecordingReport(detail.report).valid) return;
    const session = this.memory.get(detail.sessionId) || await this.store.getSession(detail.sessionId);
    if (!session || this.deleted.has(session.id)) return;
    const vocalHash = await hashBlob(session.audioBlob);
    const reportHash = detail.report.metadata.audioIdentity?.sha256 || detail.report.metadata.sourceHash;
    if (detail.sourceHash !== vocalHash || reportHash !== vocalHash) return;
    const referenceHash = detail.report.comparison?.referenceMetadata?.audioIdentity?.sha256 || detail.report.comparison?.referenceMetadata?.sourceHash;
    if (session.referenceBlob ? referenceHash !== await hashBlob(session.referenceBlob) : !!referenceHash) return;
    if (this.deleted.has(session.id)) return;
    applyRecordingCapture(detail.report, session.capture);
    const job = this.jobs.get(session.id);
    if (job) { job.cancelled = true; job.worker?.terminate(); job.reject?.(new Error('Superseded by user review')); }
    session.report = detail.report; session.status = 'ready'; session.sourceKind = detail.report.metadata.sourceKind;
    if (detail.report.comparison) session.referenceKind = detail.report.comparison.referenceMetadata.sourceKind;
    try {
      await this.write(session.id, () => this.store.putSession(session)); session.persistent = true; session.audioPersistent = true; session.errorKey = null;
      this.memory.delete(session.id);
    } catch (error) { if (this.deleted.has(session.id)) return; session.persistent = false; session.errorKey = storageKey(error); this.memory.set(session.id, session); }
    if (this.deleted.has(session.id)) return;
    if (this.currentId === session.id && !this.active) { this.status = session.persistent ? 'ready' : 'readyMemory'; this.errorKey = session.errorKey; }
    await this.refresh();
  }
  async action(action, id) {
    if (this.deleted.has(id)) return;
    const session = this.memory.get(id) || await this.store.getSession(id);
    if (!session) return;
    if (session.persistent === undefined) { session.persistent = true; session.audioPersistent = true; }
    if (action === 'open') { await this.open(session); return; }
    if (action === 'download') {
      const url = URL.createObjectURL(session.audioBlob), link = document.createElement('a');
      link.href = url; link.download = session.audioName || 'musicmaster-recording.wav'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (action === 'delete') {
      // 先中止旧作业；成功删除后才从界面移除，防止报告写回已删录音。
      const job = this.jobs.get(id); if (job) { job.cancelled = true; job.worker?.terminate(); job.reject?.(new Error('Cancelled')); }
      this.deleted.add(id);
      try {
        await this.writes.get(id)?.catch(() => {});
        let stored = null;
        try { stored = await this.store.getSession(id); }
        catch (error) { if (session.persistent || session.audioPersistent || error.code !== 'unsupported') throw error; }
        if (stored || session.persistent || session.audioPersistent) await this.store.deleteSession(id);
      } catch (error) { this.deleted.delete(id); throw error; }
      this.memory.delete(id);
      if (this.currentId === id) { this.currentId = null; this.status = this.active ? 'recording' : 'idle'; this.errorKey = null; }
      emit('musicmaster:session-deleted', { sessionId: id }); await this.refresh(); return;
    }
    if (action === 'retry') {
      this.currentId = id;
      if (!session.persistent) {
        try { await this.write(session.id, () => this.store.putSession(session)); session.persistent = true; session.audioPersistent = true; session.errorKey = null; }
        catch (error) { session.errorKey = storageKey(error); }
      }
      if (!this.deleted.has(id)) await this.analyze(session, null, true);
    }
  }
}
