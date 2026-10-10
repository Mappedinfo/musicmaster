// 演唱会话只保存在当前浏览器 IndexedDB；不上传，不用 localStorage，不淘汰旧录音。
const DB_NAME = 'musicmaster-local-sessions-v1';
const STATUSES = new Set(['analyzing', 'ready', 'error']);
const SOURCES = new Set(['vocal', 'mixed', 'separated', 'unknown']);

export class SessionStoreError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name = 'SessionStoreError'; this.code = code; }
}
const invalid = message => { throw new SessionStoreError('invalid', message); };
const storageError = error => error instanceof SessionStoreError ? error : new SessionStoreError(
  error?.name === 'QuotaExceededError' ? 'quota' : 'storage',
  error?.name === 'QuotaExceededError' ? '本机存储空间不足；录音未保存，请下载备份或删除不再需要的录音。' : '本机录音存储失败，请保留或下载当前录音后重试。', error);
const isBlob = value => typeof Blob !== 'undefined' && value instanceof Blob;
function id(value) { if (typeof value !== 'string' || !value.trim() || value.length > 200) invalid('会话 id 不合法'); return value; }
function normalize(input) {
  if (!input || typeof input !== 'object') invalid('缺少会话数据');
  if (!isBlob(input.audioBlob) || !input.audioBlob.size) invalid('会话需要非空音频 Blob');
  if (!Number.isFinite(input.durationSec) || input.durationSec <= 0 || input.durationSec > 1200) invalid('录音时长必须为 0–1200 秒');
  if (!STATUSES.has(input.status)) invalid('会话状态不合法');
  if (!SOURCES.has(input.sourceKind)) invalid('声源类型不合法');
  if (input.referenceBlob != null && !isBlob(input.referenceBlob)) invalid('参考音频必须是 Blob');
  if (input.referenceKind != null && !SOURCES.has(input.referenceKind)) invalid('参考声源类型不合法');
  const rawCreatedAt = input.createdAt ?? new Date().toISOString();
  if ((typeof rawCreatedAt !== 'string' && typeof rawCreatedAt !== 'number') || !Number.isFinite(new Date(rawCreatedAt).getTime())) invalid('创建时间不合法');
  const createdAt = new Date(rawCreatedAt).toISOString();
  const text = (value, max=1000) => String(value ?? '').slice(0,max);
  const generated = globalThis.crypto?.randomUUID?.() ?? `take-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id:id(input.id ?? generated), createdAt, songName:text(input.songName), durationSec:input.durationSec,
    status:input.status, audioBlob:input.audioBlob, audioName:text(input.audioName || 'recording.wav'), sourceKind:input.sourceKind,
    referenceBlob:input.referenceBlob ?? null, referenceName:text(input.referenceName), referenceKind:input.referenceKind ?? 'unknown',
    report:input.report ?? null, error:input.error == null ? null : text(input.error,5000), capture:input.capture ?? null };
}
function summary(session) {
  const {id,createdAt,songName,durationSec,status,audioName,sourceKind,referenceName,referenceKind,error}=session;
  return {id,createdAt,songName,durationSec,status,audioName,sourceKind,referenceName,referenceKind,error,
    audioBytes:session.audioBlob.size,referenceBytes:session.referenceBlob?.size??0};
}

export function createSessionStore({ indexedDB = globalThis.indexedDB, dbName = DB_NAME } = {}) {
  let opening = null;
  const open = () => {
    if (!indexedDB?.open) return Promise.reject(new SessionStoreError('unsupported','浏览器不支持本地录音存储；请下载录音。'));
    if (opening) return opening;
    opening = new Promise((resolve,reject) => {
      let request, settled=false;
      try { request=indexedDB.open(dbName,1); } catch(error) { reject(storageError(error)); return; }
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'id'});if(!db.objectStoreNames.contains('summaries'))db.createObjectStore('summaries',{keyPath:'id'});};
      request.onerror=()=>{settled=true;reject(storageError(request.error));};
      request.onblocked=()=>{settled=true;reject(new SessionStoreError('blocked','本地录音数据库被其它页面占用，请关闭旧页面后重试。'));};
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
    }).catch(error=>{opening=null;throw error;});
    return opening;
  };
  const transaction = async (stores, mode, operation) => {
    const db=await open();
    return await new Promise((resolve,reject) => {
      let tx,result,failed=null;
      try { tx=db.transaction(stores,mode); } catch(error) { reject(storageError(error));return; }
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(storageError(failed??tx.error));
      tx.onerror=event=>{failed=event?.target?.error??tx.error??failed;};
      const watch = request => {request.onerror=()=>{failed=request.error;};return request;};
      const fail = error => {failed=error;try{tx.abort();}catch{reject(storageError(error));}};
      try { operation(tx,value=>{result=value;},watch,fail); } catch(error) { fail(error); }
    });
  };
  return {
    async putSession(input) {
      const session=normalize(input);
      return transaction(['sessions','summaries'],'readwrite',(tx,done,watch)=>{watch(tx.objectStore('sessions').put(session));watch(tx.objectStore('summaries').put(summary(session)));done(session);});
    },
    async getSession(key) {
      id(key);return transaction(['sessions'],'readonly',(tx,done,watch)=>{const request=watch(tx.objectStore('sessions').get(key));request.onsuccess=()=>done(request.result??null);});
    },
    async listSessions() {
      return transaction(['summaries'],'readonly',(tx,done,watch)=>{const request=watch(tx.objectStore('summaries').getAll());request.onsuccess=()=>done((request.result??[]).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));});
    },
    async deleteSession(key) {
      id(key);return transaction(['sessions','summaries'],'readwrite',(tx,done,watch)=>{const store=tx.objectStore('sessions'),request=watch(store.getKey(key));request.onsuccess=()=>{const existed=request.result!=null;watch(store.delete(key));watch(tx.objectStore('summaries').delete(key));done(existed);};});
    },
    async updateSessionReport(key, report, {status='ready',error=null}={}) {
      id(key);if(!STATUSES.has(status))invalid('会话状态不合法');
      return transaction(['sessions','summaries'],'readwrite',(tx,done,watch,fail)=>{const store=tx.objectStore('sessions'),request=watch(store.get(key));request.onsuccess=()=>{if(!request.result){fail(new SessionStoreError('notFound','找不到本机录音会话。'));return;}const session={...request.result,report:report??null,status,error:error==null?null:String(error).slice(0,5000)};try{watch(store.put(session));watch(tx.objectStore('summaries').put(summary(session)));done(session);}catch(err){fail(err);}};});
    },
  };
}
const store=createSessionStore();
export const putSession=(...args)=>store.putSession(...args);
export const getSession=(...args)=>store.getSession(...args);
export const listSessions=(...args)=>store.listSessions(...args);
export const deleteSession=(...args)=>store.deleteSession(...args);
export const updateSessionReport=(...args)=>store.updateSessionReport(...args);
