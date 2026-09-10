import {executeToolCall} from '../server/toolExecutor.js';
const state={runs:[],approvals:[],activity:[],runtime:{}};
async function call(tool,args={}){const start=performance.now();const r=await executeToolCall({toolName:tool,arguments:args,requestedBy:'audio-verification'},{state});if(r.status!=='completed'||!r.verified)throw new Error(`${tool}:${r.error?.code}`);return{result:r,latencyMs:Math.round(performance.now()-start)};}
const original=(await call('audio.status')).result.output;let changed=false;
try{
 const target=original.volume<100?original.volume+1:original.volume-1;
 const set=await call('audio.set_volume',{volume:target});changed=true;
 const observed=(await call('audio.status')).result.output;
 if(observed.volume!==target||observed.muted!==original.muted)throw new Error('Audio state mismatch');
 console.log(JSON.stringify({verified:true,from:original.volume,to:target,setLatencyMs:set.latencyMs,restore:'performed in finally'}));
}finally{if(changed){await call('audio.set_volume',{volume:original.volume});await call(original.muted?'audio.mute':'audio.unmute');}}
