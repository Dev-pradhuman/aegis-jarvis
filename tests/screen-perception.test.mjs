import assert from 'node:assert/strict';
import test from 'node:test';
import { perceiveScreen } from '../server/screenPerception.js';
import { executeToolCall } from '../server/toolExecutor.js';

test('screen perception sends verified pixels to a multimodal model as untrusted data',async()=>{
  let request;
  const result=await perceiveScreen({question:'What error is visible?'},{capture:async()=>({artifact:{id:'shot',path:'ignored',mimeType:'image/png',sha256:'abc'},width:100,height:50,verified:true}),read:async()=>Buffer.from('png'),executeModel:async(input)=>{request=input;return{reply:'A Settings dialog shows an error.',logicalModel:'nemotron-3-nano-omni',provider:'test'};}});
  assert.equal(request.requiredModality,'image');assert.match(request.attachments[0].dataUrl,/^data:image\/png;base64/);assert.equal(result.verified,true);assert.equal(result.untrustedVisualContent,true);
});

test('screen perception requires approval and does not persist perceived screen text',async()=>{
  const state={tasks:[],memories:[],workflows:[],approvals:[],runs:[],activity:[],runtime:{}};
  const waiting=await executeToolCall({toolName:'screen.perceive',arguments:{scope:'desktop',question:'Describe it'}},{state,request:'Understand screen'});
  assert.equal(waiting.status,'waiting_for_approval');assert.equal(waiting.output,null);
  assert.equal(state.runs[0].toolCalls[0].status,'waiting_for_approval');
});
