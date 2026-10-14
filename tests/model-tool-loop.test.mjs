import assert from 'node:assert/strict';
import test from 'node:test';
import { executeModelToolLoop } from '../server/modelToolLoop.js';
import { executeModelPool } from '../server/modelPool.js';
import { routeRequest } from '../server/router.js';
import { classifyForModel } from '../server/modelRouting.js';
// These provider calls use mocked responses. Explicitly opt into the paid-policy path here.
process.env.ZERO_SPEND_MODE = 'false';
process.env.ALLOW_PAID_API_USAGE = 'true';

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
  const result = await executeModelToolLoop({ request: 'What tasks do I have?', context: [], state, logicalModel: 'agent_brain', continuationState: { runId: 'run-real' } }, { model, invoke });
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
    const result = await executeModelPool({ logicalModel: 'agent_brain', request: 'tasks?', state: {}, fetchImpl, toolSpecs: [{ type: 'function', function: { name: 'tasks__list', parameters: { type: 'object' } } }] });
    assert.equal(result.toolCalls.length, 1);
  } finally {
    if (original === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = original;
  }
});

test('natural language prompts missing router regexes fall back to model loop with safe desktop, calendar, and browser tools', async () => {
  const origComposio = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'test-key';
  try {
    // 1. Natural language window focus
    const focusQuery = 'can you focus my terminal window';
    assert.equal(routeRequest(focusQuery).route, 'MODEL');
    assert.equal(classifyForModel(focusQuery).requiresTools, true);

    const windowCalls = [];
    const windowModel = async (input) => {
      if (input.messagesOverride.length === 1) {
        assert.ok(input.toolSpecs.some((s) => s.function.name === 'windows__focus'), 'windows__focus should be in toolSpecs');
        assert.ok(!input.toolSpecs.some((s) => s.function.name === 'command__execute'), 'command__execute must not be in toolSpecs');
        return { reply: '', toolCalls: [{ id: 'call-focus', function: { name: 'windows__focus', arguments: JSON.stringify({ target: { name: 'terminal' } }) } }] };
      }
      return { reply: 'Terminal is focused.', toolCalls: [] };
    };
    const windowInvoke = async (_state, req) => {
      windowCalls.push(req);
      return { status: 200, body: { ok: true, toolId: req.toolId, data: { window: { windowId: 'win-term', title: 'Terminal' } } } };
    };
    const windowResult = await executeModelToolLoop({ request: focusQuery, context: [], state: {} }, { model: windowModel, invoke: windowInvoke });
    assert.equal(windowResult.reply, 'Terminal is focused.');
    assert.equal(windowCalls[0].toolId, 'windows.focus');
    assert.equal(windowResult.executedToolCalls[0].status, 'completed');

    // 2. Natural language calendar query
    const calQuery = 'tell me what is on my calendar today';
    assert.equal(routeRequest(calQuery).route, 'MODEL');
    assert.equal(classifyForModel(calQuery).requiresTools, true);

    const calCalls = [];
    const calModel = async (input) => {
      if (input.messagesOverride.length === 1) {
        assert.ok(input.toolSpecs.some((s) => s.function.name === 'calendar__upcoming'), 'calendar__upcoming should be in toolSpecs');
        return { reply: '', toolCalls: [{ id: 'call-cal', function: { name: 'calendar__upcoming', arguments: JSON.stringify({ limit: 5 }) } }] };
      }
      return { reply: 'You have a team sync at 2pm.', toolCalls: [] };
    };
    const calInvoke = async (_state, req) => {
      calCalls.push(req);
      return { status: 200, body: { ok: true, toolId: req.toolId, data: { items: [{ summary: 'Team Sync', start: { dateTime: '2026-10-14T14:00:00Z' } }] } } };
    };
    const calResult = await executeModelToolLoop({ request: calQuery, context: [], state: {} }, { model: calModel, invoke: calInvoke });
    assert.equal(calResult.reply, 'You have a team sync at 2pm.');
    assert.equal(calCalls[0].toolId, 'calendar.upcoming');
    assert.equal(calResult.executedToolCalls[0].status, 'completed');

    // 3. Natural language browser navigation
    const browserQuery = 'can you open example.com and summarize it for me';
    assert.equal(routeRequest(browserQuery).route, 'MODEL');
    assert.equal(classifyForModel(browserQuery).requiresTools, true);

    const browserCalls = [];
    const browserModel = async (input) => {
      if (input.messagesOverride.length === 1) {
        assert.ok(input.toolSpecs.some((s) => s.function.name === 'browser__navigate'), 'browser__navigate should be in toolSpecs');
        return { reply: '', toolCalls: [{ id: 'call-nav', function: { name: 'browser__navigate', arguments: JSON.stringify({ url: 'https://example.com' }) } }] };
      }
      return { reply: 'Example Domain: this domain is for illustrative examples.', toolCalls: [] };
    };
    const browserInvoke = async (_state, req) => {
      browserCalls.push(req);
      return { status: 200, body: { ok: true, toolId: req.toolId, data: { url: 'https://example.com', title: 'Example Domain' } } };
    };
    const browserResult = await executeModelToolLoop({ request: browserQuery, context: [], state: {} }, { model: browserModel, invoke: browserInvoke });
    assert.equal(browserResult.reply, 'Example Domain: this domain is for illustrative examples.');
    assert.equal(browserCalls[0].toolId, 'browser.navigate');
    assert.equal(browserResult.executedToolCalls[0].status, 'completed');
  } finally {
    if (origComposio === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = origComposio;
  }
});

