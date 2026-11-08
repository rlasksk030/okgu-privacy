import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchNoRedirect} from '../src/outbound.mjs';

test('Outbound requests use the Workers-supported mode and retain timeout/body/headers',async t=>{
 const body=new URLSearchParams({code:'synthetic'});let calls=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  calls++;assert.equal(url,'https://example.test/token');assert.equal(options.redirect,'manual');
  assert.equal(options.method,'POST');assert.equal(options.body,body);
  assert.equal(options.headers.Authorization,'Bearer synthetic');assert.ok(options.signal instanceof AbortSignal);
  return Response.json({ok:true});
 });
 const result=await fetchNoRedirect('https://example.test/token',{method:'POST',headers:{Authorization:'Bearer synthetic'},body,redirect:'follow'});
 assert.deepEqual(await result.json(),{ok:true});assert.equal(calls,1);
});

test('Redirect responses never trigger a request to the Location destination',async t=>{
 for(const status of [301,302,303,307,308]){
  let calls=0;
  const mock=t.mock.method(globalThis,'fetch',async(url,options)=>{
   calls++;assert.equal(url,'https://example.test/token');assert.equal(options.redirect,'manual');
   return new Response(null,{status,headers:{Location:'https://other.example.test/private'}});
  });
  await assert.rejects(()=>fetchNoRedirect('https://example.test/token'),error=>error.code==='UPSTREAM_REDIRECT'&&error.status===502);
  assert.equal(calls,1);mock.mock.restore();
 }
});
