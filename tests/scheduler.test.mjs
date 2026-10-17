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

test('scheduler tick claims due reminders and sets ringing state', async () => {
  const now = Date.now();
  const spoken = [];
  const state = {
    activity: [],
    workflows: [],
    reminders: [
      { id: 'rem-1', title: 'Take medicine', dueAt: new Date(now - 1000).toISOString(), status: 'scheduled', ringing: false }
    ]
  };
  await tick(state, now, {
    execute: async () => {},
    voicePipeline: {
      speak: async (msg) => { spoken.push(msg); }
    }
  });
  assert.equal(state.reminders[0].status, 'due');
  assert.equal(state.reminders[0].ringing, true);
  assert.ok(spoken.some((msg) => msg.includes('Take medicine')));
});

test('calendar.create and gmail.send require exact approval', async () => {
  const { executeTool } = await import('../server/toolExecutor.js');
  const state = { approvals: [], activity: [] };
  
  // calendar.create without approval throws
  await assert.rejects(
    () => executeTool('calendar.create', { summary: 'Standup', startTime: new Date().toISOString(), endTime: new Date().toISOString() }, { state }),
    (err) => err.code === 'APPROVAL_REQUIRED' || err.message.includes('approval')
  );

  // gmail.send without approval throws
  await assert.rejects(
    () => executeTool('gmail.send', { to: 'test@example.com', subject: 'Hi', body: 'Test' }, { state }),
    (err) => err.code === 'APPROVAL_REQUIRED' || err.message.includes('approval')
  );
});

