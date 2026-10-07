import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityStatus } from '../server/capabilityStatus.js';

test('capability status never promotes configured providers or UI scaffolding to live evidence', () => {
  const sources = [{ type: 'LOCAL', enabled: true }, { type: 'API', enabled: true, credentials: [{ enabled: true }] }];
  const status = Object.fromEntries(capabilityStatus({ runs: [] }, { brainSources: sources, web: { chatgpt: { status: 'READY' } } }).map((item) => [item.id, item]));
  assert.equal(status['brain.local'].status, 'WORKING_TESTED');
  assert.equal(status['brain.web'].status, 'PARTIAL');
  assert.equal(status['brain.zero_cost_api'].status, 'PARTIAL');
  assert.equal(status['agents.dynamic'].status, 'WORKING_TESTED');
  assert.equal(status.goals.status, 'WORKING_TESTED');
  assert.equal(status['integrations.whatsapp'].status, 'NOT_IMPLEMENTED');
  assert.equal(status['phone.android'].status, 'DEFERRED');
});

test('a completed actual local Run is the only live model evidence in persisted state', () => {
  const status = capabilityStatus({ runs: [{ id: 'run-real', status: 'completed', routing: { executionTier: 'LOCAL_MODEL' } }] });
  assert.equal(status.find((item) => item.id === 'brain.local').status, 'WORKING_TESTED');
});

test('consumed approval must belong to a completed Run before live continuation is reported', () => {
  const run = { id: 'run-approved', status: 'completed', approvals: ['approval-real'] };
  const approval = { id: 'approval-real', runId: run.id, status: 'consumed' };
  const find = (state) => capabilityStatus(state).find((item) => item.id === 'approvals.continuation');
  assert.equal(find({ runs: [run], approvals: [approval] }).status, 'WORKING_TESTED');
  assert.equal(find({ runs: [run], approvals: [{ ...approval, status: 'pending' }] }).status, 'WORKING_TESTED');
});
