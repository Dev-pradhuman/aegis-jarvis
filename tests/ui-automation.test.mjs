import test from 'node:test';
import assert from 'node:assert/strict';
import { executeToolCall } from '../server/toolExecutor.js';

const args={windowHandle:'123',processId:456,target:'Settings',controlType:'Button'};
const fresh=()=>({runs:[],approvals:[],activity:[],runtime:{}});

test('UI Automation find is a read-only canonical tool with grounding evidence',async()=>{
 const state=fresh();let seen;
 const result=await executeToolCall({toolName:'ui.find',arguments:args},{state,desktopOptions:{bridge:async(operation,input)=>{seen={operation,input};return{matches:[{name:'Settings'}],matchCount:1,grounding:'windows-ui-automation',verified:true};}}});
 assert.deepEqual(seen,{operation:'ui.find',input:args});assert.equal(result.status,'completed');assert.equal(result.verified,true);assert.equal(state.runs[0].toolCalls[0].provider,'windows-uia');
});

test('semantic UI click requires approval and observable state verification',async()=>{
 const state=fresh();let calls=0;const context={state,desktopOptions:{bridge:async()=>{calls++;return{accepted:true,observedChange:true,verified:true,grounding:'windows-ui-automation-InvokePattern'};}}};
 let result=await executeToolCall({toolName:'ui.click',arguments:args,requestedBy:'test'},context);assert.equal(result.status,'waiting_for_approval');assert.equal(calls,0);
 result.approval.status='approved';result=await executeToolCall({toolName:'ui.click',arguments:args,approvalId:result.approval.id,requestedBy:'test'},context);
 assert.equal(result.status,'completed');assert.equal(result.verified,true);assert.equal(calls,1);
});

test('semantic UI action is not called completed when no state change is observed',async()=>{
 const state=fresh();const context={state,desktopOptions:{bridge:async()=>({accepted:true,observedChange:false,verified:false})}};
 let result=await executeToolCall({toolName:'ui.click',arguments:args,requestedBy:'test'},context);result.approval.status='approved';result=await executeToolCall({toolName:'ui.click',arguments:args,approvalId:result.approval.id,requestedBy:'test'},context);
 assert.equal(result.status,'failed_verification');assert.equal(result.error.code,'VERIFICATION_FAILED');
});
