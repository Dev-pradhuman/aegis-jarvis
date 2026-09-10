import { spawn } from 'node:child_process';
import { once } from 'node:events';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { executeToolCall } from '../server/toolExecutor.js';
const state={runs:[],approvals:[],activity:[],runtime:{}};
const reports=[]; const observations=[];
async function call(toolName,args={}) {
  const start=performance.now();
  let result=await executeToolCall({toolName,arguments:args,requestedBy:'input-verification'},{state});
  if(result.approval){result.approval.status='approved';result=await executeToolCall({toolName,arguments:args,approvalId:result.approval.id,requestedBy:'input-verification'},{state});}
  reports.push({tool:toolName,status:result.status,verified:result.verified,latencyMs:Math.round(performance.now()-start),error:result.error?.code});
  if(result.status!=='completed')throw new Error(`${toolName}: ${result.error?.code} ${result.error?.message}`);
  return result.output;
}
const child=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File','scripts/input-test-window.ps1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
const lines=readline.createInterface({input:child.stdout});
lines.on('line',(line)=>{try{observations.push(JSON.parse(line));}catch{}});
let targetError=''; child.stderr.on('data',(chunk)=>{targetError=(targetError+chunk.toString()).slice(-1500);});
const waitFor=async(predicate)=>{for(let i=0;i<100;i++){const match=observations.find(predicate);if(match)return match;await new Promise(r=>setTimeout(r,50));}throw new Error('Expected target observation timed out');};
try {
  const target=await waitFor(item=>item.type==='ready');
  let before=await call('computer.state');
  for(let attempt=0;!before.modifiersReleased&&attempt<5;attempt++){await new Promise(resolve=>setTimeout(resolve,500));before=await call('computer.state');}
  const windows=await call('windows.list');
  console.log(JSON.stringify({target,targetProcessExit:child.exitCode,targetWindows:windows.windows.filter(item=>item.pid===target.processId).map(({handle,pid})=>({handle,pid}))}));
  if(!before.modifiersReleased)throw new Error('Release physical modifier keys before input verification');
  await call('windows.focus',{target:target.handle});
  const text='Hello World 123 ! नमस्ते';
  await call('computer.type',{windowHandle:target.handle,processId:target.processId,text});
  const expected=crypto.createHash('sha256').update(text).digest('hex');
  await waitFor(item=>item.type==='text'&&item.hash===expected);
  await call('windows.focus',{target:target.handle});
  await call('computer.keypress',{windowHandle:target.handle,processId:target.processId,keys:'Ctrl+A'});
  await waitFor(item=>item.type==='shortcut'&&item.keys==='Ctrl+A');
  const replacement='lower UPPER';
  await call('windows.focus',{target:target.handle});
  await call('computer.type',{windowHandle:target.handle,processId:target.processId,text:replacement});
  await waitFor(item=>item.type==='text'&&item.hash===crypto.createHash('sha256').update(replacement).digest('hex'));
  const after=await call('computer.state');
  if(before.capsLock!==after.capsLock||!after.modifiersReleased)throw new Error('Keyboard state changed');
  console.log(JSON.stringify({actualTextVerified:true,shortcutEffectVerified:true,capsLockUnchanged:true,modifiersReleased:true,reports}));
} catch(error){console.log(JSON.stringify({error:error.message,targetError,reports}));process.exitCode=1;}
finally {lines.close();if(child.exitCode===null){child.kill();await once(child,'exit');}}
