import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBrainCatalog } from '../server/brainSources.js';
import { executeModelPool, configuredPools } from '../server/modelPool.js';
import { detectedCliSources, discoverBrainModels, ollamaRuntimeStatus, testBrainSource } from '../server/brainService.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-brain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, catalog: createBrainCatalog({ sourcesPath: path.join(dir, 'sources.json'), secretsPath: path.join(dir, 'secrets.json'), env: {} }) };
}
const reply = (text = 'ok') => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: text } }] }) });
const failure = (status, message) => ({ ok: false, status, headers: new Headers(), json: async () => ({ error: { message } }) });
const source = (name, logicalModels = ['deepseek-v4-flash'], capabilities = ['text', 'tools']) => ({ name, type: 'API', provider: name, baseUrl: `https://${name}.example/v1`, modelId: `${name}/model`, logicalModels, capabilities, priority: name === 'first' ? 1 : 2 });
// These provider calls use mocked responses. Explicitly opt into the paid-policy path here.
process.env.ZERO_SPEND_MODE = 'false';
process.env.ALLOW_PAID_API_USAGE = 'true';

test('Brain catalog stores any number of credentials privately and masks status', (t) => {
  const { dir, catalog } = fixture(t);
  const saved = catalog.addSource(source('first'));
  for (let i = 0; i < 6; i++) catalog.addCredential(saved.id, { secret: `secret-token-${i}`, label: `Key ${i}` });
  assert.equal(catalog.list()[0].credentials.length, 6);
  assert.equal(catalog.publicStatus().setupRequired, false);
  assert.ok(!JSON.stringify(catalog.publicStatus()).includes('secret-token'));
  assert.equal(fs.statSync(path.join(dir, 'secrets.json')).mode & 0o777, 0o600);
  const reloaded = createBrainCatalog({ sourcesPath: path.join(dir, 'sources.json'), secretsPath: path.join(dir, 'secrets.json'), env: {} });
  assert.equal(reloaded.list()[0].credentials.length, 6);
  assert.throws(() => catalog.addCredential(saved.id, { secret: 'secret-token-0' }), { code: 'BRAIN_CREDENTIAL_DUPLICATE' });
  const key = catalog.list()[0].credentials[0];
  catalog.removeCredential(saved.id, key.id);
  assert.equal(catalog.credentialSecret(key.id), '');
});

test('Brain pool rotates on 429, recycles after cooldown, and excludes invalid keys', async (t) => {
  const { catalog } = fixture(t);
  const saved = catalog.addSource(source('first'));
  const a = catalog.addCredential(saved.id, { secret: 'alpha' });
  const b = catalog.addCredential(saved.id, { secret: 'bravo' });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'fallback': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  const state = { modelRouting: { providerHealth: {} } };
  const used = [];
  const fetchImpl = async (_url, init) => { used.push(init.headers.authorization); return used.length === 1 ? failure(429, 'rate limited') : reply(); };
  const result = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', state, fetchImpl, now: () => 1000, catalog });
  assert.equal(result.provider, `brain-${b.id}`);
  assert.deepEqual(used, ['Bearer alpha', 'Bearer bravo']);
  assert.equal(state.modelRouting.providerHealth[`brain-${a.id}`].status, 'RATE_LIMITED');
  const again = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', state, fetchImpl: async (_url, init) => { used.push(init.headers.authorization); return reply(); }, now: () => 100000, catalog });
  assert.equal(again.provider, `brain-${a.id}`);
  state.modelRouting.providerHealth[`brain-${a.id}`] = { status: 'INVALID_CREDENTIAL' };
  const afterInvalid = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', state, fetchImpl: async () => reply(), now: () => 200000, catalog });
  assert.equal(afterInvalid.provider, `brain-${b.id}`);
});

test('bad requests do not rotate and compatible local source can satisfy model fallback', async (t) => {
  const { catalog } = fixture(t);
  const first = catalog.addSource(source('first'));
  catalog.addCredential(first.id, { secret: 'alpha' });
  catalog.addCredential(first.id, { secret: 'bravo' });
  const local = catalog.addSource({ name: 'Local', type: 'LOCAL', provider: 'local', baseUrl: 'http://127.0.0.1:2222/v1', modelId: 'local-model', logicalModels: ['fallback'], capabilities: ['text', 'tools'], priority: 1 });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'fallback': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  let calls = 0;
  await assert.rejects(() => executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', catalog, state: {}, fetchImpl: async () => { calls++; return failure(400, 'bad input'); } }), { code: 'REQUEST_ERROR' });
  assert.equal(calls, 1);
  const result = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', catalog, state: {}, fetchImpl: async (url) => url.includes('127.0.0.1') ? reply('local') : failure(429, 'quota exhausted') });
  assert.equal(result.provider, `brain-${local.id}`);
  assert.equal(result.routingTelemetry.modelFallbackUsed, true);
  assert.ok(configuredPools(catalog)['fallback'].some((entry) => entry.type === 'LOCAL'));
});

test('Brain source input validates endpoint, role, and credential operations', (t) => {
  const { catalog } = fixture(t);
  assert.throws(() => catalog.addSource({ ...source('first'), baseUrl: 'http://remote.example/v1' }), { code: 'BRAIN_SOURCE_INVALID' });
  assert.throws(() => catalog.addSource({ ...source('first'), logicalModels: ['unknown'] }), { code: 'BRAIN_SOURCE_INVALID' });
  const saved = catalog.addSource(source('first'));
  const key = catalog.addCredential(saved.id, { secret: 'secret' });
  catalog.updateCredential(saved.id, key.id, { enabled: false });
  assert.equal(catalog.poolEntries().length, 0);
  catalog.updateCredential(saved.id, key.id, { enabled: true });
  assert.equal(catalog.poolEntries().length, 1);
  catalog.removeSource(saved.id);
  assert.equal(catalog.credentialSecret(key.id), '');
});

test('401 disables only that key, tool requests skip text-only sources, and strict lock prevents provider fallback', async (t) => {
  const { catalog } = fixture(t);
  const first = catalog.addSource(source('first'));
  const invalid = catalog.addCredential(first.id, { secret: 'invalid' });
  const backup = catalog.addCredential(first.id, { secret: 'backup' });
  const textOnly = catalog.addSource(source('textonly', ['deepseek-v4-flash'], ['text']));
  catalog.addCredential(textOnly.id, { secret: 'text-only' });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'fallback': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  const state = { modelRouting: { providerHealth: {} } };
  const seen = [];
  const result = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'use a tool', toolSpecs: [{ type: 'function', function: { name: 'tasks__list', parameters: { type: 'object' } } }], state, catalog, fetchImpl: async (_url, init) => { seen.push(init.headers.authorization); return seen.length === 1 ? failure(401, 'bad key') : reply(); } });
  assert.equal(result.provider, `brain-${backup.id}`);
  assert.deepEqual(seen, ['Bearer invalid', 'Bearer backup']);
  assert.equal(state.modelRouting.providerHealth[`brain-${invalid.id}`].status, 'INVALID_CREDENTIAL');
  const locked = { modelRouting: { modelMode: 'manual', lockedSourceId: first.id, providerHealth: { [`brain-${invalid.id}`]: { status: 'INVALID_CREDENTIAL' }, [`brain-${backup.id}`]: { status: 'RATE_LIMITED', retryAfter: new Date(Date.now() + 60_000).toISOString() } } } };
  await assert.rejects(() => executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', state: locked, catalog, allowFallback: false, fetchImpl: async () => reply() }), { code: 'MODEL_CAPACITY_EXHAUSTED' });
});

test('local model discovery and health are grounded in the endpoint response', async (t) => {
  const { catalog } = fixture(t);
  const local = catalog.addSource({ name: 'Local', type: 'LOCAL', provider: 'local', baseUrl: 'http://127.0.0.1:2222/v1', modelId: 'local-model', logicalModels: ['agent_brain'], capabilities: ['text'] });
  const fetchImpl = async (url, init) => ({ ok: true, status: 200, json: async () => url.endsWith('/models') ? { data: [{ id: 'real-model' }] } : JSON.parse(init.body).tools ? { choices: [{ message: { tool_calls: [{ function: { name: 'report_ready' } }] } }] } : { choices: [{ message: { content: 'JARVIS_LOCAL_OK' } }] } });
  assert.equal((await discoverBrainModels(local.id, { force: true, catalog, fetchImpl })).models[0].id, 'real-model');
  const checked = await testBrainSource(local.id, null, { force: true, catalog, fetchImpl });
  assert.equal(checked.status, 'HEALTHY');
  assert.deepEqual(checked.capabilities, ['text', 'tools']);
  const misleading = await testBrainSource(local.id, null, { force: true, catalog, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'unexpected' } }] }) }) });
  assert.equal(misleading.status, 'UNVERIFIED');
  assert.ok(detectedCliSources().every((item) => !['READY', 'HEALTHY'].includes(item.status)));
});

test('known presets reference environment keys without copying them to secret storage', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-env-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { OPENAI_API_KEY: 'private-value' };
  const catalog = createBrainCatalog({ sourcesPath: path.join(dir, 'sources.json'), secretsPath: path.join(dir, 'secrets.json'), env });
  const source = catalog.list().find((item) => item.presetId === 'openai');
  assert.equal(source.credentials.length, 1);
  assert.equal(source.credentials[0].envRef, 'OPENAI_API_KEY');
  assert.equal(source.credentials[0].hint, '••••alue');
  assert.ok(!JSON.stringify(catalog.publicStatus()).includes('private-value'));
  assert.equal(fs.existsSync(path.join(dir, 'secrets.json')), false);
});

test('numbered environment keys join the same preset pool without copying secrets', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-env-pool-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const catalog = createBrainCatalog({ sourcesPath: path.join(dir, 'sources.json'), secretsPath: path.join(dir, 'secrets.json'), env: { OPENROUTER_API_KEY_1: 'backup-one', OPENROUTER_API_KEY_2: 'backup-two' } });
  const source = catalog.list().find((item) => item.presetId === 'openrouter');
  assert.equal(source.credentials.length, 2);
  assert.deepEqual(source.credentials.map((item) => item.envRef), ['OPENROUTER_API_KEY_1', 'OPENROUTER_API_KEY_2']);
  assert.equal(fs.existsSync(path.join(dir, 'secrets.json')), false);
});

test('Ollama pool uses native non-thinking chat and normalizes tool output', async (t) => {
  const { catalog } = fixture(t);
  const local = catalog.addPresetSource('ollama', { logicalModels: ['agent_brain'], capabilities: ['text', 'tools'] });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'agent_brain': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  let request;
  const result = await executeModelPool({ logicalModel: 'agent_brain', request: 'hello', state: {}, catalog, toolSpecs: [{ type: 'function', function: { name: 'report_ready', parameters: { type: 'object', properties: {} } } }], fetchImpl: async (url, init) => { request = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, headers: new Headers(), json: async () => ({ message: { content: '<think>private</think>ready', tool_calls: [{ function: { name: 'report_ready', arguments: { value: true } } }] }, eval_count: 2 }) }; } });
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.think, false);
  assert.match(request.body.messages[0].content, /^\/no_think/);
  assert.equal(result.reply, 'ready');
  assert.equal(result.toolCalls[0].function.name, 'report_ready');
  assert.equal(result.provider, `brain-${local.id}`);
});

test('ordinary Ollama replies extract only the constrained final answer', async (t) => {
  const { catalog } = fixture(t);
  catalog.addPresetSource('ollama', { logicalModels: ['agent_brain'], capabilities: ['text', 'tools'] });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'agent_brain': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  let body;
  const result = await executeModelPool({ logicalModel: 'agent_brain', request: 'Explain RAM', state: {}, catalog, allowFallback: false, fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ message: { content: '{"answer":"RAM temporarily holds data in use."}' }, eval_count: 9 }) };
  } });
  assert.equal(body.format.properties.answer.type, 'string');
  assert.equal(result.reply, 'RAM temporarily holds data in use.');
});

test('preset connection selects a discovered chat model only after inference succeeds', async (t) => {
  const { catalog } = fixture(t);
  const source = catalog.addPresetSource('groq');
  const key = catalog.addCredential(source.id, { secret: 'mock-private-key' });
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, authorization: init.headers.authorization });
    return { ok: true, status: 200, json: async () => url.endsWith('/models') ? { data: [{ id: 'speech-to-text' }, { id: 'chat-model' }] } : { choices: [{ message: { content: 'JARVIS_LOCAL_OK' } }] } };
  };
  const tested = await testBrainSource(source.id, key.id, { force: true, catalog, fetchImpl });
  assert.equal(tested.status, 'HEALTHY');
  assert.equal(catalog.find(source.id).modelId, 'chat-model');
  assert.ok(calls.some((call) => call.url.endsWith('/chat/completions')));
  assert.ok(calls.every((call) => call.authorization === 'Bearer mock-private-key'));
  assert.ok(!JSON.stringify(catalog.publicStatus()).includes('mock-private-key'));
});

test('Together preset uses current API base and accepts its array model catalog', async (t) => {
  const { catalog } = fixture(t);
  const source = catalog.addPresetSource('together');
  const key = catalog.addCredential(source.id, { secret: 'mock-private-key' });
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => url.endsWith('/models') ? [{ id: 'embed-new', type: 'embedding', created: 999 }, { id: 'chat-model', type: 'chat', created: 1 }] : { choices: [{ message: { content: 'ready' } }] } }; };
  const result = await testBrainSource(source.id, key.id, { force: true, catalog, fetchImpl });
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.modelId, 'chat-model');
  assert.ok(urls.every((url) => url.startsWith('https://api.together.ai/v1/')));
});

test('Anthropic preset preserves tool calls and tool results in canonical continuation', async (t) => {
  const { catalog } = fixture(t);
  const source = catalog.addPresetSource('anthropic', { modelId: 'test-model', logicalModels: ['agent_brain'], capabilities: ['text', 'tools'] });
  catalog.addCredential(source.id, { secret: 'mock-private-key' });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'agent_brain': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  let sent;
  const result = await executeModelPool({ logicalModel: 'agent_brain', request: 'continue', state: {}, catalog, messagesOverride: [
    { role: 'system', content: 'Use tools when needed.' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', function: { name: 'status', arguments: '{"detail":true}' } }] },
    { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
  ], fetchImpl: async (url, init) => { sent = { url, headers: init.headers, body: JSON.parse(init.body) }; return { ok: true, status: 200, headers: new Headers(), json: async () => ({ content: [{ type: 'text', text: 'Done' }], usage: { input_tokens: 5, output_tokens: 1 } }) }; } });
  assert.ok(sent.url.endsWith('/messages'));
  assert.equal(sent.headers['anthropic-version'], '2023-06-01');
  assert.equal(sent.body.messages[0].content[0].type, 'tool_use');
  assert.deepEqual(sent.body.messages[0].content[0].input, { detail: true });
  assert.equal(sent.body.messages[1].content[0].tool_use_id, 'call-1');
  assert.equal(result.reply, 'Done');
});

test('Anthropic discovery keeps tools only after a successful tool probe', async (t) => {
  const { catalog } = fixture(t);
  const source = catalog.addPresetSource('anthropic');
  const key = catalog.addCredential(source.id, { secret: 'mock-private-key' });
  const fetchImpl = async (url, init) => ({ ok: true, status: 200, json: async () => url.endsWith('/models') ? { data: [{ id: 'claude-test-model' }] } : JSON.parse(init.body).tools ? { content: [{ type: 'tool_use', name: 'report_ready', input: { value: true } }] } : { content: [{ type: 'text', text: 'JARVIS_LOCAL_OK' }] } });
  const result = await testBrainSource(source.id, key.id, { force: true, catalog, fetchImpl });
  assert.equal(result.status, 'HEALTHY');
  assert.equal(result.toolStatus, 'HEALTHY');
  assert.deepEqual(catalog.find(source.id).capabilities, ['text', 'tools']);
});

test('provider failover reaches a second API and then local, while vision rejects text-only local', async (t) => {
  const { catalog } = fixture(t);
  const first = catalog.addSource(source('first', ['deepseek-v4-flash'], ['text', 'tools']));
  catalog.addCredential(first.id, { secret: 'first-key' });
  const second = catalog.addSource(source('second', ['deepseek-v4-flash'], ['text', 'tools']));
  const secondKey = catalog.addCredential(second.id, { secret: 'second-key' });
  const local = catalog.addSource({ name: 'Local Qwen', type: 'LOCAL', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', modelId: 'qwen3:4b', logicalModels: ['deepseek-v4-flash', 'fallback'], capabilities: ['text', 'tools'], priority: 3 });
  const previous = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'fallback': [] });
  t.after(() => previous === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = previous);
  const state = { modelRouting: { providerHealth: {} } };
  const cloud = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hello', state, catalog, fetchImpl: async (url) => url.includes('first.example') ? failure(503, 'unavailable') : reply('second works') });
  assert.equal(cloud.provider, `brain-${secondKey.id}`);
  const offline = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hello', state: {}, catalog, fetchImpl: async (url) => url.includes('127.0.0.1') ? reply('local works') : failure(503, 'unavailable') });
  assert.equal(offline.provider, `brain-${local.id}`);
  await assert.rejects(() => executeModelPool({ logicalModel: 'perception', request: 'describe image', requiredModality: 'image', attachments: [{ url: 'https://example.test/image.png' }], state: {}, catalog, fetchImpl: async () => reply('wrong') }), { code: 'CAPABILITY_UNAVAILABLE' });
});

test('Ollama runtime distinguishes stopped service from missing and installed model', async (t) => {
  const { catalog } = fixture(t);
  catalog.addPresetSource('ollama');
  const stopped = await ollamaRuntimeStatus({ force: true, catalog, fetchImpl: async () => { throw new Error('connection refused'); } });
  assert.equal(stopped.status, 'RUNTIME_STOPPED');
  const fetchImpl = async (url) => ({ ok: true, json: async () => url.endsWith('/api/version') ? { version: 'test' } : { models: [{ name: 'qwen3:4b' }] } });
  const ready = await ollamaRuntimeStatus({ force: true, catalog, fetchImpl });
  assert.equal(ready.status, 'MODEL_AVAILABLE');
  assert.equal(ready.modelInstalled, true);
  const missing = await ollamaRuntimeStatus({ force: true, catalog, fetchImpl: async (url) => ({ ok: true, json: async () => url.endsWith('/api/version') ? { version: 'test' } : { models: [] } }) });
  assert.equal(missing.status, 'MODEL_MISSING');
});

test('OpenAI preset discovers a model and probes chat before registering it for routing', async (t) => {
  const { catalog } = fixture(t);
  const source = catalog.addPresetSource('openai');
  const key = catalog.addCredential(source.id, { secret: 'test-only-credential' });
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return url.endsWith('/models') ? { ok: true, status: 200, json: async () => ({ data: [{ id: 'chat-model', created: 1 }] }) } : reply('ready');
  };
  const result = await testBrainSource(source.id, key.id, { force: true, catalog, fetchImpl });
  assert.equal(result.status, 'HEALTHY');
  assert.equal(catalog.find(source.id).modelId, 'chat-model');
  assert.equal(requests[1].body.max_completion_tokens, 80);
  assert.ok(!JSON.stringify(catalog.publicStatus()).includes('test-only-credential'));
  const untested = catalog.addPresetSource('groq');
  catalog.addCredential(untested.id, { secret: 'another-test-credential' });
  const failed = await testBrainSource(untested.id, null, { force: true, catalog, fetchImpl: async (url) => url.endsWith('/models') ? { ok: true, status: 200, json: async () => ({ data: [{ id: 'unusable-chat-model' }] }) } : failure(400, 'model unavailable') });
  assert.equal(failed.status, 'MODEL_UNAVAILABLE');
  assert.equal(catalog.find(untested.id).modelId, 'auto');
});
