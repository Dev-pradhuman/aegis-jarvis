import assert from 'node:assert/strict';
import test from 'node:test';
import { approvalDecision, validateApprovalRules } from '../server/approvalPolicy.js';
import { invokeToolRequest } from '../server/toolRuntime.js';
import { getTool } from '../server/registry.js';

function fixture(policy = { mode: 'SAFE', rules: [] }) {
  const state = { approvalPolicy: policy, approvals: [], activity: [], toolExecutions: [] };
  let calls = 0;
  const dependencies = { persist: async (mutator) => mutator(state), execute: async (toolId) => { calls += 1; return { ok: true, toolId, data: { calls } }; } };
  return { state, dependencies, calls: () => calls };
}

test('Safe mode keeps read actions free and shell actions approval-bound', async () => {
  const f = fixture();
  const read = await invokeToolRequest(f.state, { toolId: 'tasks.list', input: {} }, f.dependencies);
  const shell = await invokeToolRequest(f.state, { toolId: 'command.execute', input: { command: 'node --version' } }, f.dependencies);
  assert.equal(read.status, 200);
  assert.equal(shell.status, 202);
  assert.equal(f.calls(), 1);
});

test('Custom rules bind target identity and one-use allowance', async () => {
  const rules = validateApprovalRules([{ toolId: 'command.execute', effect: 'allow_once', runId: 'run-one' }]);
  const f = fixture({ mode: 'CUSTOM', rules });
  const wrongRun = await invokeToolRequest(f.state, { toolId: 'command.execute', input: { command: 'node --version' }, runId: 'run-two', idempotencyKey: 'wrong' }, f.dependencies);
  assert.equal(wrongRun.status, 202);
  assert.equal(f.calls(), 0);
  const first = await invokeToolRequest(f.state, { toolId: 'command.execute', input: { command: 'node --version' }, runId: 'run-one', idempotencyKey: 'first' }, f.dependencies);
  assert.equal(first.status, 200);
  assert.equal(f.state.approvalPolicy.rules.length, 0);
  assert.equal(f.state.approvals.find((approval) => approval.automatic)?.status, 'consumed');
  const second = await invokeToolRequest(f.state, { toolId: 'command.execute', input: { command: 'node --version' }, runId: 'run-one', idempotencyKey: 'second' }, f.dependencies);
  assert.equal(second.status, 202);
  assert.equal(f.calls(), 1);
});

test('Full mode requires authenticated activation and keeps idempotency', async () => {
  const f = fixture({ mode: 'FULL', fullActivatedAt: new Date().toISOString(), rules: [] });
  assert.equal(approvalDecision(f.state, getTool('command.execute'), {}, {}, {}).action, 'ASK');
  const oldToken = process.env.JARVIS_AUTH_TOKEN;
  process.env.JARVIS_AUTH_TOKEN = 'local-test-auth';
  try {
    const missingKey = await invokeToolRequest(f.state, { toolId: 'command.execute', input: { command: 'node --version' } }, f.dependencies);
    assert.equal(missingKey.body.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const request = { toolId: 'command.execute', input: { command: 'node --version' }, runId: 'run-full', idempotencyKey: 'full-once' };
    const first = await invokeToolRequest(f.state, request, f.dependencies);
    const replay = await invokeToolRequest(f.state, request, f.dependencies);
    assert.equal(first.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(f.calls(), 1);
  } finally {
    if (oldToken === undefined) delete process.env.JARVIS_AUTH_TOKEN; else process.env.JARVIS_AUTH_TOKEN = oldToken;
  }
});

test('Custom deny refuses the action before execution', async () => {
  const f = fixture({ mode: 'CUSTOM', rules: validateApprovalRules([{ toolId: 'command.execute', effect: 'deny' }]) });
  const response = await invokeToolRequest(f.state, { toolId: 'command.execute', input: { command: 'node --version' }, idempotencyKey: 'deny' }, f.dependencies);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, 'APPROVAL_POLICY_DENIED');
  assert.equal(f.calls(), 0);
});
