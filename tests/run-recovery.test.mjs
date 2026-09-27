import assert from 'node:assert/strict';
import test from 'node:test';
import { createRun, transitionRun } from '../server/runEngine.js';
import { recoverInterruptedRuns } from '../server/store.js';

test('restart marks abandoned work failed while preserving approval handoff', () => {
  const running = transitionRun(createRun({ request: 'Slow model request' }), 'running');
  const waiting = transitionRun(createRun({ request: 'Approve action' }), 'waiting_for_approval');
  const completed = transitionRun(createRun({ request: 'Finished work' }), 'completed');
  assert.equal(recoverInterruptedRuns([running, waiting, completed]), 1);
  assert.equal(running.status, 'failed');
  assert.equal(running.errors.at(-1).code, 'SERVICE_RESTARTED');
  assert.equal(waiting.status, 'waiting_for_approval');
  assert.equal(completed.status, 'completed');
  assert.equal(recoverInterruptedRuns([running, waiting, completed]), 0);
});
