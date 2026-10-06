import test from 'node:test';
import assert from 'node:assert/strict';
import { providerForLogicalModel } from '../server/providerClient.js';

test('OpenCode emergency fallback translates logical model IDs to provider model IDs', () => {
  const provider = { id: 'opencode-zen', model: 'nvidia/nemotron-3.5-lightning:free' };
  assert.equal(providerForLogicalModel(provider, 'agent_brain').model, 'agent_brain-contributor-free');
  assert.equal(providerForLogicalModel(provider, 'deepseek-v4-flash').model, 'deepseek-v4-flash-free');
  assert.equal(providerForLogicalModel(provider, 'laguna-s-2.1').model, 'laguna-s-2.1-free');
  assert.equal(providerForLogicalModel(provider, 'nemotron-3.5-lightning').model, 'nemotron-3.5-lightning-free');
  assert.equal(provider.model, 'nvidia/nemotron-3.5-lightning:free');
});

test('OpenCode paid selection keeps the standard logical model ID', () => {
  const provider = { id: 'opencode-zen', model: 'fallback' };
  assert.equal(providerForLogicalModel(provider, 'agent_brain').model, 'agent_brain');
});

test('other active providers retain their explicitly configured model', () => {
  const provider = { id: 'custom', model: 'my-model' };
  assert.deepEqual(providerForLogicalModel(provider, 'agent_brain'), provider);
});
