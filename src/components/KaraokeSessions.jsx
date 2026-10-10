import { useEffect, useState } from 'react';
import { t } from '../../js/i18n.js';
import { reviewTime, useReviewLanguage } from './recordingReviewUtils.js';

const STATUS_KEYS = {
  idle: 'session.status.idle', recording: 'session.status.recording', paused: 'session.status.paused',
  saving: 'session.status.saving', analyzing: 'session.status.analyzing', ready: 'session.status.ready', error: 'session.status.error',
  analyzingMemory: 'session.status.analyzingMemory', readyMemory: 'session.status.readyMemory',
};
const ERROR_KEYS = new Set([
  'session.storageQuota', 'session.storageUnavailable', 'session.storageBlocked', 'session.storageFailed', 'session.analysisFailed', 'session.captureFailed', 'session.captureIncomplete', 'session.durationLimit',
]);
const INITIAL_STATE = { status: 'idle', sessions: [], currentId: null, errorKey: null };

function sessionDate(value, language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'en' ? 'en' : 'zh-CN', {
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function dispatchAction(action, id) {
  window.dispatchEvent(new CustomEvent('musicmaster:session-action', { detail: { action, id } }));
}

// 只呈现控制器发来的快照；录音、IndexedDB、分析与文件下载由控制器负责。
export default function KaraokeSessions() {
  const language = useReviewLanguage();
  const [state, setState] = useState(INITIAL_STATE);
  const [confirmDelete, setConfirmDelete] = useState(null);
  useEffect(() => {
    const onState = event => {
      const detail = event.detail;
      if (!detail || typeof detail !== 'object') return;
      const sessions = Array.isArray(detail.sessions) ? detail.sessions.filter(item => item && typeof item.id === 'string') : [];
      setState({ ...INITIAL_STATE, ...detail, sessions });
      setConfirmDelete(current => sessions.some(item => item.id === current) ? current : null);
    };
    window.addEventListener('musicmaster:session-state', onState);
    window.dispatchEvent(new CustomEvent('musicmaster:sessions-request'));
    return () => window.removeEventListener('musicmaster:session-state', onState);
  }, []);

  const sessions = [...state.sessions].sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
  const current = sessions.find(item => item.id === state.currentId);
  const persistent = current?.persistent === true || (!current && state.persistent === true);
  const audioPersistent = current?.audioPersistent === true || (!current && state.audioPersistent === true);
  const statusKey = ['analyzing', 'analyzingMemory'].includes(state.status) ?
    audioPersistent || persistent ? 'session.status.analyzing' : 'session.status.analyzingMemory'
    : ['ready', 'readyMemory'].includes(state.status) && !persistent ?
      audioPersistent ? 'session.reportMemoryOnly' : 'session.status.readyMemory'
      : STATUS_KEYS[state.status] || 'session.status.idle';
  const errorKey = ERROR_KEYS.has(state.errorKey) ? state.errorKey : 'session.errorFallback';

  return <section id="karaokeSessions" className="card k-session-card" aria-label={t('session.title')}>
    <div className="k-session-heading"><h3>{t('session.title')}</h3><p className="muted">{t('session.localHint')}</p></div>
    <p id="karaokeSessionStatus" className="k-session-status" data-status={state.status} data-persistent={persistent} role="status">{t(statusKey)}</p>
    {(state.status === 'error' || state.errorKey) && <p className="k-session-error" role="alert">{t(errorKey)}</p>}
    {sessions.length === 0 ? <p className="k-session-empty">{t('session.empty')}</p> : <ul className="k-session-list">
      {sessions.map(session => {
        const locked = ['recording', 'saving'].includes(session.status);
        const retry = !locked && (session.status === 'error' || session.canRetry === true);
        return <li className={`k-session-item ${session.id === state.currentId ? 'k-session-current' : ''}`} key={session.id}
          data-session-id={session.id} data-persistent={session.persistent === true} data-status={session.status}>
          <div className="k-session-meta"><strong title={session.songName}>{session.songName || t('session.untitled')}</strong>
            <span>{sessionDate(session.createdAt, language)} · {reviewTime(session.durationSec)}</span>
            <small>{t(session.persistent === true ? session.status === 'ready' ? 'session.saved' : 'session.pending'
              : session.audioPersistent === true ? session.status === 'ready' ? 'session.reportMemoryOnly' : 'session.saved' : 'session.memoryOnly')}
              {session.persistent !== true && session.audioPersistent === true && session.status !== 'ready' ? ` · ${t('session.pending')}` : ''}</small>
          </div>
          {confirmDelete === session.id ? <div className="k-session-actions k-session-delete-confirm" role="group" aria-label={t('session.deleteConfirm')}>
            <span>{t('session.deleteConfirm')}</span><button type="button" className="review-text-button" data-session-action="confirm-delete" onClick={() => {
              setConfirmDelete(null); dispatchAction('delete', session.id);
            }}>{t('session.confirmDelete')}</button>
            <button type="button" className="review-text-button" data-session-action="cancel-delete" onClick={() => setConfirmDelete(null)}>{t('session.cancel')}</button>
          </div> : <div className="k-session-actions">
            <button type="button" className="btn btn-secondary" data-session-action="open" disabled={locked} onClick={() => dispatchAction('open', session.id)}>{t('session.open')}</button>
            {retry && <button type="button" className="review-text-button" data-session-action="retry" onClick={() => dispatchAction('retry', session.id)}>{t('session.retry')}</button>}
            <button type="button" className="review-text-button" data-session-action="download" disabled={locked} onClick={() => dispatchAction('download', session.id)}>{t('session.download')}</button>
            <button type="button" className="review-text-button" data-session-action="delete" disabled={locked} onClick={() => setConfirmDelete(session.id)}>{t('session.delete')}</button>
          </div>}
        </li>;
      })}
    </ul>}
  </section>;
}
