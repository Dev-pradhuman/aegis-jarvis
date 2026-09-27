import crypto from 'node:crypto';
import { actionFingerprint } from './idempotency.js';
import { getTool } from './registry.js';
import { addRunStep, completeRun, createRun, failRun, transitionRun } from './runEngine.js';
import { getState, updateState } from './store.js';
import { invokeToolRequest } from './toolRuntime.js';

const activeRequests = new Map();

// Wrap direct tool API requests in the same persisted Run/step lifecycle used
// by chat. A client idempotency key identifies the Run as well as its effect.
export async function executeApiTool(state, request, dependencies = {}) {
  if (!request.runId && request.idempotencyKey) {
    const fingerprint = actionFingerprint(String(request.toolId || ''), request.input || {});
    const existing = activeRequests.get(request.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT', error: 'Key belongs to another tool request' } };
      const result = await existing.promise;
      return { ...result, body: { ...result.body, replayed: true } };
    }
    const promise = executeFreshApiTool(state, request, dependencies);
    activeRequests.set(request.idempotencyKey, { fingerprint, promise });
    try { return await promise; }
    finally { activeRequests.delete(request.idempotencyKey); }
  }
  return executeFreshApiTool(state, request, dependencies);
}

async function executeFreshApiTool(state, request, dependencies = {}) {
  const persist = dependencies.persist || updateState;
  const read = dependencies.read || getState;
  const invoke = dependencies.invoke || invokeToolRequest;
  if (request.runId) return invoke(state, request);
  const toolId = String(request.toolId || '');
  const args = request.input || {};
  const clientKey = request.idempotencyKey || null;
  const fingerprint = actionFingerprint(toolId, args);
  if (clientKey) {
    const previous = (state.runs || []).find((item) => item.apiIdempotencyKey === clientKey);
    if (previous) {
      if (previous.apiFingerprint !== fingerprint) return { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT', error: 'Key belongs to another tool request' } };
      const pending = (state.approvals || []).find((item) => item.runId === previous.id && item.status === 'pending');
      if (pending) return { status: 202, body: { approvalRequired: true, approval: pending, runId: previous.id, replayed: true } };
      const execution = (state.toolExecutions || []).find((item) => item.idempotencyKey === clientKey);
      if (previous.status === 'completed' && execution?.state === 'completed') return { status: 200, body: { ...execution.result, runId: previous.id, replayed: true } };
      return { status: 409, body: { code: 'ACTION_OUTCOME_UNKNOWN', error: 'Previous request is unresolved; inspect its Run before retrying', runId: previous.id } };
    }
  }
  const tool = getTool(toolId);
  const run = createRun({ type: 'tool', request: `Execute ${toolId}` });
  run.apiIdempotencyKey = clientKey;
  run.apiFingerprint = fingerprint;
  const step = addRunStep(run, tool?.name || toolId, toolId, Boolean(tool?.requiresApproval));
  step.status = 'running'; step.startedAt = new Date().toISOString();
  transitionRun(run, 'running');
  await persist((draft) => { draft.runs ??= []; draft.runs.unshift(run); draft.runs = draft.runs.slice(0, 500); return draft; });
  const key = clientKey || `${run.id}:${step.id}`;
  try {
    const response = await invoke(await read(), { ...request, toolId, input: args, runId: run.id, stepId: step.id, idempotencyKey: key, resumeOnApproval: true });
    if (response.status === 202 && response.body?.approvalRequired) {
      step.status = 'waiting_for_approval'; run.approvals.push(response.body.approval.id);
      transitionRun(run, 'waiting_for_approval');
    } else {
      const succeeded = response.status === 200 && response.body?.ok;
      step.status = succeeded ? 'completed' : 'failed'; step.result = response.body; step.completedAt = new Date().toISOString();
      run.toolCalls.push({ id: `tool-call-${crypto.randomUUID()}`, tool: toolId, status: step.status, resultId: key });
      if (succeeded) completeRun(run, { toolId, dispatch: response.body.data });
      else failRun(run, new Error(response.body?.error || response.body?.code || 'Tool action failed'));
    }
    await persist((draft) => draft);
    return { status: response.status, body: { ...response.body, runId: run.id } };
  } catch (error) {
    step.status = 'failed'; step.error = error.message; step.completedAt = new Date().toISOString();
    failRun(run, error);
    await persist((draft) => draft);
    return { status: 502, body: { code: error.code || 'TOOL_EXECUTION_FAILED', error: error.message, runId: run.id } };
  }
}
