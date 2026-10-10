// 不依赖第三方包的事务模型；验证完成/回滚边界及本机音频持久化契约。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore, SessionStoreError } from '../js/session-store.js';

function memoryIndexedDB(){
  const data=new Map();let upgraded=false;const state={failPutStore:null,completed:0,opens:0};
  const clone=value=>value==null?value:structuredClone(value);
  const db={objectStoreNames:{contains:key=>data.has(key)},createObjectStore:name=>{data.set(name,new Map());},close(){},
    transaction(names,mode){
      let pending=0,aborted=false,finished=false;
      const copies=new Map(names.map(name=>{if(!data.has(name))throw new DOMException('Missing store','NotFoundError');return[name,new Map([...data.get(name)].map(([key,value])=>[key,clone(value)]))];}));
      const tx={error:null,oncomplete:null,onerror:null,onabort:null,abort(){if(aborted||finished)throw new DOMException('Inactive','InvalidStateError');aborted=true;queueMicrotask(()=>tx.onabort?.());},
        objectStore(name){if(!copies.has(name))throw new DOMException('Unknown store','NotFoundError');const values=copies.get(name);
          const request=operation=>{
            if(aborted||finished)throw new DOMException('Inactive','TransactionInactiveError');
            const req={result:undefined,error:null,onsuccess:null,onerror:null};pending++;
            queueMicrotask(()=>{
              if(aborted)return;
              try{req.result=operation();req.onsuccess?.({target:req});}
              catch(error){req.error=error;tx.error=error;req.onerror?.({target:req});tx.onerror?.({target:req});if(!aborted)tx.abort();}
              pending--;
              if(!pending&&!aborted)queueMicrotask(()=>{if(pending||aborted||finished)return;finished=true;if(mode==='readwrite')for(const[name,map]of copies)data.set(name,map);state.completed++;tx.oncomplete?.();});
            });return req;
          };
          return {
            put(value){const snapshot=clone(value);return request(()=>{if(state.failPutStore===name){state.failPutStore=null;throw new DOMException('Full','QuotaExceededError');}values.set(snapshot.id,snapshot);return snapshot.id;});},
            get:key=>request(()=>clone(values.get(key))),getKey:key=>request(()=>values.has(key)?key:undefined),
            getAll:()=>request(()=>[...values.values()].map(clone)),delete:key=>request(()=>{values.delete(key);}),
          };
        }};return tx;
    }};
  const factory={open(){state.opens++;const request={result:db,error:null};queueMicrotask(()=>{if(!upgraded){upgraded=true;request.onupgradeneeded?.();}request.onsuccess?.();});return request;}};
  return {factory,state,data};
}
const fixture=(id,createdAt='2026-10-10T04:00:00Z')=>({id,createdAt,songName:'本机练习',durationSec:2,status:'analyzing',audioBlob:new Blob(['actual-pcm'],{type:'audio/wav'}),audioName:'take.wav',sourceKind:'vocal',referenceBlob:new Blob(['ref']),referenceName:'reference.wav',referenceKind:'separated',capture:{segments:[{songStartSec:4,recordingStartSec:0}]}});
const code=name=>error=>error instanceof SessionStoreError&&error.code===name;

test('CRUD完整Blob+报告持久化，列表仅摘要并按新旧排序',async()=>{
  const {factory,state}=memoryIndexedDB(),store=createSessionStore({indexedDB:factory});
  await store.putSession(fixture('old'));const saved=await store.putSession(fixture('new','2026-10-10T05:00:00Z'));
  assert.equal(state.completed,2);assert.equal(state.opens,1);assert.equal(saved.createdAt,'2026-10-10T05:00:00.000Z');
  const report={schemaVersion:1,metadata:{sourceKind:'vocal'},frames:[{t:0,midi:69}],comparison:null};
  await store.updateSessionReport('new',report);const full=await store.getSession('new');
  assert.equal(full.status,'ready');assert.deepEqual(full.report,report);assert.equal(await full.audioBlob.text(),'actual-pcm');assert.equal(await full.referenceBlob.text(),'ref');assert.deepEqual(full.capture,saved.capture);
  const summaries=await store.listSessions();assert.deepEqual(summaries.map(s=>s.id),['new','old']);assert.equal(summaries[0].audioBytes,10);assert.equal(summaries[0].referenceBytes,3);
  for(const entry of summaries)for(const key of ['audioBlob','referenceBlob','report','capture'])assert.equal(Object.hasOwn(entry,key),false);
  assert.equal(await store.deleteSession('new'),true);assert.equal(await store.getSession('new'),null);assert.equal(await store.deleteSession('new'),false);assert.deepEqual((await store.listSessions()).map(s=>s.id),['old']);
});

test('报告更新失败状态可恢复，不改变音频或另建会话',async()=>{
  const {factory}=memoryIndexedDB(),store=createSessionStore({indexedDB:factory});await store.putSession(fixture('one'));
  const failed=await store.updateSessionReport('one',null,{status:'error',error:'analysisFailed'});assert.equal(failed.status,'error');assert.equal(failed.error,'analysisFailed');
  const ready=await store.updateSessionReport('one',{schemaVersion:1});assert.equal(ready.error,null);assert.equal(ready.status,'ready');assert.equal(await ready.audioBlob.text(),'actual-pcm');assert.equal((await store.listSessions()).length,1);
  await assert.rejects(store.updateSessionReport('missing',{}),code('notFound'));
});

test('配额失败回滚音频与摘要，不删除旧录音，不提前承诺保存',async()=>{
  const {factory,state}=memoryIndexedDB(),store=createSessionStore({indexedDB:factory});await store.putSession(fixture('kept'));
  const before=state.completed;state.failPutStore='summaries';await assert.rejects(store.putSession(fixture('failed')),code('quota'));
  assert.equal(state.completed,before);assert.equal(await store.getSession('failed'),null);assert.equal(await(await store.getSession('kept')).audioBlob.text(),'actual-pcm');assert.deepEqual((await store.listSessions()).map(s=>s.id),['kept']);
  state.failPutStore='summaries';await assert.rejects(store.updateSessionReport('kept',{x:1}),code('quota'));assert.equal((await store.getSession('kept')).report,null);assert.equal((await store.listSessions())[0].status,'analyzing');
  await store.putSession(fixture('retry'));assert.deepEqual((await store.listSessions()).map(s=>s.id).sort(),['kept','retry']);
});

test('不支持/阻塞/无法打开数据库均有明确错误，可重试打开',async()=>{
  const unavailable=createSessionStore({indexedDB:null});await assert.rejects(unavailable.listSessions(),code('unsupported'));
  let blocked=true;const {factory}=memoryIndexedDB();const retriable=createSessionStore({indexedDB:{open(...args){if(!blocked)return factory.open(...args);const req={};queueMicrotask(()=>req.onblocked?.());return req;}}});
  await assert.rejects(retriable.listSessions(),code('blocked'));blocked=false;assert.deepEqual(await retriable.listSessions(),[]);
  const broken=createSessionStore({indexedDB:{open(){throw new DOMException('Denied','SecurityError');}}});await assert.rejects(broken.listSessions(),code('storage'));
});

test('非法输入拒绝，ISO/ms统一；显式覆盖同id及删除保留用户控制',async()=>{
  const {factory,state}=memoryIndexedDB(),store=createSessionStore({indexedDB:factory});
  for(const extra of [{audioBlob:new Blob([])},{audioBlob:'base64'}, {durationSec:1201},{durationSec:0},{status:'saved'}, {sourceKind:'remote'},{referenceBlob:'remote'}, {createdAt:NaN},{createdAt:'bad'}, {id:''}])await assert.rejects(store.putSession({...fixture('bad'),...extra}),code('invalid'));
  assert.equal(state.opens,0);
  const saved=await store.putSession({...fixture('same'),createdAt:Date.UTC(2026,9,10,7)});assert.equal(saved.createdAt,'2026-10-10T07:00:00.000Z');
  await store.putSession({...fixture('same'),songName:'重新命名'});assert.equal((await store.listSessions()).length,1);assert.equal((await store.getSession('same')).songName,'重新命名');
  const generated=await store.putSession({...fixture(undefined),id:undefined});assert.ok(generated.id.length>10);assert.equal((await store.listSessions()).length,2);
  await assert.rejects(store.updateSessionReport('same',null,{status:'other'}),code('invalid'));await assert.rejects(store.getSession(''),code('invalid'));
});
