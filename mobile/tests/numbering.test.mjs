import test from 'node:test';
import assert from 'node:assert/strict';
import {planWrite} from '../src/core.mjs';
test('A new event follows every numbered line, including multiple events in one cell',async()=>{
 const rows=[['구분',8,9,10,11,12,13,14],['','일','월','화','수','목','금','토'],['교육활동','','1. 기존 하나\n2. 기존 둘'],[],['출장'],[],['주요 참고사항']];
 const plan=await planWrite(rows,{operation:'add',date:'2026-11-09',section:'activities',text:'새 일정'});
 assert.equal(plan.cell,'C4');assert.equal(plan.value,'3. 새 일정');
 assert.equal(rows[2][2],'1. 기존 하나\n2. 기존 둘');
});
