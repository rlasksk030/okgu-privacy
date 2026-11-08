import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {defaults} from '../public/model.js';
import {enqueueScheduled,enqueueTest,claimJobs,runPushJobs,sweepPushJobs,notificationFor} from '../src/push-queue.mjs';
const T=Date.parse('2026-11-09T08:30:00+09:00');
function db(){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_initial.sql','0002_push_queue.sql'])raw.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const DB={raw,prepare(sql){const build=(args=[])=>({bind(...values){return build(values);},async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}});return build();}};
 DB.user=(id,prefs=defaults)=>{raw.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id,id+'@example.test','Test','encrypted',JSON.stringify(prefs),T-86400000);raw.prepare('INSERT INTO subscriptions(id,user_id,subscription,created_at) VALUES (?,?,?,?)').run('sub-'+id,id,'{}',T-86400000);};
 return DB;
}
const deps={readRows:async()=>[],sendPush:async()=>{}};
test('all due recipients are queued before bounded sends and later users are not starved',async()=>{
 const DB=db();for(let i=0;i<11;i++)DB.user('u'+i);
 await enqueueScheduled(DB,T);await enqueueScheduled(DB,T+60000);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM push_jobs').get().n,11);
 assert.equal(await runPushJobs({DB,SCHOOL_YEAR:2026},T,deps),4);
 assert.equal(await runPushJobs({DB,SCHOOL_YEAR:2026},T+60000,deps),4);
 assert.equal(await runPushJobs({DB,SCHOOL_YEAR:2026},T+120000,deps),3);
 assert.equal(DB.raw.prepare("SELECT COUNT(*) n FROM push_jobs WHERE status='sent'").get().n,11);DB.raw.close();
});
test('overlapping invocations cannot claim the same leased job; crashed claims recover',async()=>{
 const DB=db();DB.user('a');await enqueueScheduled(DB,T);
 const [a,b]=await Promise.all([claimJobs(DB,T,'a'),claimJobs(DB,T,'b')]);assert.equal(a.length+b.length,1);
 assert.equal((await claimJobs(DB,T+60000,'c')).length,0);
 assert.equal((await claimJobs(DB,T+180000,'d')).length,1);DB.raw.close();
});
test('a delayed test survives send failure and retries once without being removed',async()=>{
 const DB=db();DB.user('a');const id=await enqueueTest(DB,'a','sub-a',T,60);assert.equal(await enqueueTest(DB,'a','sub-a',T+100,60),id);
 assert.equal(await runPushJobs({DB},T,deps),0);let count=0;
 const hooks={...deps,sendPush:async()=>{if(++count===1)throw new TypeError('network');}};
 await runPushJobs({DB},T+60000,hooks);assert.equal(DB.raw.prepare('SELECT status FROM push_jobs').get().status,'pending');
 await runPushJobs({DB},T+120000,hooks);assert.equal(DB.raw.prepare('SELECT status FROM push_jobs').get().status,'sent');
 await runPushJobs({DB},T+180000,hooks);assert.equal(count,2);DB.raw.close();
});
test('three failures end retries and disabled or changed settings cancel queued schedules',async()=>{
 const DB=db();DB.user('a');await enqueueScheduled(DB,T);const hooks={...deps,sendPush:async()=>{throw Error('timeout');}};
 for(const offset of [0,60000,360000])await runPushJobs({DB,SCHOOL_YEAR:2026},T+offset,hooks);
 assert.equal(DB.raw.prepare('SELECT status,attempts FROM push_jobs').get().status,'failed');assert.equal(DB.raw.prepare('SELECT attempts FROM push_jobs').get().attempts,3);
 DB.user('b');await enqueueScheduled(DB,T);const p=structuredClone(defaults);p.slots[0].enabled=false;DB.raw.prepare('UPDATE users SET prefs=? WHERE id=?').run(JSON.stringify(p),'b');
 await runPushJobs({DB,SCHOOL_YEAR:2026},T,deps);assert.equal(DB.raw.prepare("SELECT status FROM push_jobs WHERE user_id='b'").get().status,'skipped');DB.raw.close();
});
test('expired jobs and exhausted crash leases become visible terminal states',async()=>{
 const DB=db();DB.user('a');await enqueueTest(DB,'a','sub-a',T,0);await claimJobs(DB,T,'crash');
 await sweepPushJobs(DB,T+3600001);assert.equal(DB.raw.prepare('SELECT status FROM push_jobs').get().status,'expired');DB.raw.close();
});
test('midnight tomorrow slots use the previous Korean date and do not backfill new subscriptions',async()=>{
 const DB=db(),p=structuredClone(defaults);p.slots.forEach(s=>s.enabled=false);p.slots[3]={enabled:true,time:'23:59',tomorrow:true};DB.user('a',p);
 const midnight=Date.parse('2026-11-10T00:01:00+09:00');await enqueueScheduled(DB,midnight);
 assert.equal(DB.raw.prepare('SELECT target_date FROM push_jobs').get().target_date,'2026-11-10');
 DB.user('new',p);DB.raw.prepare("UPDATE subscriptions SET created_at=? WHERE user_id='new'").run(midnight);await enqueueScheduled(DB,midnight);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM push_jobs').get().n,1);DB.raw.close();
});
test('revoked subscriptions cancel work and old deliveries cannot be replayed',async()=>{
 const DB=db();DB.user('a');DB.raw.prepare('INSERT INTO deliveries VALUES (?,?,?,?)').run('sub-a:2026-11-09:0','a','sent',T);
 await enqueueScheduled(DB,T);assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM push_jobs').get().n,0);
 await enqueueTest(DB,'a','sub-a',T,60);DB.raw.prepare("DELETE FROM subscriptions WHERE id='sub-a'").run();assert.equal(DB.raw.prepare('SELECT COUNT(*) n FROM push_jobs').get().n,0);DB.raw.close();
});
test('payload uses only the requested day and respects name and empty filters',()=>{
 const rows=[['구분','8','9','10','11','12','13','14'],['','일','월','화','수','목','금','토'],['교육활동','','1. 읽기 / 09:00 / 시험교사\n2. 나누기 / 10:00 / 다른교사','다른 날']];
 const job={id:'stable-tag',slot:0,target_date:'2026-11-09'};
 const p={...defaults,name:'시험교사',notifyOnlyMine:true,silentWhenEmpty:true};
 const data=notificationFor(rows,job,p,2026);assert.match(data.title,/1건/);assert.match(data.body,/읽기/);assert.ok(!data.body.includes('나누기'));assert.equal(data.tag,'stable-tag');
 assert.equal(notificationFor(rows,job,{...p,name:'없는이름'},2026),null);
});
test('authentication errors stop retry without including raw secrets in diagnostics',async()=>{
 const DB=db();DB.user('a');await enqueueTest(DB,'a','sub-a',T,0);
 await runPushJobs({DB},T,{...deps,sendPush:async()=>{const e=new Error('secret details');e.status=401;throw e;}});
 assert.equal(DB.raw.prepare('SELECT last_error FROM push_jobs').get().last_error,'AUTH_REQUIRED');DB.raw.close();
});
