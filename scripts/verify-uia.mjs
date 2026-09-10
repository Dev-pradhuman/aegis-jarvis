import { executeToolCall } from '../server/toolExecutor.js';
const state={runs:[],approvals:[],activity:[],runtime:{}};
async function call(tool,args={}){let result=await executeToolCall({toolName:tool,arguments:args,requestedBy:'uia-live-verification'},{state});if(result.approval){result.approval.status='approved';result=await executeToolCall({toolName:tool,arguments:args,approvalId:result.approval.id,requestedBy:'uia-live-verification'},{state});}if(result.status!=='completed'||!result.verified)throw new Error(`${tool}:${result.error?.code}:${result.error?.message}`);return result.output;}
let identity;let created=false;
try{
 const active=await call('windows.get_active');
 if(active.active?.handle&&active.active?.pid)identity={handle:active.active.handle,pid:active.active.pid,title:active.active.title};
 else{const opened=await call('system.app.open',{app:'Notepad'});identity={...opened.verification.windows[0],title:'Notepad'};created=true;}
 const inspected=await call('ui.inspect',{windowHandle:identity.handle,processId:identity.pid});
 console.log(JSON.stringify({verified:true,windowTitle:identity.title,controlCount:inspected.controls.length,totalControls:inspected.totalControls,truncated:inspected.truncated,grounding:inspected.grounding}));
}finally{if(created&&identity){await call('windows.close',{target:identity.handle}).catch(()=>{});}}
