import assert from 'node:assert/strict';
import test from 'node:test';
import { due, tick } from '../server/scheduler.js';

test('scheduler identifies active interval workflows when due', () => {
  const workflow = { state: 'active', schedule: { enabled: true, intervalSeconds: 60 }, lastRun: { finishedAt: new Date(0).toISOString() } };
  assert.equal(due(workflow, 61_000), true);
  assert.equal(due({ ...workflow, state: 'paused' }, 61_000), false);
});

test('scheduler tick runs all due workflows', async () => {
  const state = { activity: [], workflows: [{ id: 'w', name: 'Scheduled', state: 'active', runs: 0, steps: [{ tool: 'models.list', arguments: {} }], schedule: { enabled: true, intervalSeconds: 10 }, lastRun: null }] };
  const runs = await tick(state, Date.now(), { invoke: async (_state, request) => ({ status: 200, body: { ok: true, toolId: request.toolId, data: {} } }) });
  assert.equal(runs.length, 1);
  assert.equal(state.workflows[0].runs, 1);
});
