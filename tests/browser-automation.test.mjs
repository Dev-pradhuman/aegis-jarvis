import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebUrl } from '../server/browserAutomation.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { getToolDefinition } from '../server/registry.js';

function freshState(){return{runs:[],approvals:[],activity:[],runtime:{}};}
const complete=(extra={})=>({verified:true,url:'https://example.com/',title:'Example',...extra});

test('browser URL normalization permits only credential-free HTTP(S)',()=>{
 assert.equal(normalizeWebUrl('example.com'),'https://example.com/');
 assert.throws(()=>normalizeWebUrl('file:///C:/Windows'),error=>error.code==='PERMISSION_DENIED');
 assert.throws(()=>normalizeWebUrl('https://user:pass@example.com'),error=>error.code==='PERMISSION_DENIED');
});

test('managed browser read uses canonical Run and preserves untrusted-content metadata',async()=>{
 const state=freshState();let seen;
 const result=await executeToolCall({toolName:'browser.read',arguments:{maxCharacters:500},requestedBy:'test'},{state,browserOptions:{adapter:async(action,args)=>{seen={action,args};return complete({content:'page text',characters:9,untrustedExternalContent:true});}}});
 assert.deepEqual(seen,{action:'read',args:{maxCharacters:500}});assert.equal(result.status,'completed');assert.equal(result.verified,true);assert.equal(result.output.untrustedExternalContent,true);
 assert.equal(state.runs[0].toolCalls[0].toolName,'browser.read');
});

test('browser mutations require exact approval and still execute through canonical adapter',async()=>{
 const state=freshState();const args={target:'Save',role:'button'};let calls=0;
 const context={state,browserOptions:{adapter:async(action,input)=>{calls++;assert.equal(action,'click');assert.deepEqual(input,args);return complete({accepted:true,target:'Save',grounding:'dom-accessibility'});}}};
 let result=await executeToolCall({toolName:'browser.click',arguments:args,requestedBy:'test'},context);
 assert.equal(result.status,'waiting_for_approval');assert.equal(calls,0);
 result.approval.status='approved';result=await executeToolCall({toolName:'browser.click',arguments:args,approvalId:result.approval.id,requestedBy:'test'},context);
 assert.equal(result.status,'completed');assert.equal(result.verified,true);assert.equal(calls,1);
});

test('browser registry exposes read-only schemas but keeps side effects out of MCP',()=>{
 assert.equal(getToolDefinition('browser.tabs.list').exposeMcp,true);
 assert.equal(getToolDefinition('browser.click').exposeMcp,false);
 assert.deepEqual(getToolDefinition('browser.fill').inputSchema.required,['target','text']);
});

test('visible account sign-in uses the canonical browser executor and an allowlisted URL',async()=>{
 const state=freshState();let seen;
 const result=await executeToolCall({toolName:'connections.auth.open',arguments:{platform:'whatsapp'},requestedBy:'test'},{state,browserOptions:{adapter:async(action,args)=>{seen={action,args};return complete({url:args.url,opened:true});}}});
 assert.deepEqual(seen,{action:'tabs.open',args:{url:'https://web.whatsapp.com/'}});
 assert.equal(result.status,'completed');assert.equal(result.verified,true);
 assert.equal(result.output.platform,'whatsapp');assert.equal(result.output.authenticationRequired,true);
 assert.equal(state.runs[0].toolCalls[0].toolName,'connections.auth.open');
});

test('visible platform authentication uses the same persistent profile as its adapter',async()=>{
 const state=freshState();let optionsSeen;
 const result=await executeToolCall({toolName:'connections.auth.open',arguments:{platform:'instagram'},requestedBy:'test'},{state,browserOptions:{adapter:async(action,args)=>{optionsSeen={action,args};return complete({url:args.url,opened:true});}}});
 assert.equal(result.status,'completed');
 assert.deepEqual(optionsSeen,{action:'tabs.open',args:{url:'https://www.instagram.com/accounts/login/'}});
});

test('account sign-in rejects unknown platforms before opening a browser',async()=>{
 const state=freshState();let calls=0;
 const result=await executeToolCall({toolName:'connections.auth.open',arguments:{platform:'unknown'},requestedBy:'test'},{state,browserOptions:{adapter:async()=>{calls++;return complete();}}});
 assert.equal(result.status,'failed');assert.equal(result.error.code,'INVALID_ARGUMENTS');assert.equal(calls,0);
});

test('account sign-in turns browser network denial into an actionable runtime error',async()=>{
 const state=freshState();
 const result=await executeToolCall({toolName:'connections.auth.open',arguments:{platform:'gmail'},requestedBy:'test'},{state,browserOptions:{adapter:async()=>{throw new Error('page.goto: net::ERR_NETWORK_ACCESS_DENIED');}}});
 assert.equal(result.status,'failed');assert.equal(result.error.code,'CONNECTION_UNAVAILABLE');
 assert.match(result.error.message,/Restart JARVIS normally/);
});
