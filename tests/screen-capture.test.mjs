import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {captureScreen} from '../server/screenCapture.js';
import {executeToolCall} from '../server/toolExecutor.js';

test('screenshot rejects absent target identity and malformed native image',async()=>{
  await assert.rejects(captureScreen({scope:'window'}),(e)=>e.code==='INVALID_ARGUMENTS');
  await assert.rejects(captureScreen({scope:'monitor'}),(e)=>e.code==='INVALID_ARGUMENTS');
  await assert.rejects(captureScreen({scope:'desktop'},{bridge:async()=>({pngBase64:'bad',width:1,height:1})}),(e)=>e.code==='VERIFICATION_FAILED');
});
test('screen capture requires approval and creates a hash-verified artifact',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jarvis-screen-test-'));
  try{
    const state={runs:[],approvals:[],activity:[],runtime:{}};
    const pngBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    let called=0;const desktopOptions={artifactRoot:root,bridge:async()=>{called++;return{pngBase64,width:1,height:1,observedAt:new Date().toISOString()};}};
    const pending=await executeToolCall({toolName:'screen.capture',arguments:{scope:'desktop'}},{state,desktopOptions});
    assert.equal(pending.status,'waiting_for_approval');assert.equal(called,0);
    pending.approval.status='approved';
    const result=await executeToolCall({toolName:'screen.capture',arguments:{scope:'desktop'},approvalId:pending.approval.id},{state,desktopOptions});
    assert.equal(result.verified,true);assert.equal(result.output.artifact.sha256.length,64);
    assert.equal((await readFile(result.output.artifact.path)).toString('base64'),pngBase64);
    assert.doesNotMatch(JSON.stringify(state),/pngBase64/);
  }finally{
    const relative=path.relative(os.tmpdir(),root);
    if(!relative.startsWith('jarvis-screen-test-')||relative.includes(path.sep))throw new Error('Unexpected test cleanup path');
    await rm(root,{recursive:true,force:true});
  }
});
