import { execFile as nodeExecFile } from 'node:child_process';import { promisify } from 'node:util';import path from 'node:path';import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),defaultExec=promisify(nodeExecFile);
function failure(code,message){return Object.assign(new Error(message),{code});}
function safeName(value,label='value'){const text=String(value||'').trim();if(!text||text.startsWith('-')||/[\0\r\n]/.test(text))throw failure('INVALID_ARGUMENTS',`Invalid ${label}.`);return text;}
async function run(executable,args,options={}){try{const result=await(options.execFile||defaultExec)(executable,args,{cwd:root,timeout:options.timeout||60000,windowsHide:true,maxBuffer:2_000_000});return{stdout:String(result.stdout||''),stderr:String(result.stderr||''),exitCode:0,verified:true};}catch(error){throw failure(error.killed?'TIMEOUT':'EXECUTION_FAILED',`${executable} failed: ${String(error.stderr||error.message).slice(0,1000)}`);}}
export async function developerAction(action,args={},options={}){switch(action){
 case'git.status':return run('git',['status','--short','--branch'],options);
 case'git.diff':return run('git',['diff',...(args.staged?['--cached']:[]),'--stat','--patch'],options);
 case'git.log':return run('git',['log',`-${args.limit||20}`,'--date=iso-strict','--pretty=format:%H%x09%ad%x09%an%x09%s'],options);
 case'git.branches':return run('git',['branch','--list','--format=%(refname:short)%09%(HEAD)'],options);
 case'git.branch.create':return run('git',['branch',safeName(args.name,'branch name')],options);
 case'git.branch.switch':return run('git',['switch',safeName(args.name,'branch name')],options);
 case'git.commit':{const files=(args.paths||[]).map(value=>safeName(value,'path'));if(files.length)await run('git',['add','--',...files],options);return run('git',['commit','-m',safeName(args.message,'commit message')],options);}
 case'git.pull':return run('git',['pull','--ff-only',...(args.remote?[safeName(args.remote,'remote')]:[]),...(args.branch?[safeName(args.branch,'branch')]:[])],options);
 case'git.push':return run('git',['push',...(args.remote?[safeName(args.remote,'remote')]:[]),...(args.branch?[safeName(args.branch,'branch')]:[])],options);
 case'dev.test':return run(process.platform==='win32'?'npm.cmd':'npm',['test'],{...options,timeout:options.timeout||180000});
 case'github.issues.list':return run('gh',['issue','list','--limit',String(args.limit||30),'--json','number,title,state,author,updatedAt,url'],options);
 case'github.prs.list':return run('gh',['pr','list','--limit',String(args.limit||30),'--json','number,title,state,author,updatedAt,url,headRefName'],options);
 case'github.search':return run('gh',['search',args.kind||'code',safeName(args.query,'search query'),'--limit',String(args.limit||30),'--json',args.kind==='issues'?'number,title,state,url,repository':'path,url,repository'],options);
 default:throw failure('INVALID_ARGUMENTS',`Unsupported developer action: ${action}`);
}}
