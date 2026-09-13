import assert from 'node:assert/strict';
import test from 'node:test';
import { executeModelToolLoop, modelToolDefinitions, shouldUseModelToolLoop } from '../server/modelToolLoop.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { createRun, transitionRun } from '../server/runEngine.js';
import { getToolDefinition } from '../server/registry.js';

const names = (request) => new Set(modelToolDefinitions(request).schemas.map((tool) => tool.function.name));

test('headless requests never receive an empty canonical tool set', () => {
  for (const request of ['play some soothing songs from youtube', 'message arjun hello bhai kesa hai', 'any new mail for me?']) {
    const selected = names(request);
    assert.ok(selected.size > 0, request);
    assert.ok(selected.has('tools__discover'), `${request} lacks discovery fallback`);
  }
});

test('every headless route uses the canonical model tool loop even for ordinary conversation', () => {
  assert.equal(shouldUseModelToolLoop({ primaryModel: 'chatgpt-web', requiresTools: false }), true);
  assert.equal(shouldUseModelToolLoop({ primaryModel: 'gemini-web', requiresTools: false }), true);
  assert.equal(shouldUseModelToolLoop({ primaryModel: 'deepseek-v4-flash', requiresTools: false }), false);
});

test('tool resolver anchors browser/media, messaging/contact, and Gmail capabilities', () => {
  const youtube = names('play some soothing songs from youtube');
  assert.ok(youtube.has('browser__open') || youtube.has('browser__external__open'));
  assert.ok(youtube.has('media__play'));
  const messaging = names('message arjun hello bhai kesa hai');
  assert.ok(messaging.has('contacts__resolve')); assert.ok(messaging.has('communication__send'));
  const prior = process.env.COMPOSIO_API_KEY; process.env.COMPOSIO_API_KEY = 'ak_test';
  try { assert.ok(names('any new mail for me?').has('gmail__latest')); }
  finally { if (prior === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = prior; }
});

test('tools.discover executes through the canonical executor and returns schemas', async () => {
  const state = { tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} };
  const result = await executeToolCall({ toolName: 'tools.discover', arguments: { category: 'messaging' }, source: 'model' }, { state, request: 'discover messaging' });
  assert.equal(result.status, 'completed'); assert.equal(result.verified, true);
  assert.ok(result.output.tools.some((tool) => tool.id === 'communication.send'));
  assert.ok(result.output.tools.every((tool) => tool.inputSchema?.type === 'object'));
});

test('model discovery expands the allowed canonical catalog for the next round', async () => {
  const state = { tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} };
  const run = createRun({ request: 'Find messaging tools', type: 'chat', conversationId: 'discover-session' });
  transitionRun(run, 'running'); state.runs.push(run);
  let round = 0;
  const executeModel = async (options) => {
    round += 1;
    if (round === 1) return { reply: '', toolCalls: [{ id: 'discover-1', function: { name: 'tools__discover', arguments: JSON.stringify({ category: 'messaging' }) } }], provider: 'mock', model: 'mock', logicalModel: 'chatgpt-web', routingTelemetry: { providerAttempts: [] } };
    assert.ok(options.tools.some((tool) => tool.function.name === 'communication__send'));
    return { reply: 'Messaging tools discovered.', toolCalls: [], provider: 'mock', model: 'mock', logicalModel: 'chatgpt-web', routingTelemetry: { providerAttempts: [] } };
  };
  const result = await executeModelToolLoop({ route: { primaryModel: 'chatgpt-web' }, request: 'Find messaging tools', state, run, executeModel, availableTools: [getToolDefinition('tools.discover')] });
  assert.equal(result.status, 'completed');
  assert.equal(result.reply, 'Messaging tools discovered.');
  assert.equal(result.toolResults[0].toolName, 'tools.discover');
});
