export const sections = {notes:'특별사항',activities:'교육활동',trips:'출장·복무'};
export const defaults = {name:'',onlyMine:false,notifyOnlyMine:false,silentWhenEmpty:false,slots:[{enabled:true,time:'08:30',tomorrow:false},{enabled:false,time:'11:50',tomorrow:false},{enabled:false,time:'16:30',tomorrow:false},{enabled:false,time:'16:30',tomorrow:true}]};
export function koreaDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function parseDate(key){if(!/^\d{4}-\d{2}-\d{2}$/.test(key||''))throw Error('올바른 날짜를 선택해 주세요.');const d=new Date(key+'T12:00:00+09:00');if(!Number.isFinite(+d)||koreaDate(d)!==key)throw Error('존재하지 않는 날짜입니다.');return d;}
export function shiftDate(key,n){return koreaDate(new Date(+parseDate(key)+86400000*n));}
export function weekday(key){return new Intl.DateTimeFormat('ko-KR',{weekday:'long',timeZone:'Asia/Seoul'}).format(parseDate(key));}
export function weekDates(key){const dow=new Date(key+'T12:00:00+09:00').getUTCDay();return Array.from({length:7},(_,i)=>shiftDate(key,i-(dow+6)%7));}
export function inSchoolYear(key,year=2026){return key>=`${year}-03-01`&&key<=`${year+1}-02-${new Date(Date.UTC(year+1,2,0)).getUTCDate()}`;}
export function cleanTitle(text){return String(text).replace(/^\s*\d+\s*[.)]\s*/,'').trim();}
// Keep URLs, parenthesized text and numeric dates intact while separating fields.
function splitFields(raw){
 const fields=[];let current='',depth=0;
 for(let i=0;i<raw.length;i++){
  const url=raw.slice(i).match(/^https?:\/\/\S+/i);
  if(url){current+=url[0];i+=url[0].length-1;continue;}
  const char=raw[i];if('([{（'.includes(char))depth++;if(')]}）'.includes(char))depth=Math.max(0,depth-1);
  const numericSlash=char==='/'&&/\d/.test(raw[i-1]||'')&&/\d/.test(raw[i+1]||'');
  if((char==='/'&&!depth&&!numericSlash)||char==='\n'){if(current.trim())fields.push(current.trim());current='';}
  else current+=char;
 }
 if(current.trim())fields.push(current.trim());return fields;
}
export function present(text){
 const raw=cleanTitle(text),parts=splitFields(raw);
 const timeIndex=parts.findIndex((s,i)=>i>0&&!/https?:\/\//i.test(s)&&(/\d{1,2}:\d{2}|\d{1,2}시|\d+[~∼\-·,\d]*교시|종일|오전|오후/.test(s)));
 const time=timeIndex>=1?parts[timeIndex]:'';
 const title=parts[0]||raw;const details=[];
 if(timeIndex===2)details.push({label:'대상',text:parts[1]});
 else if(timeIndex>2)parts.slice(1,timeIndex).forEach(text=>details.push({label:'안내',text}));
 if(timeIndex>=1){parts.slice(timeIndex+1).forEach((text,i,all)=>details.push({label:all.length===2?(i===0?'장소':'담당'):'안내',text}));}
 else parts.slice(1).forEach(text=>details.push({label:'안내',text}));
 return {title,time,details};
}
export function filterEvents(events,{name='',onlyMine=false,section='all',query=''}={}){const q=query.trim().toLocaleLowerCase();return events.filter(e=>(section==='all'||e.section===section)&&(!onlyMine||!name||e.text.toLocaleLowerCase().includes(name.toLocaleLowerCase()))&&(!q||e.text.toLocaleLowerCase().includes(q)));}
export function validatePrefs(input){
 if(typeof input.name!=='string'||input.name.trim().length>30)throw Error('이름은 30자 이내로 입력해 주세요.');
 if(!Array.isArray(input.slots)||input.slots.length!==4)throw Error('알림 시간 설정을 확인해 주세요.');
 const slots=input.slots.map((s,i)=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))throw Error('올바른 알림 시간을 입력해 주세요.');return {enabled:s.enabled===true,time:s.time,tomorrow:i===3};});
 if(input.notifyOnlyMine&&!input.name.trim())throw Error('내 일정 알림에 사용할 이름을 입력해 주세요.');
 return {name:input.name.trim(),onlyMine:input.onlyMine===true,notifyOnlyMine:input.notifyOnlyMine===true,silentWhenEmpty:input.silentWhenEmpty===true,slots};
}
export function dueSlots(prefs,now=new Date(),lookbackMinutes=9){const out=[];for(let age=0;age<=lookbackMinutes;age++){const t=new Date(+now-age*60000);const key=koreaDate(t);const hhmm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);prefs.slots.forEach((s,i)=>{if(s.enabled&&s.time===hhmm)out.push({slot:i,key,targetDate:s.tomorrow?shiftDate(key,1):key});});}return out;}
