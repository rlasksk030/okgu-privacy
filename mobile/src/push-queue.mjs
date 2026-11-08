import {ScheduleParser} from './extension-parser.js';
import {tabForMonth,AppError} from './core.mjs';
import {filterEvents,present,inSchoolYear} from '../public/model.js';

const HOUR=3600000,LEASE=180000,MAX_ATTEMPTS=3;
export const PUSH_BATCH_SIZE=4;

// One SQL statement discovers every due recipient before a bounded delivery
// batch is claimed. A busy first user cannot hide later recipients.
export async function enqueueScheduled(DB,time){
 return DB.prepare(`WITH today AS (
 SELECT u.id AS user_id,u.updated_at,s.id AS subscription_id,s.created_at,
 CAST(j.key AS INTEGER) AS slot,json_extract(j.value,'$.time') AS slot_time,
 CAST(strftime('%s',date(?/1000,'unixepoch','+9 hours')||'T'||json_extract(j.value,'$.time')||':00','-9 hours') AS INTEGER)*1000 AS today_due
 FROM users u JOIN subscriptions s ON s.user_id=u.id,json_each(u.prefs,'$.slots') j
 WHERE json_extract(j.value,'$.enabled')=1 AND CAST(j.key AS INTEGER) BETWEEN 0 AND 3
 ), due AS (SELECT *,CASE WHEN today_due>? THEN today_due-86400000 ELSE today_due END AS due_at FROM today),
 jobs AS (SELECT *,date(due_at/1000,'unixepoch','+9 hours') AS day FROM due)
 INSERT OR IGNORE INTO push_jobs(id,user_id,subscription_id,kind,target_date,slot,slot_time,due_at,expires_at,next_attempt_at)
 SELECT subscription_id||':'||day||':'||slot,user_id,subscription_id,'scheduled',
 date(due_at/1000,'unixepoch','+9 hours',CASE WHEN slot=3 THEN '+1 day' ELSE '+0 day' END),
 slot,slot_time,due_at,due_at+3600000,due_at FROM jobs
 WHERE due_at>? AND created_at<=due_at AND updated_at<=due_at
 AND NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.id=subscription_id||':'||day||':'||slot)`)
 .bind(time,time,time-HOUR).run();
}

export async function enqueueTest(DB,userId,subscriptionId,time,delay){
 if(![0,60].includes(delay))throw new AppError('올바른 예약 시간이 아닙니다.');
 const id=`test:${subscriptionId}:${Math.floor(time/60000)}`;
 // A repeated button press or lost HTTP response reuses this minute's test.
 await DB.prepare(`INSERT OR IGNORE INTO push_jobs(id,user_id,subscription_id,kind,due_at,expires_at,next_attempt_at)
 VALUES (?,?,?,'test',?,?,?)`).bind(id,userId,subscriptionId,time+delay*1000,time+delay*1000+HOUR,time+delay*1000).run();
 return id;
}

export async function claimJobs(DB,time,owner,{onlyId=null,limit=PUSH_BATCH_SIZE}={}){
 const result=await DB.prepare(`UPDATE push_jobs SET status='sending',attempts=attempts+1,lease_owner=?,lease_until=?
 WHERE id IN (SELECT id FROM push_jobs WHERE ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?))
 AND expires_at>? AND attempts<? AND (? IS NULL OR id=?) ORDER BY next_attempt_at,due_at,id LIMIT ?) RETURNING *`)
 .bind(owner,time+LEASE,time,time,time,MAX_ATTEMPTS,onlyId,onlyId,Math.min(limit,PUSH_BATCH_SIZE)).all();
 return result.results;
}

export function notificationFor(rows,job,prefs,year){
 if(!inSchoolYear(job.target_date,year))return null;
 const tab=tabForMonth(job.target_date.slice(0,7),year),day=ScheduleParser.parse(rows,tab.month,tab.year)[job.target_date];
 const all=day?['notes','activities','trips'].flatMap(section=>day[section].map(text=>({section,text}))):[];
 const list=filterEvents(all,{name:prefs.name,onlyMine:prefs.notifyOnlyMine});
 if(!list.length&&prefs.notifyOnlyMine&&prefs.silentWhenEmpty)return null;
 const body=list.length?list.slice(0,4).map(e=>{const p=present(e.text);return (p.time?p.time+' ':'')+p.title;}).join('\n').slice(0,350)+(list.length>4?`\n외 ${list.length-4}건`:''):'등록된 일정이 없어요.';
 return {title:`옥구초 ${job.slot===3?'내일':'오늘'} 일정 · ${list.length}건`,body,url:'/?date='+job.target_date,tag:job.id};
}

export async function runPushJobs(env,time,{readRows,sendPush},options={}){
 const DB=env.DB,owner=crypto.randomUUID(),jobs=await claimJobs(DB,time,owner,options),rowCache=new Map();
 for(const job of jobs){
  try{
   const user=await DB.prepare('SELECT * FROM users WHERE id=?').bind(job.user_id).first();
   const sub=await DB.prepare('SELECT * FROM subscriptions WHERE id=? AND user_id=?').bind(job.subscription_id,job.user_id).first();
   if(!user||!sub){await finish(DB,job,owner,'skipped',time);continue;}
   let payload;
   if(job.kind==='test')payload={title:'옥구알리미',body:'예약한 테스트 알림입니다.',url:'/',tag:job.id};
   else{
    const prefs=JSON.parse(user.prefs),slot=prefs.slots[job.slot];
    if(!slot?.enabled||slot.time!==job.slot_time||user.updated_at>job.due_at||!inSchoolYear(job.target_date,Number(env.SCHOOL_YEAR))){await finish(DB,job,owner,'skipped',time);continue;}
    const key=user.id+':'+job.target_date.slice(0,7);
    if(!rowCache.has(key))rowCache.set(key,readRows(env,user,job.target_date.slice(0,7)));
    payload=notificationFor(await rowCache.get(key),job,prefs,Number(env.SCHOOL_YEAR));
   }
   if(!payload){await finish(DB,job,owner,'skipped',time);continue;}
   await sendPush(env,sub,payload);
   await finish(DB,job,owner,'sent',time);
  }catch(error){
   const code=error.status===401?'AUTH_REQUIRED':error.status===403?'ACCESS_DENIED':error.status===410?'SUBSCRIPTION_EXPIRED':'DELIVERY_RETRY';
   const terminal=[400,401,403,410].includes(error.status)||job.attempts>=MAX_ATTEMPTS;
   await DB.prepare(`UPDATE push_jobs SET status=?,last_error=?,next_attempt_at=?,lease_owner=NULL,lease_until=0,finished_at=? WHERE id=? AND lease_owner=?`)
    .bind(terminal?'failed':'pending',code,time+(job.attempts===1?60000:300000),terminal?time:null,job.id,owner).run();
  }
 }
 return jobs.length;
}
async function finish(DB,job,owner,status,time){
 await DB.prepare('UPDATE push_jobs SET status=?,finished_at=?,last_error=NULL,lease_owner=NULL,lease_until=0 WHERE id=? AND lease_owner=?').bind(status,time,job.id,owner).run();
}
export async function sweepPushJobs(DB,time){
 await DB.prepare(`UPDATE push_jobs SET status=CASE WHEN expires_at<=? THEN 'expired' ELSE 'failed' END,
 last_error=CASE WHEN expires_at<=? THEN 'DELIVERY_EXPIRED' ELSE 'DELIVERY_RETRY' END,finished_at=?,lease_owner=NULL,lease_until=0
 WHERE status IN ('pending','sending') AND (status!='sending' OR lease_until<=?) AND (expires_at<=? OR attempts>=?)`)
 .bind(time,time,time,time,time,MAX_ATTEMPTS).run();
}
