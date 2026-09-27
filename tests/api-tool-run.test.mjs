import assert from 'node:assert/strict';
import test from 'node:test';
import { executeApiTool } from '../server/apiToolRun.js';
import { resolveApprovalRequest } from '../server/approvalContinuation.js';
import { invokeToolRequest } from '../server/toolRuntime.js';

function fixture() {
  const state = { runs: [], approvals: [], activity: [], toolExecutions: [] };
  let effects = 0;
  const persist = async (mutator) => mutator(state);
  const invoke = (current, request) => invokeToolRequest(current, request, { persist, execute: async (toolId) => { effects += 1; return { ok: true, toolId, data: { effects } }; } });
  const dependencies = { persist, read: async () => state, invoke };
  return { state, dependencies, effects: () => effects };
}

test('direct canonical API action creates a Run and approval resumes that exact step', async () => {
  const f = fixture();
  const request = { toolId: 'command.execute', input: { command: 'node --version' }, idempotencyKey: 'api-once' };
  const pending = await executeApiTool(f.state, request, f.dependencies);
  assert.equal(pending.status, 202);
  const run = f.state.runs[0];
  assert.equal(run.id, pending.body.runId);
  assert.equal(run.status, 'waiting_for_approval');
  assert.equal(run.steps[0].status, 'waiting_for_approval');
  const duplicatePending = await executeApiTool(f.state, request, f.dependencies);
  assert.equal(duplicatePending.body.approval.id, pending.body.approval.id);
  assert.equal(f.state.runs.length, 1);
  const approved = await resolveApprovalRequest(pending.body.approval.id, 'approved', f.dependencies);
  assert.equal(approved.status, 200);
  assert.equal(run.status, 'completed');
  assert.equal(run.steps[0].status, 'completed');
  assert.equal(f.effects(), 1);
  const replay = await executeApiTool(f.state, request, f.dependencies);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.runId, run.id);
  assert.equal(f.effects(), 1);
  const conflict = await executeApiTool(f.state, { ...request, input: { command: 'node -v' } }, f.dependencies);
  assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
});

test('read-only direct API tool produces a completed Run without approval', async () => {
  const f = fixture();
  const response = await executeApiTool(f.state, { toolId: 'tasks.list', input: {} }, f.dependencies);
  assert.equal(response.status, 200);
  assert.equal(f.state.runs[0].status, 'completed');
  assert.equal(f.state.approvals.length, 0);
});

test('concurrent duplicate API requests share one Run and one effect', async () => {
  const f = fixture();
  const request = { toolId: 'tasks.manage', input: { title: 'One task' }, idempotencyKey: 'same-client-key' };
  const [first, second] = await Promise.all([executeApiTool(f.state, request, f.dependencies), executeApiTool(f.state, request, f.dependencies)]);
  assert.equal(first.status, 200);
  assert.equal(second.body.replayed, true);
  assert.equal(first.body.runId, second.body.runId);
  assert.equal(f.state.runs.length, 1);
  assert.equal(f.effects(), 1);
});
