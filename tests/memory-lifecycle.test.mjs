import test from 'node:test';
import assert from 'node:assert/strict';
import { executeToolCall } from '../server/toolExecutor.js';

test('memory lifecycle preserves metadata and exact approved deletion',async()=>{
 const state={runs:[],approvals:[],activity:[],runtime:{},memories:[]};
 const stored=await executeToolCall({toolName:'memory.store',arguments:{text:'VIRALYST uses the canonical executor',kind:'project'},requestedBy:'local-user'},{state,projectId:'viralist'});
 assert.equal(stored.status,'completed');assert.equal(stored.output.memory.source,'local-user');assert.equal(stored.output.memory.projectId,'viralist');assert.equal(stored.output.memory.runId,stored.runId);
 const id=stored.output.memory.id;const updated=await executeToolCall({toolName:'memory.update',arguments:{id,text:'VIRALYST uses one verified canonical executor',importance:'high',confidence:.95}},{state});
 assert.equal(updated.output.memory.importance,'high');assert.equal(updated.output.memory.confidence,.95);assert.ok(updated.output.memory.updatedAt);
 let removed=await executeToolCall({toolName:'memory.delete',arguments:{id},requestedBy:'local-user'},{state});assert.equal(removed.status,'waiting_for_approval');assert.equal(state.memories.length,1);
 removed.approval.status='approved';removed=await executeToolCall({toolName:'memory.delete',arguments:{id},approvalId:removed.approval.id,requestedBy:'local-user'},{state});assert.equal(removed.status,'completed');assert.equal(state.memories.length,0);assert.equal(removed.verificationEvidence.absent,true);
});
