import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeExactApproval, createExactApproval, validateExactApproval } from '../server/policy.js';

test('exact approvals reject mutation, expiry, cross-tool reuse, and replay', () => {
  const input = { command: 'npm test', cwd: '.' };
  const approval = createExactApproval({ toolName: 'command.execute', input, ttlMs: 1000 });
  approval.status = 'approved';
  assert.equal(validateExactApproval(approval, 'command.execute', input), approval);
  assert.throws(() => validateExactApproval(approval, 'command.execute', { ...input, command: 'npm publish' }), (error) => error.code === 'APPROVAL_MISMATCH');
  assert.throws(() => validateExactApproval(approval, 'messages.send', input), (error) => error.code === 'APPROVAL_MISMATCH');
  assert.throws(() => validateExactApproval(approval, 'command.execute', input, Date.parse(approval.expiresAt) + 1), (error) => error.code === 'APPROVAL_EXPIRED');
  consumeExactApproval(approval, { ok: true });
  assert.throws(() => validateExactApproval(approval, 'command.execute', input), (error) => error.code === 'APPROVAL_REPLAY');
});
