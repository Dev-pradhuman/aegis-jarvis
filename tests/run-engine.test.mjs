import assert from 'node:assert/strict';
import test from 'node:test';
import { addRunStep, createRun, transitionRun } from '../server/runEngine.js';
import { beginRun, classifyRequest, errorRun } from '../server/orchestrator.js';

test('orchestrator creates a structured run and plan for execution requests', async () => {
  const state = { runs: [], provider: { id: 'local', model: 'test' } };
  const run = await beginRun(state, { request: 'inspect this repository and run tests' });
  assert.equal(classifyRequest(run.request), 'development');
  assert.equal(run.status, 'planning');
  assert.equal(run.plan.steps.length, 3);
  assert.equal(run.plan.steps[1].requiresApproval, true);
  assert.equal(run.steps.length, 0, 'planned steps must not masquerade as executed Run steps');
});

test('run lifecycle records steps and terminal completion', () => {
  const run = createRun({ request: 'hello' });
  addRunStep(run, 'Answer', null);
  transitionRun(run, 'running');
  transitionRun(run, 'completed', { result: { text: 'ok' } });
  assert.equal(run.status, 'completed');
  assert.ok(run.completedAt);
  assert.equal(run.events.length, 2);
});

test('Run token telemetry does not double-count output tokens', async () => {
  const state = { runs: [], provider: { id: 'test', model: 'test' } };
  const run = await beginRun(state, { request: 'answer' });
  const { finishRun } = await import('../server/orchestrator.js');
  finishRun(run, { reply: 'ok' }, { input: 7, output: 3, total: 10 });
  assert.deepEqual(run.tokenUsage, { input: 7, output: 3, total: 10 });
});

test('terminal model-capacity failure remains serializable in the same persisted Run', async () => {
  const state = { runs: [], provider: { id: 'test', model: 'deepseek-v4-flash' } };
  const run = await beginRun(state, { request: 'continue this task' });
  run.routing = { requestedModel: 'deepseek-v4-flash', fallbackTo: 'glm-5.2', providerAttempts: [{ providerId: 'api-1', success: false }] };
  errorRun(run, Object.assign(new Error('all providers exhausted'), { code: 'MODEL_CAPACITY_EXHAUSTED' }));
  const restored = JSON.parse(JSON.stringify(state)).runs[0];
  assert.equal(restored.id, run.id);
  assert.equal(restored.status, 'failed');
  assert.equal(restored.routing.fallbackTo, 'glm-5.2');
  assert.match(restored.errors[0].message, /providers exhausted/);
});
