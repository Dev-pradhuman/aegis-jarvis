import http from 'node:http';
import { executeToolCall } from '../server/toolExecutor.js';
import { closeBrowserSession } from '../server/browserAutomation.js';

const state={runs:[],approvals:[],activity:[],runtime:{}};
const timings={};
async function call(tool,args={}){
 let result=await executeToolCall({toolName:tool,arguments:args,requestedBy:'browser-live-verification'},{state});
 if(result.approval){result.approval.status='approved';result=await executeToolCall({toolName:tool,arguments:args,approvalId:result.approval.id,requestedBy:'browser-live-verification'},{state});}
 if(result.status!=='completed'||!result.verified)throw new Error(`${tool}:${result.error?.code}:${result.error?.message}`);
 timings[tool]=result.latencyMs;
 return result;
}

const html='<!doctype html><title>JARVIS Browser Verification</title><label>Name <input aria-label="Name"></label><button onclick="document.querySelector(\'#status\').textContent=\'Clicked\'">Save</button><p id="status">Ready</p>';
const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});response.end(html);});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
try{
 const address=server.address();const opened=await call('browser.open',{url:`http://127.0.0.1:${address.port}/`,label:'controlled verification page'});
 await call('browser.fill',{target:'Name',role:'textbox',text:'JARVIS'});
 await call('browser.click',{target:'Save',role:'button'});
 const read=await call('browser.read',{maxCharacters:2000});
 if(!read.output.content.includes('Clicked'))throw new Error('DOM state did not change after click');
 await call('browser.tabs.close',{});
 console.log(JSON.stringify({verified:true,title:opened.output.title,domRead:true,fillVerified:true,clickStateObserved:true,runCount:state.runs.length,toolCalls:state.runs.reduce((sum,run)=>sum+run.toolCalls.length,0),timings}));
}finally{
 server.close();await closeBrowserSession().catch(()=>{});
}
