import assert from 'node:assert/strict';
import test from 'node:test';
import { due, occurrenceKey, tick } from '../server/scheduler.js';
import { dispatchWorkflowEvent, triggerMatches } from '../server/workflowEvents.js';

test('scheduler identifies active interval workflows when due', () => {
  const workflow = { state: 'active', schedule: { enabled: true, intervalSeconds: 60 }, lastRun: { finishedAt: new Date(0).toISOString() } };
  assert.equal(due(workflow, 61_000), true);
  assert.equal(due({ ...workflow, state: 'paused' }, 61_000), false);
});

test('scheduler tick runs all due workflows', async () => {
  const state = { activity: [], workflows: [{ id: 'w', name: 'Scheduled', state: 'active', runs: 0, steps: ['one'], schedule: { enabled: true, intervalSeconds: 10 }, lastRun: null }] };
  const runs = await tick(state, Date.now());
  assert.equal(runs.length, 1);
  assert.equal(state.workflows[0].runs, 1);
  assert.equal(state.workflows[0].schedulerState.lastOccurrenceKey, occurrenceKey(state.workflows[0]));
});

test('scheduler does not duplicate an occurrence or overlap an unfinished run', async () => {
  const now = 120_000;
  const workflow = { id: 'w', name: 'Scheduled', state: 'active', runs: 0, steps: [{ toolName: 'tasks.list', arguments: {} }], schedule: { enabled: true, intervalSeconds: 60 }, lastRun: null };
  const state = { activity: [], tasks: [], memories: [], approvals: [], runs: [], workflows: [workflow], runtime: {} };
  assert.equal((await tick(state, now)).length, 1);
  assert.equal((await tick(state, now + 1)).length, 0);
  workflow.schedulerState.lastOccurrenceKey = null;
  workflow.lastRun = { status: 'waiting_for_approval', startedAt: new Date(now).toISOString() };
  assert.equal(due(workflow, now + 120_000), false);
});

test('event conditions execute matching workflow once per durable event receipt', async () => {
  const workflow = { id: 'event-w', name: 'Important mail', state: 'active', runs: 0, trigger: 'event:gmail.message', triggerConditions: [{ path: 'payload.priority', operator: 'eq', value: 'urgent' }], steps: [{ toolName: 'tasks.list', arguments: {} }] };
  assert.equal(triggerMatches(workflow, { type: 'gmail.message', payload: { priority: 'normal' } }), false);
  assert.equal(triggerMatches(workflow, { type: 'gmail.message', payload: { priority: 'urgent' } }), true);
  const state = { activity: [], eventReceipts: [], tasks: [], memories: [], approvals: [], runs: [], workflows: [workflow], runtime: {} };
  const input = { id: 'message-1', type: 'gmail.message', source: 'gmail', payload: { priority: 'urgent' } };
  const first = await dispatchWorkflowEvent(state, input);
  const duplicate = await dispatchWorkflowEvent(state, input);
  assert.equal(first.runs.length, 1);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.runs.length, 0);
  assert.equal(workflow.runs, 1);
});
