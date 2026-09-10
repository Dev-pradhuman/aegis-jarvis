import { activityEntry } from './store.js';
import { executeToolCall } from './toolExecutor.js';
import { getToolDefinition } from './registry.js';
import { addRunStep, completeRun, createRun, failRun, transitionRun } from './runEngine.js';
import { ToolRuntimeError } from './toolErrors.js';

function normalizedStep(step, index) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return null;
  const toolName = String(step.toolName || step.tool || '').trim();
  if (!toolName) return null;
  return { id: String(step.id || `workflow-step-${index + 1}`), description: String(step.description || step.name || toolName), toolName, arguments: step.arguments && typeof step.arguments === 'object' ? structuredClone(step.arguments) : {}, dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [], maxRetries: Math.max(0, Math.min(3, Number(step.maxRetries || 0))) };
}

function lastRunStatus(workflow) { return workflow.lastRun?.status || workflow.lastRun?.state || null; }
export function workflowSummary(workflows = []) {
  const runs = workflows.reduce((sum, flow) => sum + Number(flow.runs || 0), 0);
  const terminal = workflows.filter((flow) => ['completed', 'failed'].includes(lastRunStatus(flow)));
  const completed = terminal.filter((flow) => lastRunStatus(flow) === 'completed').length;
  return { active: workflows.filter((flow) => flow.state === 'active').length, paused: workflows.filter((flow) => flow.state === 'paused').length, runs, successRate: terminal.length ? Math.round((completed / terminal.length) * 100) : 0 };
}

function workflowRunView(run) {
  return { id: run.id, runId: run.id, workflowId: run.workflowId, state: run.status, status: run.status, step: run.currentStep, attempts: run.toolCalls.reduce((sum, call) => sum + Number(call.retryCount || 0) + Number(call.workflowRetryCount || 0) + 1, 0), startedAt: run.startedAt, finishedAt: run.completedAt, logs: run.steps.map((step) => { const call = run.toolCalls.find((item) => item.id === step.toolCallId); return { step: step.description, toolName: step.capability, toolCallId: step.toolCallId, state: step.status, startedAt: step.startedAt, finishedAt: step.completedAt, result: step.result, verification: call?.verificationEvidence || null, retryCount: Number(call?.retryCount || 0) + Number(call?.workflowRetryCount || 0), error: step.error }; }) };
}

function record(state, workflow, run) {
  workflow.lastRun = workflowRunView(run);
  state.activity = [activityEntry(`workflow.${run.status}`, workflow.name, { workflowId: workflow.id, runId: run.id }), ...(state.activity || [])].slice(0, 200);
  return workflow.lastRun;
}

function buildRun(state, workflow, steps) {
  const run = createRun({ type: 'workflow', request: `Run workflow: ${workflow.name}`, workflowId: workflow.id, plan: { goal: workflow.name, intent: 'workflow', steps: steps.map((step, index) => ({ id: step.id, index, description: step.description, capability: step.toolName, requiresApproval: Boolean(getToolDefinition(step.toolName)?.requiresApproval) })) } });
  steps.forEach((step) => { const runStep = addRunStep(run, step.description, step.toolName, Boolean(getToolDefinition(step.toolName)?.requiresApproval)); runStep.id = `${run.id}:${step.id}`; });
  state.runs ??= []; state.runs.unshift(run); state.runs = state.runs.slice(0, 500);
  transitionRun(run, 'running');
  return run;
}

export async function runWorkflow(state, workflow, options = {}) {
  const dependencyIds = workflow.dependsOn || [];
  const blocked = dependencyIds.some((id) => lastRunStatus(state.workflows?.find((item) => item.id === id) || {}) !== 'completed');
  if (blocked) {
    const run = createRun({ type: 'workflow', request: `Run workflow: ${workflow.name}`, workflowId: workflow.id });
    run.status = 'failed'; run.startedAt = run.createdAt; run.completedAt = run.createdAt; run.errors.push({ code: 'WORKFLOW_BLOCKED', message: 'Dependencies have not completed', at: run.createdAt });
    state.runs ??= []; state.runs.unshift(run); const view = record(state, workflow, run); view.reason = 'Dependencies have not completed'; return view;
  }

  const steps = (workflow.steps || []).map(normalizedStep);
  if (!steps.length || steps.some((step) => !step)) {
    const run = buildRun(state, workflow, steps.filter(Boolean));
    const error = new ToolRuntimeError('INVALID_ARGUMENTS', 'Workflow steps must be structured objects with toolName and arguments; legacy text steps are not executable');
    failRun(run, error); workflow.runs = Number(workflow.runs || 0) + 1; return record(state, workflow, run);
  }

  let run = options.resumeRunId ? (state.runs || []).find((item) => item.id === options.resumeRunId && item.workflowId === workflow.id) : null;
  if (!run) { run = buildRun(state, workflow, steps); workflow.runs = Number(workflow.runs || 0) + 1; }
  else if (run.status === 'waiting_for_approval' || run.status === 'paused') transitionRun(run, 'running');

  for (let index = 0; index < steps.length; index += 1) {
    const workflowStep = steps[index]; const runStep = run.steps[index];
    if (runStep.status === 'completed') continue;
    if (workflow.state === 'paused' || workflow.state === 'cancelled') { transitionRun(run, workflow.state); return record(state, workflow, run); }
    const unmet = workflowStep.dependsOn.some((id) => steps.findIndex((item) => item.id === id) >= index || run.steps[steps.findIndex((item) => item.id === id)]?.status !== 'completed');
    if (unmet) { const error = new ToolRuntimeError('INVALID_ARGUMENTS', `Workflow step ${workflowStep.id} has an unmet or circular dependency`); runStep.status = 'failed'; runStep.error = { code: error.code, message: error.message }; failRun(run, error); return record(state, workflow, run); }

    const priorCall = run.toolCalls.find((call) => call.id === runStep.toolCallId);
    const approvalId = priorCall?.approvalId || null;
    let result; let toolCallId = priorCall?.id;
    for (let workflowAttempt = 0; workflowAttempt <= workflowStep.maxRetries; workflowAttempt += 1) {
      result = await (options.execute || executeToolCall)({ id: toolCallId, toolName: workflowStep.toolName, arguments: workflowStep.arguments, source: 'workflow', runId: run.id, stepId: runStep.id, requestedBy: options.requestedBy || 'workflow-engine', approvalId, idempotencyKey: `${run.id}:${workflowStep.id}` }, { state, runId: run.id, stepId: runStep.id, workflowId: workflow.id, request: run.request, autoCompleteRun: false, continueOnError: true, requestedBy: options.requestedBy || 'workflow-engine' });
      toolCallId = result.toolCallId;
      const call = run.toolCalls.find((item) => item.id === result.toolCallId);
      if (call) call.workflowRetryCount = workflowAttempt;
      if (['completed', 'waiting_for_approval'].includes(result.status)) break;
      if (!['EXECUTION_FAILED', 'TIMEOUT', 'RATE_LIMITED', 'PROVIDER_ERROR'].includes(result.error?.code)) break;
    }
    if (result.status === 'waiting_for_approval') { transitionRun(run, 'waiting_for_approval'); return record(state, workflow, run); }
    if (result.status !== 'completed') { if (run.status !== 'failed') failRun(run, new ToolRuntimeError(result.error?.code || 'EXECUTION_FAILED', result.error?.message || `Workflow step failed: ${workflowStep.description}`)); return record(state, workflow, run); }
  }

  completeRun(run, { workflowId: workflow.id, steps: run.steps.map((step) => ({ id: step.id, status: step.status, toolCallId: step.toolCallId })) }, { total: 0 });
  return record(state, workflow, run);
}

export async function resumeWorkflowAfterApproval(state, approval, options = {}) {
  if (!approval?.runId) return null;
  const run = (state.runs || []).find((item) => item.id === approval.runId && item.workflowId);
  if (!run) return null;
  const workflow = (state.workflows || []).find((item) => item.id === run.workflowId);
  if (!workflow) return null;
  return runWorkflow(state, workflow, { ...options, resumeRunId: run.id, requestedBy: approval.requestedBy || 'workflow-engine' });
}

export { normalizedStep };
