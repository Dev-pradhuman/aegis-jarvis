import assert from 'node:assert/strict';
import test from 'node:test';
import { findToolReplay, rememberToolResult } from '../server/idempotency.js';

test('successful side effect can be replayed without executing it again', () => {
  const state = { toolExecutions: [] };
  const result = { ok: true, data: { sent: true } };
  rememberToolResult(state, { idempotencyKey: 'run-1:send-1', runId: 'run-1', toolId: 'messages.send', input: { channel: 'ops', text: 'hello' }, result });
  const replay = findToolReplay(state, 'run-1:send-1', 'messages.send', { text: 'hello', channel: 'ops' });
  assert.deepEqual(replay.result, result);
  assert.equal(state.toolExecutions.length, 1);
});

test('idempotency key cannot be reused with mutated arguments', () => {
  const state = { toolExecutions: [] };
  rememberToolResult(state, { idempotencyKey: 'run-1:write-1', toolId: 'files.write', input: { path: 'a.txt', content: 'one' }, result: { ok: true } });
  assert.throws(() => findToolReplay(state, 'run-1:write-1', 'files.write', { path: 'a.txt', content: 'two' }), (error) => error.code === 'IDEMPOTENCY_CONFLICT');
});
