import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {encrypt,writeSchedule} from '../src/worker.mjs';
import {chooseIntent,payloadFingerprint,existingPushSubscription} from '../public/write-intent.js';

function database(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 return {
  raw:db,
  prepare(sql){return {
   bind(...args){const q=db.prepare(sql);return {
    async first(){return q.get(...args)||null;},
    async all(){return {results:q.all(...args)};},
    async run(){return {meta:{changes:Number(q.run(...args).changes)}};}
   };}
  };}
 };
}
async function context(){
 const DB=database(),env={DB,WRITE_ENABLED:'1',SCHOOL_YEAR:'2026',SPREADSHEET_ID:'synthetic',TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64url')};
 const user={id:'tester',tokens:await encrypt(env,{access_token:'synthetic-only',expires_at:Date.now()+3600000})};
 return {DB,env,user};
}
const input={operation:'add',requestId:'test-idempotency-0001',date:'2026-11-09',section:'activities',text:'시험 일정'};
const request=(body=input)=>new Request('https://example.test/api/write',{method:'POST',body:JSON.stringify(body)});
function mockSheets(){
 const rows=[['구분','8','9','10','11','12','13','14'],['','일','월','화','수','목','금','토'],['교육활동','','기존 일정'],[],['출장'],[],['주요 참고사항']];
 let writes=0,loseResponse=false;
 return {rows,get writes(){return writes;},set loseResponse(value){loseResponse=value;},async fetch(url,options){
  const range=decodeURIComponent(new URL(url).pathname.split('/values/')[1]||'');
  if(options.method==='PUT'){writes++;const cell=range.split('!')[1],row=+cell.slice(1)-1,col=cell.charCodeAt(0)-65;rows[row]??=[];rows[row][col]=JSON.parse(options.body).values[0][0];if(loseResponse){loseResponse=false;throw new Error('response lost after remote write');}return Response.json({updatedCells:1});}
  if(range.endsWith('A1:H120'))return Response.json({values:rows});
  const cell=range.split('!')[1],row=+cell.slice(1)-1,col=cell.charCodeAt(0)-65;return Response.json({values:[[rows[row]?.[col]||'']]});
 }};
}
test('Retry after a lost write response reconciles without a second Sheet write',async t=>{
 const {DB,env,user}=await context(),sheets=mockSheets();sheets.loseResponse=true;t.mock.method(globalThis,'fetch',sheets.fetch.bind(sheets));
 await assert.rejects(()=>writeSchedule(request(),env,user),error=>error.code==='WRITE_UNCERTAIN');
 assert.equal(DB.raw.prepare('SELECT status FROM write_operations').get().status,'pending');
 assert.equal((await (await writeSchedule(request(),env,user)).json()).success,true);
 assert.equal(sheets.writes,1);assert.equal(DB.raw.prepare('SELECT status FROM write_operations').get().status,'done');DB.raw.close();
});
test('Same request cannot be replayed with a changed payload',async t=>{
 const {DB,env,user}=await context(),sheets=mockSheets();t.mock.method(globalThis,'fetch',sheets.fetch.bind(sheets));
 await writeSchedule(request(),env,user);
 await assert.rejects(()=>writeSchedule(request({...input,text:'다른 일정'}),env,user),/다른 내용/);assert.equal(sheets.writes,1);DB.raw.close();
});
test('A concurrent request is blocked by the shared sheet lease',async()=>{
 const {DB,env,user}=await context();DB.raw.prepare('INSERT INTO write_locks VALUES (?,?,?)').run('school-sheet','other',Date.now()+100000);
 await assert.rejects(()=>writeSchedule(request(),env,user),error=>error.code==='WRITE_BUSY');assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM write_operations').get().n,0);DB.raw.close();
});
test('Unconfirmed prior writes prevent starting a different operation',async t=>{
 const {DB,env,user}=await context(),sheets=mockSheets();sheets.loseResponse=true;t.mock.method(globalThis,'fetch',sheets.fetch.bind(sheets));
 await assert.rejects(()=>writeSchedule(request(),env,user));
 await assert.rejects(()=>writeSchedule(request({...input,requestId:'different-request-0002',text:'다른 일정'}),env,user),error=>error.code==='WRITE_UNCERTAIN');assert.equal(sheets.writes,1);DB.raw.close();
});
test('Client keeps the same intent across retries and rejects a different pending payload',async()=>{
 const fingerprint=await payloadFingerprint(input),intent=chooseIntent(null,fingerprint,()=> 'stable-id');
 assert.equal(chooseIntent(intent,fingerprint).id,'stable-id');assert.throws(()=>chooseIntent(intent,'changed'),/앞선 저장/);
});
for(const [label,changed] of [['an externally changed target','다른 선생님 일정'],['a visually empty formula cell','=IF(TRUE,"","")']]){
 test('Preflight protects '+label,async t=>{
  const {DB,env,user}=await context(),sheets=mockSheets();let preflight=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
   if(new URL(url).searchParams.get('valueRenderOption')==='FORMULA'){
    preflight++;return Response.json({values:[[changed]]});
   }
   return sheets.fetch(url,options);
  });
  await assert.rejects(()=>writeSchedule(request(),env,user),error=>error.code==='WRITE_CONFLICT');
  assert.equal(preflight,1);assert.equal(sheets.writes,0);
  assert.equal(DB.raw.prepare('SELECT status FROM write_operations').get().status,'reviewed');DB.raw.close();
 });
}
test('Logout does not await a service worker registration that does not exist',async()=>{
 assert.equal(await existingPushSubscription({}),null);assert.equal(await existingPushSubscription({serviceWorker:{async getRegistration(){return undefined;}}}),null);
});
