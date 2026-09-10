import test from 'node:test';
import assert from 'node:assert/strict';
import { executeToolCall } from '../server/toolExecutor.js';
import { approvalUtterance, pendingApprovalResolution } from '../server/approvalManager.js';
import { permissionDecision } from '../server/permissionPolicy.js';

function state(mode='normal'){return{permissionMode:mode,tasks:[],memories:[],workflows:[],approvals:[],runs:[],activity:[],runtime:{},toolExecutions:[],contacts:[{id:'contact-arjun',name:'Arjun',aliases:['arjun'],endpoints:{whatsapp:'+919999999999'}}]};}
const delivered=async()=>({output:{delivered:true},provider:'test'});
const verified=async()=>({verified:true,evidence:{test:true}});

test('approval utterances are intercepted only as exact decisions',()=>{assert.equal(approvalUtterance('approved'),'approved');assert.equal(approvalUtterance('go ahead'),'approved');assert.equal(approvalUtterance('approved message text'),null);});

test('approval retains resolved arguments and resumes the same tool call once',async()=>{
  const value=state();
  const first=await executeToolCall({id:'call-1',toolName:'communication.send',arguments:{contact:'arjun',platform:'whatsapp',message:'hey bro kesa hai'},idempotencyKey:'run-1:call-1'},{state:value,request:'message arjun',sessionId:'chat-1',originatingBackend:'chatgpt-web'});
  assert.equal(first.status,'waiting_for_approval');assert.equal(first.approval.resolvedArguments.contactId,'contact-arjun');assert.equal(first.approval.resolvedArguments.endpoint,'+919999999999');
  assert.equal(pendingApprovalResolution(value,'approved',{sessionId:'chat-1'}).approval.id,first.approval.id);
  const frozen=structuredClone(first.approval.resolvedArguments);first.approval.status='approved';
  const resumed=await executeToolCall({id:'call-1',toolName:'communication.send',arguments:frozen,approvalId:first.approval.id,runId:first.runId,stepId:first.stepId,idempotencyKey:'run-1:call-1'},{state:value,request:'message arjun',sessionId:'chat-1',handler:delivered,verifier:verified});
  assert.equal(resumed.status,'completed');assert.equal(first.approval.status,'consumed');
  assert.deepEqual(first.approval.resolvedArguments,{redacted:true});
  const replay=await executeToolCall({id:'call-1',toolName:'communication.send',arguments:frozen,approvalId:first.approval.id,runId:first.runId,stepId:first.stepId,idempotencyKey:'run-1:call-1'},{state:value,handler:delivered,verifier:verified});
  assert.equal(replay.error.code,'APPROVAL_REPLAY');
});

test('approval argument mutation is rejected',async()=>{
  const value=state();const first=await executeToolCall({id:'call-2',toolName:'communication.send',arguments:{contact:'arjun',platform:'whatsapp',message:'original'}},{state:value});first.approval.status='approved';
  const changed=await executeToolCall({id:'call-2',toolName:'communication.send',arguments:{...first.approval.resolvedArguments,message:'changed'},approvalId:first.approval.id,runId:first.runId,stepId:first.stepId},{state:value,handler:delivered,verifier:verified});
  assert.equal(changed.error.code,'APPROVAL_MISMATCH');
});

test('permission modes change approval only and retain validation',async()=>{
  const definition={id:'communication.send',riskLevel:'EXTERNAL_ACTION'};
  assert.equal(permissionDecision(definition,{}, {permissionMode:'normal',requiresApproval:true}).requiresApproval,true);
  assert.equal(permissionDecision(definition,{}, {permissionMode:'skip_permissions',requiresApproval:true}).requiresApproval,false);
  assert.equal(permissionDecision(definition,{}, {permissionMode:'full_permissions',requiresApproval:true}).requiresApproval,false);
  const value=state('skip_permissions');const result=await executeToolCall({toolName:'communication.send',arguments:{contact:'arjun',platform:'whatsapp',message:'hello'}},{state:value,handler:delivered,verifier:verified});assert.equal(result.status,'completed');assert.equal(value.approvals.length,0);
  const invalid=await executeToolCall({toolName:'communication.send',arguments:{}},{state:value,handler:delivered,verifier:verified});assert.equal(invalid.error.code,'INVALID_ARGUMENTS');
});

test('normal mode requires expected approval while skip and full auto-authorize routine communication',async()=>{
  for(const mode of ['normal','skip_permissions','full_permissions']){const value=state(mode);const result=await executeToolCall({toolName:'communication.send',arguments:{contact:'arjun',platform:'whatsapp',message:'one'}},{state:value,handler:delivered,verifier:verified});assert.equal(result.status,mode==='normal'?'waiting_for_approval':'completed');}
});

test('full permissions retains destructive approval and emergency stop blocks side effects',async()=>{
  const value=state('full_permissions');const guarded=await executeToolCall({toolName:'files.delete',arguments:{path:'temporary.txt'}},{state:value,handler:async()=>({output:{deleted:true}}),verifier:verified});assert.equal(guarded.status,'waiting_for_approval');
  const stopped=state('full_permissions');stopped.runtime.emergencyStop=true;const blocked=await executeToolCall({toolName:'tasks.create',arguments:{title:'must not run'}},{state:stopped});assert.equal(blocked.error.code,'PERMISSION_DENIED');assert.equal(stopped.tasks.length,0);
});

test('multiple pending approvals are never guessed',()=>{const value=state();value.approvals=[{id:'a1',status:'pending',expiresAt:new Date(Date.now()+10000).toISOString()},{id:'a2',status:'pending',expiresAt:new Date(Date.now()+10000).toISOString()}];const result=pendingApprovalResolution(value,'yes');assert.equal(result.error,'MULTIPLE_PENDING_APPROVALS');assert.equal(result.pending.length,2);});

test('WhatsApp communication falls back to the persistent web adapter',async()=>{
  const value=state('skip_permissions');let input;
  const result=await executeToolCall({toolName:'communication.send',arguments:{contact:'arjun',platform:'whatsapp',message:'hello'}},{state:value,browserOptions:{adapter:async(args)=>{input=args;return{success:true,verified:true,acknowledged:true,provider:'whatsapp-web',messageId:'m1'};}}});
  assert.equal(result.status,'completed');assert.equal(result.provider,'whatsapp-web');assert.equal(input.target,'+919999999999');assert.equal(input.message,'hello');
});

test('YouTube playback preserves the requested service and verifies the result',async()=>{
  const value=state();let intent;
  const result=await executeToolCall({toolName:'youtube.play',arguments:{query:'Seven Nation Army',service:'youtube'}},{state:value,browserOptions:{adapter:async(action,input)=>{intent={action,...input};return{service:'youtube',query:input.query,title:'Seven Nation Army',url:'https://www.youtube.com/watch?v=test',playback:{paused:false,currentTime:1,readyState:4},verified:true};}}});
  assert.equal(result.status,'completed');assert.equal(result.verified,true);assert.equal(intent.service,'youtube');assert.equal(value.approvals.length,0);
});
