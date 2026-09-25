import crypto from 'node:crypto';

const statuses = new Set(['queued', 'planning', 'running', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled']);

export function createRun(input = {}) {
  const now = new Date().toISOString();
  return { id: `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, type: input.type || 'chat', request: String(input.request || ''), status: 'queued', createdAt: now, startedAt: null, completedAt: null, parentRunId: input.parentRunId || null, taskId: input.taskId || null, workflowId: input.workflowId || null, conversationId: input.conversationId || null, plan: input.plan || null, currentStep: 0, steps: [], toolCalls: [], approvals: [], events: [], errors: [], result: null, provider: input.provider || null, model: input.model || null, tokenUsage: { input: 0, output: 0, total: 0 }, cost: 0 };
}

export function transitionRun(run, status, details = {}) {
  if (!statuses.has(status)) throw new Error(`Invalid run status: ${status}`);
  run.status = status;
  if (status === 'running' && !run.startedAt) run.startedAt = new Date().toISOString();
  if (['completed', 'failed', 'cancelled'].includes(status)) run.completedAt = new Date().toISOString();
  Object.assign(run, details);
  run.events.push({ type: `run.${status}`, at: new Date().toISOString(), details });
  return run;
}

export function addRunStep(run, description, capability, requiresApproval = false) {
  const step = { id: `${run.id}-step-${run.steps.length + 1}`, runId: run.id, index: run.steps.length, type: capability ? 'tool' : 'action', description, capability, status: 'queued', requiresApproval, startedAt: null, completedAt: null, toolCallId: null, result: null, error: null };
  run.steps.push(step); return step;
}

export function completeRun(run, result, usage = {}) {
  const input = Number(usage.input || 0); const output = Number(usage.output || 0); const total = usage.total === undefined ? input + output : Number(usage.total || 0);
  run.result = result; run.tokenUsage = { input, output, total };
  for (const step of run.steps || []) if (step.status === 'queued') { step.status = 'skipped'; step.completedAt = new Date().toISOString(); }
  return transitionRun(run, 'completed');
}

export function failRun(run, error) {
  const at = new Date().toISOString();
  const message = String(error?.message || error);
  run.errors.push({ message, at });
  const current = run.steps?.find((step) => step.status === 'running') || run.steps?.find((step) => step.status === 'queued');
  if (current) { current.status = 'failed'; current.error = message; current.completedAt = at; }
  for (const step of run.steps || []) if (step.status === 'queued') { step.status = 'skipped'; step.completedAt = at; }
  return transitionRun(run, 'failed');
}
