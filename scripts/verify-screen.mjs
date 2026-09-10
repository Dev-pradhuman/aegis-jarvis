import {executeToolCall} from '../server/toolExecutor.js';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'jarvis-screen-live-'));
try{
  const state={runs:[],approvals:[],activity:[],runtime:{}};
  const args={scope:'desktop'};const start=performance.now();
  const pending=await executeToolCall({toolName:'screen.capture',arguments:args},{state,desktopOptions:{artifactRoot:root}});
  if(!pending.approval)throw new Error('Expected screenshot approval');
  pending.approval.status='approved';
  const result=await executeToolCall({toolName:'screen.capture',arguments:args,approvalId:pending.approval.id},{state,desktopOptions:{artifactRoot:root}});
  if(!result.verified)throw new Error(result.error?.message||'Capture not verified');
  const file=await stat(result.output.artifact.path);
  console.log(JSON.stringify({status:result.status,verified:result.verified,width:result.output.width,height:result.output.height,bytes:file.size,latencyMs:Math.round(performance.now()-start),sameRun:state.runs.length===1,cleanup:'temporary screenshot removed in finally'}));
}finally{
  const relative=path.relative(os.tmpdir(),root);
  if(!relative.startsWith('jarvis-screen-live-')||relative.includes(path.sep))throw new Error('Unexpected cleanup path');
  await rm(root,{recursive:true,force:true});
}
