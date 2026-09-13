import { composioToolRisk, executeComposioTool, listComposioAccounts, listComposioTools } from './composioAdapter.js';

const terms={
 gmail:{search:['search','email'],read:['get','email'],draft:['create','draft'],send:['send','email'],reply:['reply','email'],archive:['archive','email'],delete:['delete','email'],labels:['label','email']},
 googlecalendar:{list:['list','event'],search:['search','event'],create:['create','event'],update:['update','event'],delete:['delete','event'],availability:['free','busy']},
 discordbot:{search:['list','message'],read:['get','message'],send:['create','message'],reply:['reply','message'],react:['reaction'],channels:['list','channel']},
 instagram:{search:['list','conversation'],read:['list','message'],send:['send','message'],reply:['send','message']},
};
const aliases={calendar_id:['calendarId'],max_results:['limit'],limit:['limit'],page_size:['limit'],query:['query'],q:['query'],search_query:['query'],message_id:['messageId'],thread_id:['threadId','messageId','recipientId','target'],recipient_id:['recipientId','userId','threadId','username','recipient','target'],user_id:['userId','recipientId','username','recipient','target'],username:['username','recipient','target'],recipient_email:['to'],to:['to'],recipient:['to','recipient','target','username'],subject:['subject'],body:['body'],message_body:['body'],content:['body','message'],text:['body','message'],summary:['title'],title:['title'],start_datetime:['start'],start_time:['start'],start:['start'],end_datetime:['end'],end_time:['end'],end:['end'],timezone:['timezone'],event_id:['eventId'],channel_id:['channelId'],guild_id:['guildId']};
function failure(code,message){return Object.assign(new Error(message),{code});}
function properties(tool){return tool.inputSchema?.properties||tool.inputSchema?.input_schema?.properties||{};}
function required(tool){return tool.inputSchema?.required||[];}
function select(tools,toolkit,operation){const wanted=terms[toolkit]?.[operation];if(!wanted)throw failure('CAPABILITY_UNAVAILABLE',`${toolkit}.${operation} is not supported by the connected capability adapter.`);const expectedRead=['search','read','list','availability','labels','channels'].includes(operation);const ranked=tools.map(tool=>{const text=`${tool.slug} ${tool.name||''} ${tool.description||''}`.toLowerCase();let score=wanted.reduce((sum,term)=>sum+(text.includes(term)?4:0),0);if((composioToolRisk(tool.slug)==='READ_ONLY')===expectedRead)score+=3;if(operation==='list'&&/get.*by.*id/.test(text))score-=8;return{tool,score};}).filter(item=>item.score>=wanted.length*4).sort((a,b)=>b.score-a.score);return ranked[0]?.tool||null;}
function mapArguments(tool,input){const output={};for(const [key,schema] of Object.entries(properties(tool))){const source=[key,...(aliases[key]||[])].find(name=>input[name]!==undefined);if(source)output[key]=input[source];else if(key==='calendar_id')output[key]='primary';else if(schema.default!==undefined)output[key]=schema.default;}const missing=required(tool).filter(key=>output[key]===undefined);if(missing.length)throw failure('INVALID_ARGUMENTS',`${tool.slug} requires: ${missing.join(', ')}`);return output;}

export async function executeConnectedOperation({toolkit,operation,arguments:input={},userId},dependencies={}){
 const listAccounts=dependencies.listAccounts||listComposioAccounts,listTools=dependencies.listTools||listComposioTools,execute=dependencies.execute||executeComposioTool;
 const accounts=await listAccounts({toolkit,userId},dependencies.fetchImpl),account=accounts.find(item=>String(item.status).toUpperCase()==='ACTIVE');if(!account)throw failure('AUTHENTICATION_REQUIRED',`${toolkit} is not connected.`);
 const tools=await listTools({toolkit,query:`${operation} ${terms[toolkit]?.[operation]?.join(' ')||''}`,limit:100},dependencies.fetchImpl),tool=select(tools,toolkit,operation);if(!tool)throw failure('CAPABILITY_UNAVAILABLE',`No ${toolkit} tool supports ${operation}.`);
 const args=mapArguments(tool,input),result=await execute({toolSlug:tool.slug,version:tool.version,arguments:args,connectedAccountId:account.id,userId},dependencies.fetchImpl);if(!result.successful)throw failure('PROVIDER_ERROR',result.error||`${toolkit}.${operation} failed.`);
 return{toolkit,operation,connectedAccountId:account.id,toolSlug:tool.slug,data:result.data,logId:result.logId,verified:true};
}
