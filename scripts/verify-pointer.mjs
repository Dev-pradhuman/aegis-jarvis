import {executeToolCall} from '../server/toolExecutor.js';
const state={runs:[],approvals:[],activity:[],runtime:{}};
async function call(tool,args={}){let r=await executeToolCall({toolName:tool,arguments:args,requestedBy:'pointer-verification'},{state});if(r.approval){r.approval.status='approved';r=await executeToolCall({toolName:tool,arguments:args,approvalId:r.approval.id,requestedBy:'pointer-verification'},{state});}if(r.status!=='completed'||!r.verified)throw new Error(`${tool}:${r.error?.code}:${JSON.stringify(r.verificationEvidence||{})}`);return r.output;}
const original=await call('mouse.position');let moved=false;let report=null;let restore={attempted:false,verified:false};
try{
 const topology=await call('screen.topology');const display=topology.displays.find(d=>original.x>=d.x&&original.x<d.x+d.width&&original.y>=d.y&&original.y<d.y+d.height)||topology.displays[0];
 const target={x:original.x+8<display.x+display.width?original.x+8:original.x-8,y:original.y};
 moved=true;const result=await call('mouse.move',target);
 if(result.x!==target.x||result.y!==target.y)throw new Error('Pointer read-back mismatch');
 report={verified:true,delta:{x:target.x-original.x,y:0}};
}finally{if(moved){restore.attempted=true;try{await call('mouse.move',{x:original.x,y:original.y});restore.verified=true;}catch(error){restore.error=error.message;process.exitCode=1;}}console.log(JSON.stringify({...report,restore}));}
