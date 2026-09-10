import assert from 'node:assert/strict';
import test from 'node:test';
import { executeToolCall } from '../server/toolExecutor.js';
import { ToolRuntimeError } from '../server/toolErrors.js';

const freshState = () => ({ tasks: [], memories: [], documents: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} });

test('valid canonical tool call executes, verifies, records Run state, and emits telemetry', async () => {
  const state = freshState();
  const result = await executeToolCall({ toolName: 'tasks.create', arguments: { title: 'Canonical task' }, source: 'test' }, { state, request: 'Create canonical task' });
  assert.equal(result.status, 'completed');
  assert.equal(result.verified, true);
  assert.equal(state.tasks[0].title, 'Canonical task');
  assert.equal(state.runs[0].status, 'completed');
  assert.equal(state.runs[0].steps[0].toolCallId, result.toolCallId);
  assert.equal(state.runs[0].toolCalls[0].status, 'completed');
  assert.equal(state.runtime.toolTelemetry[0].tool, 'tasks.create');
});

test('unknown tools and invalid arguments are rejected with structured errors', async () => {
  const state = freshState();
  const missing = await executeToolCall({ toolName: 'missing.tool', arguments: {} }, { state });
  assert.equal(missing.error.code, 'TOOL_NOT_FOUND');
  const invalid = await executeToolCall({ toolName: 'tasks.create', arguments: {} }, { state });
  assert.equal(invalid.error.code, 'INVALID_ARGUMENTS');
  assert.match(invalid.error.message, /title is required/);
});

test('missing configuration creates an accurately failed Run', async () => {
  const prior = process.env.SEARCH_PROVIDER_URL; delete process.env.SEARCH_PROVIDER_URL;
  const state = freshState();
  const result = await executeToolCall({ toolName: 'research.search', arguments: { query: 'JARVIS' } }, { state, request: 'Search' });
  assert.equal(result.error.code, 'CONFIGURATION_MISSING');
  assert.equal(state.runs[0].status, 'failed');
  assert.equal(state.runs[0].toolCalls[0].status, 'failed');
  if (prior !== undefined) process.env.SEARCH_PROVIDER_URL = prior;
});

test('timeout, provider failure, and verification failure remain distinct', async () => {
  const timeoutState = freshState();
  const timeout = await executeToolCall({ toolName: 'diagnostics', arguments: {} }, { state: timeoutState, timeoutMs: 5, handler: async () => new Promise(() => {}) });
  assert.equal(timeout.error.code, 'TIMEOUT');

  const providerState = freshState();
  const provider = await executeToolCall({ toolName: 'diagnostics', arguments: {} }, { state: providerState, handler: async () => { throw new ToolRuntimeError('PROVIDER_ERROR', 'provider unavailable'); } });
  assert.equal(provider.error.code, 'PROVIDER_ERROR');

  const verificationState = freshState();
  const verification = await executeToolCall({ toolName: 'diagnostics', arguments: {} }, { state: verificationState, handler: async () => ({ output: { service: 'ok' }, provider: 'test' }), verifier: async () => { throw new ToolRuntimeError('VERIFICATION_FAILED', 'evidence missing'); } });
  assert.equal(verification.status, 'failed_verification');
  assert.equal(verification.error.code, 'VERIFICATION_FAILED');
  assert.equal(verificationState.runs[0].steps[0].status, 'failed_verification');
});

test('retryable provider error is bounded and succeeds on the next canonical attempt', async () => {
  const prior = process.env.SEARCH_PROVIDER_URL; process.env.SEARCH_PROVIDER_URL = 'https://example.invalid/search';
  const state = freshState(); let attempts = 0;
  const result = await executeToolCall({ toolName: 'research.search', arguments: { query: 'bounded retry' } }, { state, handler: async () => {
    attempts += 1;
    if (attempts === 1) throw new ToolRuntimeError('PROVIDER_ERROR', 'temporary provider failure');
    return { output: { configured: true, query: 'bounded retry', sources: [] }, provider: 'test' };
  } });
  assert.equal(result.status, 'completed');
  assert.equal(result.retryCount, 1);
  assert.equal(attempts, 2);
  if (prior === undefined) delete process.env.SEARCH_PROVIDER_URL; else process.env.SEARCH_PROVIDER_URL = prior;
});

test('permissions and exact approvals are enforced before side effects and replay', async () => {
  const denied = await executeToolCall({ toolName: 'tasks.create', arguments: { title: 'Denied' }, permissionContext: { allowedRiskLevels: ['READ_ONLY'] } }, { state: freshState() });
  assert.equal(denied.error.code, 'PERMISSION_DENIED');

  const state = freshState();
  const waiting = await executeToolCall({ id: 'command-call', toolName: 'command.execute', arguments: { command: 'node --version' }, idempotencyKey: 'command-once' }, { state });
  assert.equal(waiting.status, 'waiting_for_approval');
  waiting.approval.status = 'approved';
  const mutation = await executeToolCall({ id: waiting.toolCallId, toolName: 'command.execute', arguments: { command: 'node --help' }, runId: waiting.runId, stepId: waiting.stepId, approvalId: waiting.approval.id, idempotencyKey: 'command-once' }, { state });
  assert.equal(mutation.error.code, 'APPROVAL_MISMATCH');
  const completed = await executeToolCall({ id: waiting.toolCallId, toolName: 'command.execute', arguments: { command: 'node --version' }, runId: waiting.runId, stepId: waiting.stepId, approvalId: waiting.approval.id, idempotencyKey: 'command-once' }, { state });
  assert.equal(completed.status, 'completed');
  const replay = await executeToolCall({ id: waiting.toolCallId, toolName: 'command.execute', arguments: { command: 'node --version' }, runId: waiting.runId, stepId: waiting.stepId, approvalId: waiting.approval.id, idempotencyKey: 'command-once' }, { state });
  assert.equal(replay.error.code, 'APPROVAL_REPLAY');
  const failoverReplay = await executeToolCall({ id: 'fallback-call', toolName: 'command.execute', arguments: { command: 'node --version' }, runId: waiting.runId, idempotencyKey: 'command-once' }, { state });
  assert.equal(failoverReplay.status, 'completed');
  assert.equal(failoverReplay.replayed, true, 'model/provider failover must reuse execution evidence instead of repeating the command');
});
