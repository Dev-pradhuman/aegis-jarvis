import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBrainCatalog } from '../server/brainSources.js';
import { executeModelPool, configuredPools } from '../server/modelPool.js';
import { detectedCliSources, discoverBrainModels, testBrainSource } from '../server/brainService.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-brain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, catalog: createBrainCatalog({ sourcesPath: path.join(dir, 'sources.json'), secretsPath: path.join(dir, 'secrets.json'), env: {} }) };
}
const reply = (text = 'ok') => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ choices: [{ message: { content: text } }] }) });
const failure = (status, message) => ({ ok: false, status, headers: new Headers(), json: async () => ({ error: { message } }) });
const source = (name, logicalModels = ['deepseek-v4-flash'], capabilities = ['text', 'tools']) => ({ name, type: 'API', provider: name, baseUrl: `https://${name}.example/v1`, modelId: `${name}/model`, logicalModels, capabilities, priority: name === 'first' ? 1 : 2 });

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
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'glm-5.2': [] });
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
  const local = catalog.addSource({ name: 'Local', type: 'LOCAL', provider: 'local', baseUrl: 'http://127.0.0.1:2222/v1', modelId: 'local-model', logicalModels: ['glm-5.2'], capabilities: ['text', 'tools'], priority: 1 });
  const original = process.env.MODEL_PROVIDER_POOLS;
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'glm-5.2': [] });
  t.after(() => original === undefined ? delete process.env.MODEL_PROVIDER_POOLS : process.env.MODEL_PROVIDER_POOLS = original);
  let calls = 0;
  await assert.rejects(() => executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', catalog, state: {}, fetchImpl: async () => { calls++; return failure(400, 'bad input'); } }), { code: 'REQUEST_ERROR' });
  assert.equal(calls, 1);
  const result = await executeModelPool({ logicalModel: 'deepseek-v4-flash', request: 'hi', catalog, state: {}, fetchImpl: async (url) => url.includes('127.0.0.1') ? reply('local') : failure(429, 'quota exhausted') });
  assert.equal(result.provider, `brain-${local.id}`);
  assert.equal(result.routingTelemetry.modelFallbackUsed, true);
  assert.ok(configuredPools(catalog)['glm-5.2'].some((entry) => entry.type === 'LOCAL'));
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
  process.env.MODEL_PROVIDER_POOLS = JSON.stringify({ 'deepseek-v4-flash': [], 'glm-5.2': [] });
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
  const local = catalog.addSource({ name: 'Local', type: 'LOCAL', provider: 'local', baseUrl: 'http://127.0.0.1:2222/v1', modelId: 'local-model', logicalModels: ['muse-spark-1.2'], capabilities: ['text'] });
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'real-model' }] }) });
  assert.equal((await discoverBrainModels(local.id, { catalog, fetchImpl })).models[0].id, 'real-model');
  assert.equal((await testBrainSource(local.id, null, { catalog, fetchImpl })).status, 'HEALTHY');
  assert.ok(detectedCliSources().every((item) => !['READY', 'HEALTHY'].includes(item.status)));
});
