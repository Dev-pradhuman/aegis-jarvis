import assert from 'node:assert/strict';
import test from 'node:test';
import { beginGeneration, cancelGeneration, generationEvents, publishGenerationEvent, releaseGeneration } from '../server/generationEvents.js';

test('generation events are isolated by JARVIS session and monotonically sequenced', () => {
  const left = `left-${Date.now()}`; const right = `right-${Date.now()}`;
  const first = publishGenerationEvent({ type: 'generation.delta', sessionId: left, delta: 'one' });
  publishGenerationEvent({ type: 'generation.delta', sessionId: right, delta: 'hidden' });
  const second = publishGenerationEvent({ type: 'generation.delta', sessionId: left, delta: 'two' });
  const selected = generationEvents({ after: first.sequence, sessionId: left });
  assert.deepEqual(selected.map((item) => item.delta), ['two']);
  assert.ok(second.sequence > first.sequence);
});

test('cancellation aborts only the active generation for that session', () => {
  const sessionId = `cancel-${Date.now()}`;
  const controller = beginGeneration(sessionId, { runId: 'run-cancel' });
  assert.equal(controller.signal.aborted, false);
  assert.equal(cancelGeneration(sessionId), true);
  assert.equal(controller.signal.aborted, true);
  assert.ok(generationEvents({ sessionId }).some((item) => item.type === 'generation.cancelled'));
  releaseGeneration(sessionId);
});
