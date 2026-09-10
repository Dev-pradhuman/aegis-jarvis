import assert from 'node:assert/strict';
import test from 'node:test';
import { executeBrainModel, executeGeminiWebModel } from '../server/chatgptWebBrain.js';
import { executeModelToolLoop } from '../server/modelToolLoop.js';
import { createRun, transitionRun } from '../server/runEngine.js';
import { TOOL_CALL_END, TOOL_CALL_START } from '../server/chatgptWebProtocol.js';
import { emitTextDelta } from '../server/headlessModelTransport.js';

const block = (calls) => `${TOOL_CALL_START}\n${JSON.stringify({ calls })}\n${TOOL_CALL_END}`;
function fixture() { const state = { geminiWeb: { enabled: true, sessionUrl: null, turns: 0 }, chatSessions: [{ id: 'session-g', geminiConversationUrl: null, geminiTurns: 0, geminiBootstrapped: false }], tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {}, modelRouting: {} }; const run = createRun({ type: 'chat', request: 'Show tasks', conversationId: 'session-g', plan: { goal: 'Show tasks', intent: 'tool', steps: [] } }); transitionRun(run, 'running'); state.runs.push(run); return { state, run, route: { primaryModel: 'gemini-web' } }; }
function transport(replies) { return { options: [], async send(prompt, options) { this.options.push(options); options.onDelta?.('Streaming '); options.onDelta?.('answer'); return { text: replies.shift(), sessionUrl: 'https://gemini.google.com/app/test' }; }, async reset() {} }; }

test('Gemini Headless uses the shared protocol and canonical executor', async () => {
  const f = fixture(); const mock = transport([block([{ id: 'list', name: 'tasks__list', arguments: {} }]), 'No tasks.']); const events = [];
  const result = await executeModelToolLoop({ ...f, request: 'Show tasks', executeModel: (options) => executeGeminiWebModel({ ...options, transport: mock }), onEvent: (event) => events.push(event) });
  assert.equal(result.reply, 'No tasks.'); assert.equal(result.toolResults[0].toolName, 'tasks.list'); assert.equal(result.toolResults[0].verified, true);
  assert.equal(f.state.chatSessions[0].geminiConversationUrl, 'https://gemini.google.com/app/test');
  assert.ok(events.some((event) => event.type === 'generation.delta')); assert.ok(events.some((event) => event.type === 'tool.result'));
});

test('headless DOM snapshots become deltas and tool protocol stays hidden', () => {
  const output = []; let previous = '';
  previous = emitTextDelta(previous, 'Hello', (delta) => output.push(delta));
  previous = emitTextDelta(previous, 'Hello there', (delta) => output.push(delta));
  emitTextDelta('', '<<<JARVIS_TOOL_CALLS>>>', (delta) => output.push(delta));
  assert.deepEqual(output, ['Hello', ' there']);
});

test('ChatGPT headless failure falls back to Gemini without changing the JARVIS session', async () => {
  const state = { chatgptWeb: { enabled: true }, geminiWeb: { enabled: true }, brainBackends: { fallbackBackend: 'gemini-web' }, chatSessions: [{ id: 'same-session', chatgptTurns: 0, chatgptBootstrapped: false, geminiTurns: 0, geminiBootstrapped: false }], activity: [] };
  const failed = { async send() { const error = new Error('ChatGPT unavailable'); error.code = 'CHATGPT_WEB_UNAVAILABLE'; throw error; }, async reset() {} };
  const succeeded = transport(['Gemini continued the same request.']);
  const result = await executeBrainModel({ logicalModel: 'chatgpt-web', request: 'Continue', state, continuationState: { runId: 'run-same', conversationId: 'same-session' }, tools: [], transports: { 'chatgpt-web': failed, 'gemini-web': succeeded } });
  assert.equal(result.reply, 'Gemini continued the same request.');
  assert.equal(result.logicalModel, 'gemini-web');
  assert.equal(result.routingTelemetry.fallbackFrom, 'chatgpt-web');
  assert.equal(state.chatSessions[0].geminiConversationUrl, 'https://gemini.google.com/app/test');
});
