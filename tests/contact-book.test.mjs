import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureStarterContacts, resolveContact, upsertContact } from '../server/contactBook.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { routeRequest } from '../server/router.js';
import { selectRelevantTools } from '../server/toolFilter.js';
import { listTools } from '../server/registry.js';
import { defaultPools, executeModelPool } from '../server/modelPool.js';
import { modelRegistry } from '../server/modelRouting.js';

function fixture() {
  return { contacts: ensureStarterContacts([]), tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], toolExecutions: [], runtime: { toolTelemetry: [], latency: {} }, modelRouting: {} };
}

test('starter contact library contains requested aliases without invented destinations', () => {
  const state = fixture();
  for (const name of ['papa', 'mma', 'tution maam', 'arjun', 'aviral', 'vedant', 'ayush', 'ridhima', 'prajakta']) {
    const contact = resolveContact(state, name);
    assert.deepEqual(contact.endpoints, {});
  }
});

test('contact aliases and platform identifiers persist through canonical contact tool', async () => {
  const state = fixture();
  const result = await executeToolCall({ toolName: 'contacts.upsert', arguments: { id: 'contact-papa', name: 'Papa', aliases: ['papa', 'dad'], endpoints: { whatsapp: '+919999999999' } }, requestedBy: 'local-operator' }, { state });
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, true);
  assert.equal(resolveContact(state, 'dad').endpoints.whatsapp, '+919999999999');
  assert.deepEqual(state.runs.at(-1).toolCalls.at(-1).arguments, { redacted: true });
});

test('saved-contact messaging requires exact approval and dispatches once', async () => {
  const previousUrl = process.env.VOICE_OS_CONTROL_URL;
  process.env.VOICE_OS_CONTROL_URL = 'http://voice-os.test';
  try {
    const state = fixture();
    upsertContact(state, { id: 'contact-papa', name: 'Papa', aliases: ['papa'], endpoints: { whatsapp: '+919999999999' } });
    const call = { id: 'message-once', toolName: 'communication.send', arguments: { contact: 'papa', platform: 'whatsapp', message: 'I will come on Friday because my exams are in progress.' }, runId: 'message-run', stepId: 'message-step', requestedBy: 'local-operator', idempotencyKey: 'message-once' };
    const waiting = await executeToolCall(call, { state, autoCompleteRun: false });
    assert.equal(waiting.status, 'waiting_for_approval');
    const approval = state.approvals[0]; approval.status = 'approved';
    let calls = 0; let sent;
    const fetchImpl = async (_url, init) => { calls += 1; sent = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ success: true, state: 'confirmed', provider: 'test-bridge', messageId: 'm-1' }) }; };
    const resumedCall = { ...call, runId: waiting.runId, approvalId: approval.id };
    const completed = await executeToolCall(resumedCall, { state, autoCompleteRun: false, fetchImpl });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.verified, true);
    assert.equal(calls, 1);
    assert.deepEqual(sent, { type: 'message.send', app: 'whatsapp', target: '+919999999999', callId: null, message: call.arguments.message });
    const replay = await executeToolCall(resumedCall, { state, autoCompleteRun: false, fetchImpl });
    assert.equal(replay.status, 'failed');
    assert.equal(replay.error.code, 'APPROVAL_REPLAY');
    assert.equal(calls, 1);
  } finally {
    if (previousUrl === undefined) delete process.env.VOICE_OS_CONTROL_URL; else process.env.VOICE_OS_CONTROL_URL = previousUrl;
  }
});

test('explicit messaging route keeps platform choice and exact phrasing in the canonical tool call', () => {
  const explicit = routeRequest('Jarvis message tution maam on WhatsApp: me ab Friday ko aunga mere exams chal rahe hai');
  assert.equal(explicit.route, 'TOOL_CALL');
  assert.equal(explicit.capability, 'communication.send');
  assert.equal(explicit.communicationIntent.platform, 'whatsapp');
  assert.equal(explicit.args.message, 'me ab Friday ko aunga mere exams chal rahe hai');
  assert.equal(routeRequest('Jarvis message tution maam me Friday ko aunga').route, 'MODEL');
  const selected = selectRelevantTools('message tution maam on whatsapp', listTools()).tools;
  assert.ok(selected.some((tool) => tool.id === 'contacts.resolve'));
  assert.ok(selected.some((tool) => tool.id === 'communication.send'));
});

test('official OpenAI and Gemini pools expose backend-only rotating credentials and tool capability', () => {
  const pools = defaultPools(); const registry = modelRegistry();
  assert.equal(pools['openai-best'].length, 5);
  assert.equal(pools['gemini-best'].length, 5);
  assert.equal(pools['openai-best'][0].credentialRef, 'OPENAI_API_KEY');
  assert.equal(pools['gemini-best'][0].baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.ok(registry['openai-best'].capabilities.includes('tools'));
  assert.ok(registry['gemini-best'].capabilities.includes('tools'));
});

test('Gemini compatibility pool receives filtered OpenAI-style tool schemas', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousPools = process.env.MODEL_PROVIDER_POOLS;
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.MODEL_PROVIDER_POOLS;
  try {
    let request;
    const result = await executeModelPool({ logicalModel: 'gemini-best', request: 'show tasks', state: { modelRouting: {} }, tools: [{ type: 'function', function: { name: 'tasks__list', description: 'List tasks', parameters: { type: 'object', properties: {} } } }], fetchImpl: async (url, init) => { request = { url, headers: init.headers, body: JSON.parse(init.body) }; return { ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: '', tool_calls: [{ id: 'g-1', type: 'function', function: { name: 'tasks__list', arguments: '{}' } }] } }] }) }; } });
    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer test-key');
    assert.equal(request.body.tools[0].function.name, 'tasks__list');
    assert.equal(result.toolCalls[0].function.name, 'tasks__list');
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    if (previousPools === undefined) delete process.env.MODEL_PROVIDER_POOLS; else process.env.MODEL_PROVIDER_POOLS = previousPools;
  }
});
