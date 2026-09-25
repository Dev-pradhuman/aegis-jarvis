import assert from 'node:assert/strict';
import test from 'node:test';
import { executeModelToolLoop } from '../server/modelToolLoop.js';
import { executeModelPool } from '../server/modelPool.js';

test('model native tool call executes a grounded tool and continues to final answer', async () => {
  const requests = [];
  const model = async (input) => {
    requests.push(input);
    if (requests.length === 1) return { reply: '', toolCalls: [{ id: 'call-1', function: { name: 'tasks__list', arguments: '{}' } }], tokens: 5 };
    assert.equal(input.messagesOverride.at(-1).role, 'tool');
    assert.match(input.messagesOverride.at(-1).content, /real-task/);
    return { reply: 'One real task is pending.', toolCalls: [], tokens: 7 };
  };
  const state = { tasks: [{ id: 'real-task', title: 'Review' }] };
  const calls = [];
  const invoke = async (receivedState, request) => {
    assert.equal(receivedState, state);
    calls.push(request);
    return { status: 200, body: { ok: true, toolId: request.toolId, data: { tasks: state.tasks } } };
  };
  const result = await executeModelToolLoop({ request: 'What tasks do I have?', context: [], state, logicalModel: 'muse-spark-1.2', continuationState: { runId: 'run-real' } }, { model, invoke });
  assert.equal(result.reply, 'One real task is pending.');
  assert.equal(result.tokens, 12);
  assert.equal(result.executedToolCalls[0].status, 'completed');
  assert.equal(calls[0].runId, 'run-real');
  assert.ok(requests[0].toolSpecs.some((spec) => spec.function.name === 'tasks__list'));
  assert.ok(!requests[0].toolSpecs.some((spec) => spec.function.name === 'command__execute'));
});

test('unknown or malformed model tool calls return structured failure to model', async () => {
  const model = async (input) => input.messagesOverride.length === 1
    ? { toolCalls: [{ id: 'bad', function: { name: 'command__execute', arguments: '{' } }] }
    : { reply: 'I cannot execute that command.', toolCalls: [] };
  const result = await executeModelToolLoop({ request: 'Run command', context: [], state: {} }, { model });
  assert.equal(result.executedToolCalls[0].status, 'failed');
  assert.equal(result.executedToolCalls[0].result.code, 'TOOL_UNAVAILABLE');
});

test('model pool accepts a native tool-call response without treating it as empty', async () => {
  const original = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'fixture';
  try {
    const fetchImpl = async (_url, init) => {
      const sent = JSON.parse(init.body);
      assert.equal(sent.tools[0].function.name, 'tasks__list');
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'tasks__list', arguments: '{}' } }] } }], usage: { total_tokens: 3 } }) };
    };
    const result = await executeModelPool({ logicalModel: 'muse-spark-1.2', request: 'tasks?', state: {}, fetchImpl, toolSpecs: [{ type: 'function', function: { name: 'tasks__list', parameters: { type: 'object' } } }] });
    assert.equal(result.toolCalls.length, 1);
  } finally {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = original;
  }
});
