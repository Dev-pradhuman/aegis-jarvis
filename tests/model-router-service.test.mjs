import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLogicalModelWithClassifier } from '../server/modelRouterService.js';

test('obvious general request uses Muse Spark in Normal mode without a classifier call', async () => {
  let calls = 0;
  const route = await selectLogicalModelWithClassifier('Summarize this paragraph', {}, {}, {}, async () => { calls += 1; });
  assert.equal(route.primaryModel, 'muse-spark-1.2');
  assert.equal(calls, 0);
});

test('ambiguous request can use Lightning structured classification', async () => {
  const route = await selectLogicalModelWithClassifier('Please figure this out', {}, {}, {}, async (input) => {
    assert.equal(input.logicalModel, 'nemotron-3.5-lightning');
    return { logicalModel: 'nemotron-3.5-lightning', reply: JSON.stringify({ taskType: 'coding', complexity: 'medium', primaryModel: 'laguna-s-2.1', supportModels: [], requiresTools: true, requiresMultimodal: false, confidence: 0.91, reason: 'Coding context' }), routingTelemetry: { providerAttempts: [{ providerId: 'lightning-1' }] } };
  });
  assert.equal(route.primaryModel, 'laguna-s-2.1');
  assert.equal(route.classifierModel, 'nemotron-3.5-lightning');
});

test('Lightning failure retains deterministic Normal-mode route', async () => {
  const route = await selectLogicalModelWithClassifier('Please handle this', {}, {}, {}, async () => { const error = new Error('offline'); error.code = 'MODEL_CAPACITY_EXHAUSTED'; throw error; });
  assert.equal(route.primaryModel, 'muse-spark-1.2');
  assert.equal(route.classifierFallback, true);
});
