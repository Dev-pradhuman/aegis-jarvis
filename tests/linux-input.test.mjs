import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createLinuxInput, parseKeypress } from '../server/platform/linux/input.js';
import { getTool } from '../server/registry.js';
import { invokeToolRequest } from '../server/toolRuntime.js';
import { routeRequest } from '../server/router.js';

test('desktop key parser accepts bounded combinations and rejects modifier-only input', () => {
  assert.deepEqual(parseKeypress('Ctrl + Alt + J'), [0xffe3, 0xffe9, 106]);
  assert.deepEqual(parseKeypress('Enter'), [0xff0d]);
  assert.deepEqual(parseKeypress('F12'), [0xffc9]);
  assert.throws(() => parseKeypress('Ctrl+Alt'));
  assert.throws(() => parseKeypress('Ctrl+Ctrl+J'));
  assert.throws(() => parseKeypress('Ctrl+J+K'));
});

test('unambiguous dictation and key commands route without a model', () => {
  assert.deepEqual(routeRequest('type: how to make a Jarvis from beginning').args, { text: 'how to make a Jarvis from beginning' });
  assert.equal(routeRequest('press Ctrl+L').capability, 'computer.keypress');
  assert.equal(routeRequest('press Enter').args.keys, 'Enter');
  assert.equal(routeRequest('what type of computer is this').route, 'MODEL');
});

test('desktop input provider reuses a single helper and cleans up', async () => {
  let launches = 0;
  let killed = 0;
  const requests = [];
  const spawnImpl = (_program, _args, options) => {
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']);
    launches++;
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => { killed++; child.emit('exit', 0); };
    child.stdin.on('data', (chunk) => {
      const request = JSON.parse(chunk.toString());
      requests.push(request);
      child.stdout.write(`${JSON.stringify({ id: request.id, ok: true, sent: request.action === 'type' ? request.text.length : request.symbols.length })}\n`);
    });
    return child;
  };
  const input = createLinuxInput({ spawnImpl, idleTimeoutMs: 1000 });
  assert.equal((await input.keypress('Ctrl+J')).sent, 2);
  assert.equal((await input.type('hello')).sent, 5);
  assert.throws(() => input.type('hello\n'), /Use computer.keypress/);
  assert.equal(launches, 1);
  assert.deepEqual(requests.map((request) => request.action), ['keypress', 'type']);
  input.close();
  assert.equal(killed, 1);
});

test('desktop input remains disabled by default and requires exact one-use approval', async () => {
  const previous = { flag: process.env.JARVIS_DESKTOP_INPUT, token: process.env.JARVIS_AUTH_TOKEN };
  try {
    delete process.env.JARVIS_DESKTOP_INPUT;
    delete process.env.JARVIS_AUTH_TOKEN;
    assert.equal(getTool('computer.type').enabled, false);
    process.env.JARVIS_DESKTOP_INPUT = '1';
    process.env.JARVIS_AUTH_TOKEN = 'test-token';
    assert.equal(getTool('computer.type').enabled, process.platform === 'linux');
    if (process.platform !== 'linux') return;
    const state = { approvals: [], activity: [], toolExecutions: [] };
    const persist = async (mutate) => mutate(state);
    const execute = async (toolId, input) => ({ ok: true, toolId, data: { sent: input.text.length } });
    const missingKey = await invokeToolRequest(state, { toolId: 'computer.type', input: { text: 'hello' } }, { persist, execute });
    assert.equal(missingKey.body.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const pending = await invokeToolRequest(state, { toolId: 'computer.type', input: { text: 'hello' }, idempotencyKey: 'input-1' }, { persist, execute });
    assert.equal(pending.status, 202);
    assert.match(pending.body.approval.sub, /hello/);
    pending.body.approval.status = 'approved';
    const wrong = await invokeToolRequest(state, { toolId: 'computer.type', input: { text: 'other' }, idempotencyKey: 'input-2', approvalId: pending.body.approval.id }, { persist, execute });
    assert.equal(wrong.status, 403);
    const correct = await invokeToolRequest(state, { toolId: 'computer.type', input: { text: 'hello' }, idempotencyKey: 'input-1', approvalId: pending.body.approval.id }, { persist, execute });
    assert.equal(correct.status, 200);
    assert.equal(state.approvals[0].status, 'consumed');
    const chatPending = await invokeToolRequest(state, { toolId: 'computer.keypress', input: { keys: 'Enter' }, runId: 'run-chat', idempotencyKey: 'input-chat', resumeOnApproval: true }, { persist, execute });
    assert.deepEqual(chatPending.body.approval.pendingRequest, { toolId: 'computer.keypress', input: { keys: 'Enter' }, runId: 'run-chat', idempotencyKey: 'input-chat' });
  } finally {
    if (previous.flag === undefined) delete process.env.JARVIS_DESKTOP_INPUT; else process.env.JARVIS_DESKTOP_INPUT = previous.flag;
    if (previous.token === undefined) delete process.env.JARVIS_AUTH_TOKEN; else process.env.JARVIS_AUTH_TOKEN = previous.token;
  }
});
