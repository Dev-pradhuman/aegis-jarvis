import assert from 'node:assert/strict';
import test from 'node:test';
import { executeModelDelegation } from '../server/modelDelegation.js';
import { classifyForModel } from '../server/modelRouting.js';

test('media coding request delegates perception before coding', () => {
  const route = classifyForModel('fix this repository error', { hasMedia: true });
  assert.deepEqual([route.primaryModel, ...route.supportModels], ['nemotron-3-nano-omni', 'mimo-v2.5', 'laguna-s-2.1']);
});

test('complex architecture implementation delegates GLM reasoning before Laguna coding', () => {
  const route = classifyForModel('implement this distributed architecture in the repository');
  assert.deepEqual([route.primaryModel, ...route.supportModels], ['glm-5.2', 'laguna-s-2.1']);
});

test('delegation preserves one continuation state and feeds prior specialist output forward', async () => {
  const calls = [];
  const execute = async (input) => {
    calls.push(input);
    return { reply: `output-${calls.length}`, tokens: 3, inputTokens: 2, outputTokens: 1, cost: 0.01, provider: `provider-${calls.length}`, model: input.logicalModel, logicalModel: input.logicalModel, routingTelemetry: { providerAttempts: [], apiRotationCount: 0, modelFallbackUsed: false } };
  };
  const result = await executeModelDelegation({ route: { primaryModel: 'glm-5.2', supportModels: ['laguna-s-2.1'] }, request: 'build it', continuationState: { runId: 'run-1' }, state: {}, execute });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].continuationState.runId, 'run-1');
  assert.match(calls[1].request, /output-1/);
  assert.equal(result.logicalModel, 'laguna-s-2.1');
  assert.equal(result.routingTelemetry.delegations.length, 2);
  assert.equal(result.tokens, 6);
  assert.equal(result.inputTokens, 4);
  assert.equal(result.outputTokens, 2);
  assert.equal(result.cost, 0.02);
});
