import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { authenticatePhoneEnvelope, beginPhonePairing, completePhonePairing, decryptEnvelope, encryptEnvelope, phoneTool } from '../server/phoneBridge.js';
import { executeToolCall } from '../server/toolExecutor.js';

const originalKey=process.env.PHONE_BRIDGE_MASTER_KEY;
const state=()=>({phoneBridge:{devices:[],pairings:[],commands:[],receipts:[]},tasks:[],memories:[],workflows:[],approvals:[],runs:[],activity:[],runtime:{}});
const hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest('base64url');

test('phone pairing uses one-time proof and returns encrypted credentials',()=>{
  process.env.PHONE_BRIDGE_MASTER_KEY='test-master-key-that-is-longer-than-thirty-two-characters';
  const current=state();const pairing=beginPhonePairing(current,{label:'Test phone'});const nonce='client-nonce-123456789';
  const proof=hmac(pairing.pairingSecret,`pair:${pairing.pairingId}:phone-1:${nonce}`);
  const completed=completePhonePairing(current,{pairingId:pairing.pairingId,deviceId:'phone-1',name:'Test',clientNonce:nonce,proof,permissions:['notifications','battery']});
  const credentials=decryptEnvelope(pairing.pairingSecret,completed.credentials);
  assert.equal(credentials.deviceId,'phone-1');assert.ok(credentials.token.length>30);assert.equal(completed.device.salt,undefined);
  assert.throws(()=>completePhonePairing(current,{pairingId:pairing.pairingId,deviceId:'phone-2',clientNonce:nonce,proof}),/invalid or expired/i);
});

test('signed encrypted phone envelopes reject replay',()=>{
  process.env.PHONE_BRIDGE_MASTER_KEY='test-master-key-that-is-longer-than-thirty-two-characters';
  const current=state();const pairing=beginPhonePairing(current);const pairNonce='pair-client-nonce-123456';const proof=hmac(pairing.pairingSecret,`pair:${pairing.pairingId}:phone-1:${pairNonce}`);const completed=completePhonePairing(current,{pairingId:pairing.pairingId,deviceId:'phone-1',clientNonce:pairNonce,proof,permissions:['notifications']});const {token}=decryptEnvelope(pairing.pairingSecret,completed.credentials);
  const encrypted=encryptEnvelope(token,{type:'notification',title:'Test'});const timestamp=Date.now();const nonce='request-nonce-123456789';const input={deviceId:'phone-1',timestamp,nonce,...encrypted};input.signature=hmac(token,`event:${input.deviceId}:${timestamp}:${nonce}:${input.iv}:${input.ciphertext}:${input.tag}`);
  assert.equal(authenticatePhoneEnvelope(current,input,'event').payload.title,'Test');
  assert.throws(()=>authenticatePhoneEnvelope(current,input,'event'),/replay rejected/i);
});

test('phone commands require capability permission and canonical approval, and remain explicitly queued',async()=>{
  process.env.PHONE_BRIDGE_MASTER_KEY='test-master-key-that-is-longer-than-thirty-two-characters';
  const current=state();current.phoneBridge.devices.push({id:'phone-1',salt:'salt',permissions:['battery'],revokedAt:null});
  assert.throws(()=>phoneTool('command',{deviceId:'phone-1',capability:'calls',action:'dial'},current),/not granted/i);
  const args={deviceId:'phone-1',capability:'battery',action:'refresh',payload:{}};
  const waiting=await executeToolCall({toolName:'phone.command',arguments:args,requestedBy:'test'},{state:current,request:'Refresh phone battery'});
  assert.equal(waiting.status,'waiting_for_approval');const approval=current.approvals.find(item=>item.id===waiting.approval.id);approval.status='approved';
  const result=await executeToolCall({id:waiting.toolCallId,toolName:'phone.command',arguments:args,approvalId:approval.id,runId:waiting.runId,stepId:approval.stepId,requestedBy:'test'},{state:current,request:'Refresh phone battery'});
  assert.equal(result.status,'completed');assert.equal(result.output.executionState,'QUEUED_FOR_DEVICE');assert.equal(current.phoneBridge.commands[0].status,'queued');
});

test.after(()=>{if(originalKey===undefined)delete process.env.PHONE_BRIDGE_MASTER_KEY;else process.env.PHONE_BRIDGE_MASTER_KEY=originalKey;});
