import crypto from 'node:crypto';
import { actionFingerprint } from './idempotency.js';

function approvalError(message, code = 'APPROVAL_REQUIRED') {
  return Object.assign(new Error(message), { code });
}

export function createExactApproval({ toolName, input = {}, title, runId = null, stepId = null, toolCallId = null, requestedBy = 'local-operator', sessionId = null, originatingBackend = null, backendConversationId = null, idempotencyKey = null, risk = 'high', ttlMs = 10 * 60_000 } = {}) {
  if (!toolName) throw new Error('toolName is required');
  const now = Date.now();
  return {
    id: `approval-${now}-${crypto.randomBytes(3).toString('hex')}`,
    icon: 'shield',
    risk,
    title: title || `Approve ${toolName}`,
    sub: 'Exact action approval',
    status: 'pending',
    toolName,
    action: structuredClone(input),
    originalArguments: structuredClone(input),
    resolvedArguments: structuredClone(input),
    actionHash: actionFingerprint(toolName, input),
    runId,
    stepId,
    toolCallId,
    requestedBy,
    sessionId,
    jarvisSessionId: sessionId,
    originatingBackend,
    backendConversationId,
    idempotencyKey: idempotencyKey || (runId && toolCallId ? `${runId}:${toolCallId}` : toolCallId || null),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    consumedAt: null,
    executionResult: null,
  };
}

export function validateExactApproval(approval, toolName, input = {}, context = {}) {
  const options = typeof context === 'number' ? { now: context } : context;
  const now = options.now ?? Date.now();
  if (!approval) throw approvalError(`A current approval is required for ${toolName}`);
  if (approval.consumedAt || approval.status === 'consumed') throw approvalError('Approval has already been consumed', 'APPROVAL_REPLAY');
  if (approval.status !== 'approved') throw approvalError(`Approval ${approval.id || ''} is not approved`);
  if (approval.toolName !== toolName) throw approvalError('Approval is bound to a different tool', 'APPROVAL_MISMATCH');
  if (approval.actionHash !== actionFingerprint(toolName, input)) throw approvalError('Approval arguments do not match this action', 'APPROVAL_MISMATCH');
  for (const field of ['runId', 'stepId', 'toolCallId', 'requestedBy', 'sessionId']) {
    if (approval[field] != null && options[field] != null && approval[field] !== options[field]) throw approvalError(`Approval is bound to a different ${field}`, 'APPROVAL_MISMATCH');
  }
  if (!Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now) throw approvalError('Approval has expired', 'APPROVAL_EXPIRED');
  return approval;
}

export function consumeExactApproval(approval, result, now = Date.now()) {
  approval.status = 'consumed';
  approval.consumedAt = new Date(now).toISOString();
  approval.result = result;
  approval.executionResult = result;
  return approval;
}
