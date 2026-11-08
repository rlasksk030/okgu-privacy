import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';

function env(){
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 const DB={
  prepare(sql){
   return {
    bind(...args){
     const q=raw.prepare(sql);
     return {
      async first(){return q.get(...args)||null;},
      async run(){return {meta:{changes:Number(q.run(...args).changes)}};}
     };
    }
   };
  }
 };
 return {raw,DB,APP_ORIGIN:'https://example.test',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url'),SPREADSHEET_ID:'synthetic-sheet'};
}
test('OAuth callback stores encrypted tokens and creates a session only after sheet authorization',async t=>{
 const e=env(),calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.redirect,'manual');calls.push(url);if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600});if(url==='https://openidconnect.googleapis.com/v1/userinfo')return Response.json({sub:'synthetic-user',email:'tester@example.test',email_verified:true,name:'Tester'});if(url.startsWith('https://sheets.googleapis.com/'))return Response.json({spreadsheetId:'synthetic-sheet'});throw Error('Unexpected destination');});
 const login=await worker.fetch(new Request(e.APP_ORIGIN+'/auth/login'),e),state=new URL(login.headers.get('Location')).searchParams.get('state');
 const response=await worker.fetch(new Request(e.APP_ORIGIN+'/auth/callback?state='+state+'&code=synthetic-code',{headers:{Cookie:'__Host-okgu_state='+state}}),e);
 assert.equal(response.status,303,await response.clone().text());assert.equal(response.headers.get('Location'),e.APP_ORIGIN+'/');assert.match(response.headers.get('Set-Cookie'),/__Host-okgu_session=/);
 assert.equal(e.raw.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);assert.equal(e.raw.prepare('SELECT COUNT(*) n FROM oauth_states').get().n,0);
 assert.ok(!e.raw.prepare('SELECT tokens FROM users').get().tokens.includes('synthetic-access'));assert.equal(calls.length,3);e.raw.close();
});
test('OAuth diagnostics expose only a fixed stage when state storage fails',async()=>{
 const e=env();e.DB={prepare(){throw new Error('confidential database details');}};
 const response=await worker.fetch(new Request(e.APP_ORIGIN+'/auth/callback?state=test&code=secret',{headers:{Cookie:'__Host-okgu_state=test'}}),e);
 assert.equal(response.status,503);const data=await response.json();assert.equal(data.code,'AUTH_STATE_STORAGE');assert.ok(!JSON.stringify(data).includes('confidential'));e.raw.close();
});
