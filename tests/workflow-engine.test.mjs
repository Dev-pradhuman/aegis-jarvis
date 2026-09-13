import assert from 'node:assert/strict';
import test from 'node:test';
import { resumeWorkflowAfterApproval, runWorkflow, workflowSummary } from '../server/workflowEngine.js';

const stateFor = (workflow) => ({ tasks: [], memories: [], approvals: [], activity: [], runs: [], workflows: [workflow], runtime: {} });

test('workflow executes real canonical tools and persists verified completion evidence', async () => {
  const workflow = { id: 'w-test', name: 'Test flow', state: 'active', runs: 0, steps: [
    { id: 'one', toolName: 'tasks.create', arguments: { title: 'First workflow task' } },
    { id: 'two', toolName: 'tasks.create', arguments: { title: 'Second workflow task' }, dependsOn: ['one'] },
  ] };
  const state = stateFor(workflow);
  const view = await runWorkflow(state, workflow);
  assert.equal(view.state, 'completed');
  assert.equal(view.step, 2);
  assert.equal(state.tasks.length, 2);
  assert.equal(view.logs.length, 2);
  assert.ok(view.logs.every((entry) => entry.toolCallId && entry.verification?.persisted));
  assert.ok(state.runs[0].toolCalls.every((call) => call.status === 'completed' && call.verified));
});

test('legacy/planned text steps are not falsely marked completed', async () => {
  const workflow = { id: 'legacy', name: 'Legacy', state: 'active', runs: 0, steps: ['Pretend to create a task'] };
  const state = stateFor(workflow);
  const view = await runWorkflow(state, workflow);
  assert.equal(view.state, 'failed');
  assert.equal(state.tasks.length, 0);
  assert.match(state.runs[0].errors[0].message, /structured objects/);
});

test('failed real tool makes the workflow and step fail', async () => {
  const workflow = { id: 'failure', name: 'Failure', state: 'active', runs: 0, steps: [{ id: 'read', toolName: 'files.read', arguments: { path: 'does-not-exist.txt' } }] };
  const state = stateFor(workflow);
  const view = await runWorkflow(state, workflow);
  assert.equal(view.state, 'failed');
  assert.equal(view.logs[0].state, 'failed');
  assert.equal(state.runs[0].toolCalls[0].verified, false);
});

test('approval pauses workflow and resumes the same Run after exact approval', async () => {
  const workflow = { id: 'approval', name: 'Approval', state: 'active', runs: 0, steps: [{ id: 'command', toolName: 'command.execute', arguments: { command: 'node --version' } }] };
  const state = stateFor(workflow);
  const waiting = await runWorkflow(state, workflow);
  assert.equal(waiting.state, 'waiting_for_approval');
  assert.equal(state.approvals.length, 1);
  const approval = state.approvals[0]; approval.status = 'approved';
  const completed = await resumeWorkflowAfterApproval(state, approval);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.runId, waiting.runId);
  assert.equal(approval.status, 'consumed');
  assert.equal(completed.logs[0].verification.exitCode, 0);
});

test('workflow dependencies and circular step dependencies fail explicitly', async () => {
  const dependency = { id: 'dep', lastRun: null };
  const child = { id: 'child', name: 'Child', state: 'active', runs: 0, steps: [{ id: 'one', toolName: 'tasks.list', arguments: {} }], dependsOn: ['dep'] };
  const state = { ...stateFor(child), workflows: [dependency, child] };
  const blocked = await runWorkflow(state, child);
  assert.equal(blocked.state, 'failed');
  assert.match(blocked.reason, /Dependencies/);

  const circular = { id: 'circular', name: 'Circular', state: 'active', runs: 0, steps: [
    { id: 'a', toolName: 'tasks.list', arguments: {}, dependsOn: ['b'] },
    { id: 'b', toolName: 'tasks.list', arguments: {}, dependsOn: ['a'] },
  ] };
  const circularState = stateFor(circular);
  const circularView = await runWorkflow(circularState, circular);
  assert.equal(circularView.state, 'failed');
  assert.match(circularView.logs[0].error.message, /circular dependency/);
});

test('workflow summary is based on real terminal outcomes', () => {
  const summary = workflowSummary([
    { state: 'active', runs: 2, lastRun: { status: 'completed' } },
    { state: 'paused', runs: 4, lastRun: { status: 'failed' } },
  ]);
  assert.deepEqual(summary, { active: 1, paused: 1, runs: 6, successRate: 50 });
});

test('workflow retry exhaustion is recorded and never reported as completed', async () => {
  const workflow = { id: 'retry', name: 'Retry', state: 'active', runs: 0, steps: [{ id: 'missing', toolName: 'files.read', arguments: { path: 'still-missing.txt' }, maxRetries: 2 }] };
  const state = stateFor(workflow);
  const view = await runWorkflow(state, workflow);
  assert.equal(view.state, 'failed');
  assert.equal(view.attempts, 3);
  assert.equal(view.logs[0].retryCount, 2);
  assert.notEqual(view.logs[0].state, 'completed');
});

test('paused workflows resume the same Run and cancelled workflows remain terminal', async () => {
  const pausedWorkflow = { id: 'pause', name: 'Pause', state: 'paused', runs: 0, steps: [{ id: 'list', toolName: 'tasks.list', arguments: {} }] };
  const pausedState = stateFor(pausedWorkflow);
  const paused = await runWorkflow(pausedState, pausedWorkflow);
  assert.equal(paused.state, 'paused');
  pausedWorkflow.state = 'active';
  const resumed = await runWorkflow(pausedState, pausedWorkflow, { resumeRunId: paused.runId });
  assert.equal(resumed.state, 'completed');
  assert.equal(resumed.runId, paused.runId);

  const cancelledWorkflow = { id: 'cancel', name: 'Cancel', state: 'cancelled', runs: 0, steps: [{ id: 'list', toolName: 'tasks.list', arguments: {} }] };
  const cancelledState = stateFor(cancelledWorkflow);
  const cancelled = await runWorkflow(cancelledState, cancelledWorkflow);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelledState.tasks.length, 0);
});
