import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovalRequest } from '../server/approvalContinuation.js';
import { routeRequest } from '../server/router.js';

test('resolveApprovalRequest handles approved and rejected outcomes', async () => {
  let state = {
    approvals: [
      {
        id: 'approval-test-1',
        title: 'Approve Command',
        toolName: 'command.execute',
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        pendingRequest: {
          toolId: 'command.execute',
          input: { command: 'echo approved' },
          runId: 'run-test-1',
          idempotencyKey: 'key-1'
        }
      },
      {
        id: 'approval-test-2',
        title: 'Approve Command 2',
        toolName: 'command.execute',
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        pendingRequest: {
          toolId: 'command.execute',
          input: { command: 'echo rejected' },
          runId: 'run-test-2',
          idempotencyKey: 'key-2'
        }
      }
    ],
    runs: [
      { id: 'run-test-1', origin: 'chat', type: 'chat', status: 'waiting_for_approval', steps: [{ id: 'step-1', status: 'waiting_for_approval' }], toolCalls: [] },
      { id: 'run-test-2', origin: 'chat', type: 'chat', status: 'waiting_for_approval', steps: [{ id: 'step-2', status: 'waiting_for_approval' }], toolCalls: [] }
    ],
    activity: []
  };

  const persist = async (mutate) => { state = mutate(state); return state; };
  const read = async () => state;
  const invoke = async (_s, req) => ({
    status: 200,
    body: { ok: true, toolId: req.toolId, data: { stdout: 'approved\n', code: 0 } }
  });

  // 1. Approved outcome
  const approvedRes = await resolveApprovalRequest('approval-test-1', 'approved', { persist, read, invoke });
  assert.equal(approvedRes.status, 200);
  assert.equal(approvedRes.body.approval.status, 'approved');
  assert.equal(approvedRes.body.result.ok, true);
  assert.equal(approvedRes.body.result.data.stdout, 'approved\n');

  // 2. Rejected outcome
  const rejectedRes = await resolveApprovalRequest('approval-test-2', 'rejected', { persist, read, invoke });
  assert.equal(rejectedRes.status, 200);
  assert.equal(rejectedRes.body.approval.status, 'rejected');
  assert.equal(state.runs.find(r => r.id === 'run-test-2').status, 'cancelled');
});

test('Google Calendar natural queries route deterministically to calendar.upcoming', () => {
  const q1 = routeRequest('What is on my calendar today?');
  assert.equal(q1.route, 'TOOL_CALL');
  assert.equal(q1.capability, 'calendar.upcoming');
  assert.equal(q1.args.limit, 10);

  const q2 = routeRequest('what is my schedule today');
  assert.equal(q2.route, 'TOOL_CALL');
  assert.equal(q2.capability, 'calendar.upcoming');

  const q3 = routeRequest('what meetings do I have today');
  assert.equal(q3.route, 'TOOL_CALL');
  assert.equal(q3.capability, 'calendar.upcoming');

  const q4 = routeRequest('show my upcoming calendar events');
  assert.equal(q4.route, 'TOOL_CALL');
  assert.equal(q4.capability, 'calendar.upcoming');
});
