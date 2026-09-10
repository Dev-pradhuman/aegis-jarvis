import {executeToolCall} from '../server/toolExecutor.js';
const state={runs:[],approvals:[],activity:[],runtime:{}};
async function call(toolName,args={}){
 let result=await executeToolCall({toolName,arguments:args,requestedBy:'clipboard-verification'},{state});
 if(result.approval){result.approval.status='approved';result=await executeToolCall({toolName,arguments:args,approvalId:result.approval.id,requestedBy:'clipboard-verification'},{state});}
 if(result.status!=='completed')throw new Error(`${toolName}: ${result.error?.code}`);return result;
}
let original;let changed=false;
try{
 original=(await call('clipboard.read')).output.text;
 const marker=`JARVIS clipboard verification ${Date.now()}`;
 const write=await call('clipboard.write',{text:marker});changed=true;
 const read=await call('clipboard.read');
 if(read.output.text!==marker||!write.verified)throw new Error('Clipboard read-back mismatch');
 console.log(JSON.stringify({verified:true,characters:marker.length,rawTextPersisted:JSON.stringify(state).includes(marker),restore:'performed in finally'}));
}finally{
 if(changed)await call('clipboard.write',{text:original});
}
