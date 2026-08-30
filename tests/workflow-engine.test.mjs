import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkflow, workflowSummary } from '../server/workflowEngine.js';

test('workflow runs execute steps sequentially and persist a completed run', async () => {
  const state = { activity: [] };
  const workflow = { id: 'w-test', name: 'Test flow', state: 'active', runs: 0, steps: ['A', 'B', 'C'] };
  const run = await runWorkflow(state, workflow, { maxRetries: 1 });
  assert.equal(run.state, 'completed');
  assert.equal(run.step, 3);
  assert.equal(run.logs.length, 3);
  assert.equal(workflow.runs, 1);
  assert.equal(state.activity[0].type, 'workflow.completed');
});

test('workflow summary reflects active and paused definitions', () => {
  const summary = workflowSummary([{ state: 'active', runs: 2 }, { state: 'paused', runs: 4 }]);
  assert.deepEqual(summary, { active: 1, paused: 1, runs: 6, successRate: 100 });
});

test('workflow dependencies block a run until prerequisites complete', async () => {
  const state = { activity: [], workflows: [{ id: 'dep', lastRun: null }] };
  const workflow = { id: 'child', name: 'Child', state: 'active', runs: 0, steps: ['one'], dependsOn: ['dep'] };
  const run = await runWorkflow(state, workflow);
  assert.equal(run.state, 'blocked');
  assert.match(run.reason, /Dependencies/);
});
