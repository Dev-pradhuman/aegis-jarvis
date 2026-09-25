import assert from 'node:assert/strict';
import test from 'node:test';
import { invokeToolRequest } from '../server/toolRuntime.js';
import { actionFingerprint } from '../server/idempotency.js';

const persistFor = (state) => async (mutator) => mutator(state);

test('runtime approval binds exact tool, arguments, run and one use', async () => {
  const state = { approvals: [], activity: [], toolExecutions: [] };
  let executed = 0;
  const dependencies = { persist: persistFor(state), execute: async (toolId) => { executed += 1; return { ok: true, toolId, data: { executed } }; } };
  const initial = await invokeToolRequest(state, { toolId: 'command.execute', input: { command: 'node --version' }, runId: 'run-1' }, dependencies);
  assert.equal(initial.status, 202);
  assert.equal(executed, 0);
  const approval = initial.body.approval;
  approval.status = 'approved';
  const wrongRun = await invokeToolRequest(state, { toolId: 'command.execute', input: { command: 'node --version' }, approvalId: approval.id, runId: 'run-2' }, dependencies);
  assert.equal(wrongRun.status, 403);
  const wrongCommand = await invokeToolRequest(state, { toolId: 'command.execute', input: { command: 'node -v' }, approvalId: approval.id, runId: 'run-1' }, dependencies);
  assert.equal(wrongCommand.status, 403);
  const accepted = await invokeToolRequest(state, { toolId: 'command.execute', input: { command: 'node --version' }, approvalId: approval.id, runId: 'run-1' }, dependencies);
  assert.equal(accepted.status, 200);
  assert.equal(executed, 1);
  const replay = await invokeToolRequest(state, { toolId: 'command.execute', input: { command: 'node --version' }, approvalId: approval.id, runId: 'run-1' }, dependencies);
  assert.equal(replay.status, 403);
});

test('concurrent idempotent side effects execute once', async () => {
  const state = { approvals: [{ id: 'approved', status: 'approved', toolName: 'command.execute', actionHash: actionFingerprint('command.execute', { command: 'node --version' }), runId: null, expiresAt: new Date(Date.now() + 60000).toISOString() }], activity: [], toolExecutions: [] };
  let calls = 0;
  const dependencies = { persist: persistFor(state), execute: async (toolId) => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { ok: true, toolId, data: { calls } }; } };
  const request = { toolId: 'command.execute', input: { command: 'node --version' }, approvalId: 'approved', idempotencyKey: 'same-action' };
  const [first, second] = await Promise.all([invokeToolRequest(state, request, dependencies), invokeToolRequest(state, request, dependencies)]);
  assert.equal(first.status, 200);
  assert.equal(second.body.replayed, true);
  assert.equal(calls, 1);
  const replay = await invokeToolRequest(state, request, dependencies);
  assert.equal(replay.body.replayed, true);
  assert.equal(calls, 1);
});

test('failed side effect remains reserved so restart cannot blindly duplicate it', async () => {
  const state = { approvals: [], activity: [], toolExecutions: [] };
  let calls = 0;
  const dependencies = { persist: persistFor(state), execute: async () => { calls += 1; throw new Error('Connection lost after send'); } };
  const request = { toolId: 'apps.open', input: { name: 'Calculator' }, idempotencyKey: 'open-once' };
  await assert.rejects(invokeToolRequest(state, request, dependencies), /Connection lost/);
  assert.equal(state.toolExecutions[0].state, 'in_progress');
  const retry = await invokeToolRequest(state, request, dependencies);
  assert.equal(retry.status, 409);
  assert.equal(retry.body.code, 'ACTION_OUTCOME_UNKNOWN');
  assert.equal(calls, 1);
});

test('canonical task creation persists once and replays the same task for a duplicate request', async () => {
  const state = { tasks: [], approvals: [], activity: [], toolExecutions: [] };
  const request = { toolId: 'tasks.manage', input: { title: 'Review JARVIS' }, idempotencyKey: 'task-once' };
  const dependencies = { persist: persistFor(state) };
  const first = await invokeToolRequest(state, request, dependencies);
  const second = await invokeToolRequest(state, request, dependencies);
  assert.equal(first.status, 200);
  assert.equal(state.tasks.length, 1);
  assert.equal(second.body.replayed, true);
  assert.equal(second.body.data.task.id, first.body.data.task.id);
});
