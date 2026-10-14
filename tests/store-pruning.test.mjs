import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneState } from '../server/store.js';

test('pruneState bounds conversation history to newest 100 messages', () => {
  const conversations = Array.from({ length: 150 }, (_, i) => ({
    id: `msg-${i}`,
    who: i % 2 === 0 ? 'YOU' : 'JARVIS',
    lines: [`Message ${i}`]
  }));

  const state = { conversations };
  pruneState(state);

  assert.equal(state.conversations.length, 100);
  assert.equal(state.conversations[0].id, 'msg-50');
  assert.equal(state.conversations[99].id, 'msg-149');
});

test('pruneState bounds runs to newest 100 entries', () => {
  const runs = Array.from({ length: 130 }, (_, i) => ({
    id: `run-${i}`,
    status: 'completed',
    type: 'tool'
  }));

  const state = { runs };
  pruneState(state);

  assert.equal(state.runs.length, 100);
  assert.equal(state.runs[0].id, 'run-30');
  assert.equal(state.runs[99].id, 'run-129');
});

test('pruneState bounds approvals to 100 while preserving pending approvals', () => {
  const approvals = [
    ...Array.from({ length: 120 }, (_, i) => ({
      id: `appr-consumed-${i}`,
      status: 'consumed'
    })),
    { id: 'appr-pending-1', status: 'pending' },
    { id: 'appr-pending-2', status: 'pending' }
  ];

  const state = { approvals };
  pruneState(state);

  assert.equal(state.approvals.length, 100);
  // Pending approvals must be preserved
  const pending = state.approvals.filter((a) => a.status === 'pending');
  assert.equal(pending.length, 2);
  assert.ok(state.approvals.some((a) => a.id === 'appr-pending-1'));
  assert.ok(state.approvals.some((a) => a.id === 'appr-pending-2'));
});

test('pruneState bounds activity and auditLog to newest 200 entries', () => {
  const activity = Array.from({ length: 250 }, (_, i) => ({
    id: `act-${i}`,
    message: `Action ${i}`
  }));
  const auditLog = Array.from({ length: 220 }, (_, i) => ({
    id: `audit-${i}`,
    event: `Event ${i}`
  }));

  const state = { activity, auditLog };
  pruneState(state);

  assert.equal(state.activity.length, 200);
  assert.equal(state.activity[0].id, 'act-50');
  assert.equal(state.activity[199].id, 'act-249');

  assert.equal(state.auditLog.length, 200);
  assert.equal(state.auditLog[0].id, 'audit-20');
  assert.equal(state.auditLog[199].id, 'audit-219');
});

test('pruneState handles small or empty state objects safely', () => {
  const smallState = {
    conversations: [{ id: '1' }],
    runs: [],
    approvals: []
  };
  pruneState(smallState);
  assert.equal(smallState.conversations.length, 1);
  assert.equal(smallState.runs.length, 0);

  const emptyState = {};
  assert.doesNotThrow(() => pruneState(emptyState));
  assert.doesNotThrow(() => pruneState(null));
});
