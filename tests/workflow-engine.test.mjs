import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow, workflowSummary } from '../server/workflowEngine.js';
import { executeTool } from '../server/toolExecutor.js';
import { invokeToolRequest } from '../server/toolRuntime.js';

const localInvoke = async (state, request) => ({ status: 200, body: await executeTool(request.toolId, request.input, { state }) });

test('workflow executes canonical tools and persists actual results', async () => {
  const state = { activity: [], tasks: [{ id: 'real-task', title: 'Review', status: 'pending' }] };
  const workflow = { id: 'w-test', name: 'Test flow', state: 'active', runs: 0, steps: [
    { id: 'tasks', tool: 'tasks.list', arguments: {} },
    { id: 'models', tool: 'models.list', arguments: {}, dependsOn: ['tasks'] },
  ] };
  const run = await runWorkflow(state, workflow, { maxRetries: 1, invoke: localInvoke });
  assert.equal(run.state, 'completed');
  assert.equal(run.logs.length, 2);
  assert.equal(run.logs[0].result.data.tasks[0].id, 'real-task');
  assert.equal(workflow.runs, 1);
});

test('legacy text steps fail rather than falsely claiming success', async () => {
  const workflow = { id: 'legacy', name: 'Old flow', state: 'active', runs: 0, steps: ['Collect'] };
  const run = await runWorkflow({ activity: [] }, workflow, { invoke: localInvoke });
  assert.equal(run.state, 'failed');
  assert.match(run.reason, /no available canonical tool/);
});

test('workflow summary uses observed completed and failed runs', () => {
  const summary = workflowSummary([{ state: 'active', runs: 2, lastRun: { state: 'completed' } }, { state: 'paused', runs: 4, lastRun: { state: 'failed' } }]);
  assert.deepEqual(summary, { active: 1, paused: 1, runs: 6, successRate: 50 });
  assert.equal(workflowSummary([{ state: 'active', runs: 0 }]).successRate, null);
});

test('workflow dependencies block a run until prerequisites complete', async () => {
  const state = { activity: [], workflows: [{ id: 'dep', lastRun: null }] };
  const workflow = { id: 'child', name: 'Child', state: 'active', runs: 0, steps: [{ tool: 'models.list' }], dependsOn: ['dep'] };
  const run = await runWorkflow(state, workflow, { invoke: localInvoke });
  assert.equal(run.state, 'blocked');
});

test('approved workflow resumes the same Run and executes once', async () => {
  const workflow = { id: 'dangerous', name: 'Dangerous', state: 'active', runs: 0, steps: [{ id: 'command', tool: 'command.execute', arguments: { command: 'node --version' } }] };
  const state = { activity: [], approvals: [], toolExecutions: [], workflows: [workflow] };
  let calls = 0;
  const invoke = (current, request) => invokeToolRequest(current, request, {
    persist: async (mutator) => mutator(state),
    execute: async (toolId) => { calls += 1; return { ok: true, toolId, data: { calls } }; },
  });
  const pending = await runWorkflow(state, workflow, { invoke });
  assert.equal(pending.state, 'waiting_approval');
  assert.equal(pending.logs[0].state, 'waiting_approval');
  const waiting = await runWorkflow(state, workflow, { invoke, resume: true });
  assert.equal(waiting.state, 'waiting_approval');
  assert.equal(calls, 0);
  state.approvals[0].status = 'approved';
  const completed = await runWorkflow(state, workflow, { invoke, resume: true });
  assert.equal(completed.id, pending.id);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.logs.at(-1).result.data.calls, 1);
  assert.equal(workflow.runs, 1);
  assert.equal(calls, 1);
});
