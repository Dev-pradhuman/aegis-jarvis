import assert from 'node:assert/strict';
import test from 'node:test';
import { expirePendingApprovals } from '../server/approvalExpiry.js';
import { addRunStep, createRun, transitionRun } from '../server/runEngine.js';

test('expired approval clears its waiting Run and workflow without executing', () => {
  const run = createRun({ type: 'workflow' });
  const step = addRunStep(run, 'Approved action', 'command.execute', true);
  step.status = 'waiting_for_approval';
  transitionRun(run, 'waiting_for_approval');
  const state = { runs: [run], approvals: [{ id: 'old', runId: run.id, stepId: step.id, status: 'pending', expiresAt: new Date(1000).toISOString() }], workflows: [{ lastRun: { id: run.id, state: 'waiting_approval' } }] };
  assert.deepEqual(expirePendingApprovals(state, 2000), ['old']);
  assert.equal(state.approvals[0].status, 'expired');
  assert.equal(run.status, 'cancelled');
  assert.equal(step.status, 'cancelled');
  assert.equal(state.workflows[0].lastRun.state, 'failed');
  assert.deepEqual(expirePendingApprovals(state, 3000), []);
});
