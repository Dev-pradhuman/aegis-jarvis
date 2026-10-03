import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApprovalRequest } from '../server/approvalContinuation.js';
import { invokeToolRequest } from '../server/toolRuntime.js';
import { runWorkflow, resumeWorkflowForApproval } from '../server/workflowEngine.js';
import { addRunStep, createRun, transitionRun } from '../server/runEngine.js';

function fixture() {
  const state = { approvals: [], activity: [], toolExecutions: [], runs: [], workflows: [], tasks: [] };
  const persist = async (mutator) => mutator(state);
  let calls = 0;
  const invoke = (current, request) => invokeToolRequest(current, request, {
    persist,
    execute: async (toolId) => { calls += 1; return { ok: true, toolId, data: { calls } }; },
  });
  const dependencies = { persist, read: async () => state, invoke,
    resumeWorkflow: (current, id) => resumeWorkflowForApproval(current, id, { invoke }) };
  return { state, invoke, dependencies, calls: () => calls };
}

test('approve resumes the same deterministic Run and exact step once', async () => {
  const f = fixture();
  const run = transitionRun(createRun({ request: 'Execute a harmless version check', type: 'tool' }), 'running');
  const step = addRunStep(run, 'Version check', 'command.execute', true);
  run.origin = 'chat';
  f.state.runs.push(run);
  const pending = await f.invoke(f.state, { toolId: 'command.execute', input: { command: 'node --version' }, runId: run.id, stepId: step.id, idempotencyKey: `${run.id}:${step.id}`, resumeOnApproval: true });
  assert.equal(pending.status, 202);
  assert.match(pending.body.approval.sub, /node --version/);
  step.status = 'waiting_for_approval';
  transitionRun(run, 'waiting_for_approval');
  const result = await resolveApprovalRequest(pending.body.approval.id, 'approved', f.dependencies);
  assert.equal(result.status, 200);
  assert.equal(result.body.result.ok, true);
  assert.equal(run.id, pending.body.approval.runId);
  assert.equal(run.status, 'completed');
  assert.equal(step.status, 'completed');
  assert.equal(f.calls(), 1);
  assert.equal(f.state.approvals[0].status, 'consumed');
  assert.equal(f.state.conversations.length, 2);
  assert.match(f.state.conversations[1].lines[0], /completed/);
  const duplicate = await resolveApprovalRequest(pending.body.approval.id, 'approved', f.dependencies);
  assert.equal(duplicate.status, 404);
  assert.equal(f.calls(), 1);
  assert.equal(f.state.conversations.length, 2);
});

test('approval automatically continues the same workflow through later steps', async () => {
  const f = fixture();
  const workflow = { id: 'test-flow', name: 'Test flow', state: 'active', runs: 0, steps: [
    { id: 'before', tool: 'tasks.list', arguments: {} },
    { id: 'approved', tool: 'command.execute', arguments: { command: 'node --version' }, dependsOn: ['before'] },
    { id: 'after', tool: 'tasks.list', arguments: {}, dependsOn: ['approved'] },
  ] };
  f.state.workflows.push(workflow);
  const pending = await runWorkflow(f.state, workflow, { invoke: f.invoke });
  assert.equal(pending.state, 'waiting_approval');
  assert.equal(f.state.runs.find((run) => run.id === pending.id)?.status, 'waiting_for_approval');
  const approvalId = pending.logs.at(-1).approvalId;
  const result = await resolveApprovalRequest(approvalId, 'approved', f.dependencies);
  assert.equal(result.status, 200);
  assert.equal(result.body.run.id, pending.id);
  assert.equal(result.body.run.state, 'completed');
  assert.equal(f.state.runs.find((run) => run.id === pending.id)?.status, 'completed');
  assert.deepEqual(result.body.run.logs.filter((log) => log.state === 'completed').map((log) => log.id), ['before', 'approved', 'after']);
  assert.equal(f.calls(), 3);
  assert.equal(workflow.runs, 1);
  assert.equal((await resolveApprovalRequest(approvalId, 'approved', f.dependencies)).status, 404);
  assert.equal(f.calls(), 3);
});

test('rejection and expiry stop pending workflow execution', async () => {
  for (const expired of [false, true]) {
    const f = fixture();
    const workflow = { id: 'stop-flow', name: 'Stop flow', state: 'active', runs: 0, steps: [{ id: 'approved', tool: 'command.execute', arguments: { command: 'node --version' } }] };
    f.state.workflows.push(workflow);
    const pending = await runWorkflow(f.state, workflow, { invoke: f.invoke });
    const approval = f.state.approvals[0];
    if (expired) approval.expiresAt = new Date(Date.now() - 1).toISOString();
    const result = await resolveApprovalRequest(approval.id, expired ? 'approved' : 'rejected', f.dependencies);
    assert.equal(result.status, expired ? 410 : 200);
    assert.equal(result.body.run.id, pending.id);
    assert.equal(result.body.run.state, 'failed');
    assert.equal(f.state.runs.find((run) => run.id === pending.id).steps[0].status, 'failed');
    assert.equal(f.calls(), 0);
  }
});

test('a direct canonical approval continues its stored request without a second prompt', async () => {
  const f = fixture();
  const pending = await f.invoke(f.state, { toolId: 'command.execute', input: { command: 'node --version' } });
  assert.equal(pending.status, 202);
  assert.equal(pending.body.approval.pendingRequest.input.command, 'node --version');
  const approved = await resolveApprovalRequest(pending.body.approval.id, 'approved', f.dependencies);
  assert.equal(approved.status, 200);
  assert.equal(f.calls(), 1);
  assert.equal(f.state.approvals[0].status, 'consumed');
});
