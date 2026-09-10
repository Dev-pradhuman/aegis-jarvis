import test from 'node:test';import assert from 'node:assert/strict';import {executeToolCall} from '../server/toolExecutor.js';
const state=()=>({runs:[],approvals:[],activity:[],runtime:{}});
async function approved(tool,args,s){let result=await executeToolCall({toolName:tool,arguments:args,requestedBy:'file-test'},{state:s});assert.equal(result.status,'waiting_for_approval');result.approval.status='approved';return executeToolCall({toolName:tool,arguments:args,approvalId:result.approval.id,requestedBy:'file-test'},{state:s});}
test('workspace file lifecycle executes, verifies, and cleans up through canonical tools',async()=>{
 const s=state(),dir=`tmp-jarvis-${Date.now()}`,first=`${dir}/one.txt`,copy=`${dir}/copy.txt`,moved=`${dir}/moved.txt`;
 assert.equal((await approved('files.mkdir',{path:dir},s)).status,'completed');
 assert.equal((await approved('files.create',{path:first,content:'canonical executor marker'},s)).status,'completed');
 const read=await executeToolCall({toolName:'files.read',arguments:{path:first}},{state:s});assert.equal(read.output.content,'canonical executor marker');
 const search=await executeToolCall({toolName:'files.search',arguments:{query:'executor marker',path:dir}},{state:s});assert.equal(search.output.results[0].path,first);
 assert.equal((await approved('files.copy',{path:first,destination:copy},s)).status,'completed');
 assert.equal((await approved('files.move',{path:copy,destination:moved},s)).status,'completed');
 for(const path of [first,moved])assert.equal((await approved('files.delete',{path},s)).status,'completed');
 assert.equal((await approved('files.delete',{path:dir},s)).status,'completed');
});
test('file tools reject traversal and protected credential/state paths',async()=>{
 const s=state();const outside=await executeToolCall({toolName:'files.read',arguments:{path:'../../outside.txt'}},{state:s});assert.equal(outside.error.code,'PERMISSION_DENIED');
 let protectedWrite=await executeToolCall({toolName:'files.write',arguments:{path:'server/data/state.json',content:'bad'},requestedBy:'file-test'},{state:s});protectedWrite.approval.status='approved';protectedWrite=await executeToolCall({toolName:'files.write',arguments:{path:'server/data/state.json',content:'bad'},approvalId:protectedWrite.approval.id,requestedBy:'file-test'},{state:s});assert.equal(protectedWrite.error.code,'PERMISSION_DENIED');
});
