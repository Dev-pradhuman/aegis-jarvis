import '../server/config.js';
import { performance } from 'node:perf_hooks';
import { listComposioAccounts } from '../server/composioAdapter.js';
import { slackStatus } from '../server/slackAdapter.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { executeModelPool } from '../server/modelPool.js';
import { synthesizeSpeech, ttsStatus } from '../server/tts.js';

const state={tasks:[],memories:[],documents:[],workflows:[],approvals:[],runs:[],activity:[],runtime:{},modelRouting:{providerHealth:{}}};
const report={};
async function check(name,operation){const started=performance.now();try{report[name]={ok:true,...await operation(),latencyMs:Math.round((performance.now()-started)*100)/100};}catch(error){report[name]={ok:false,code:error.code||null,error:String(error.message||error).slice(0,300),latencyMs:Math.round((performance.now()-started)*100)/100};}}
await check('composio',async()=>{const accounts=await listComposioAccounts();return{accounts:accounts.map(item=>({toolkit:item.toolkit,status:item.status})),active:accounts.filter(item=>String(item.status).toUpperCase()==='ACTIVE').length};});
await check('gmailRead',async()=>{const result=await executeToolCall({toolName:'gmail.latest',arguments:{limit:1},requestedBy:'verification'},{state,request:'Safe Gmail read verification'});if(result.status!=='completed')throw Object.assign(new Error(result.error?.message||result.status),{code:result.error?.code});return{count:result.output.emails.length,verified:result.verified};});
await check('instagramRead',async()=>{const result=await executeToolCall({toolName:'instagram.messages.latest',arguments:{limit:1},requestedBy:'verification'},{state,request:'Safe Instagram read verification'});if(result.status!=='completed')throw Object.assign(new Error(result.error?.message||result.status),{code:result.error?.code});return{count:result.output.messages.length,verified:result.verified};});
await check('slack',async()=>{const result=await slackStatus();return{authenticated:result.authenticated,scopeCount:result.scopes.granted.length,scopeError:result.scopes.error};});
await check('model',async()=>{const result=await executeModelPool({logicalModel:'deepseek-v4-flash',request:'Reply with exactly OK.',state,timeoutMs:15000});return{logicalModel:result.logicalModel,model:result.model,provider:result.provider,fallbackUsed:result.routingTelemetry.modelFallbackUsed};});
const voice=ttsStatus();if(voice.groq.configured)await check('groqTts',async()=>{const result=await synthesizeSpeech({provider:'groq',text:'JARVIS voice check.',modelId:voice.groq.ttsModel,voiceId:voice.groq.voice});return{bytes:result.audio.length,contentType:result.contentType};});else report.groqTts={ok:false,code:'CONFIGURATION_MISSING'};
console.log(JSON.stringify(report,null,2));
