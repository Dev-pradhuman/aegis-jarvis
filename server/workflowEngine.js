import crypto from 'node:crypto';
import { activityEntry } from './store.js';
import { getTool } from './registry.js';
import { invokeToolRequest } from './toolRuntime.js';

export function workflowSummary(workflows = []) {
  const runs = workflows.reduce((sum, flow) => sum + Number(flow.runs || 0), 0);
  const observed = workflows.map((flow) => flow.lastRun?.state).filter((state) => state === 'completed' || state === 'failed');
  return {
    active: workflows.filter((flow) => flow.state === 'active').length,
    paused: workflows.filter((flow) => flow.state === 'paused').length,
    runs,
    successRate: observed.length ? Math.round(100 * observed.filter((state) => state === 'completed').length / observed.length) : null,
  };
}

export async function runWorkflow(state, workflow, options = {}) {
  const invoke = options.invoke || invokeToolRequest;
  const resuming = workflow.lastRun?.state === 'waiting_approval' && options.resume === true;
  const run = resuming ? workflow.lastRun : {
    id: `run-${crypto.randomUUID()}`, workflowId: workflow.id, state: 'running', step: 0,
    attempts: 0, startedAt: new Date().toISOString(), logs: [],
  };
  run.state = 'running';
  run.reason = null;
  const dependencies = workflow.dependsOn || [];
  if (dependencies.some((id) => state.workflows?.find((item) => item.id === id)?.lastRun?.state !== 'completed')) {
    run.state = 'blocked'; run.reason = 'Dependencies have not completed';
  } else if (!Array.isArray(workflow.steps) || !workflow.steps.length) {
    run.state = 'failed'; run.reason = 'Workflow requires at least one executable tool step';
  } else {
    const completed = new Set(run.logs.filter((log) => log.state === 'completed').map((log) => log.id));
    for (const [index, step] of workflow.steps.entries()) {
      if (workflow.state === 'paused' || workflow.state === 'cancelled') { run.state = workflow.state; break; }
      if (!step || typeof step !== 'object' || !step.tool || !getTool(step.tool)?.enabled) {
        run.state = 'failed'; run.reason = `Step ${index + 1} has no available canonical tool`; break;
      }
      const id = step.id || String(index + 1);
      if (completed.has(id)) continue;
      if ((step.dependsOn || []).some((dependency) => !completed.has(dependency))) {
        run.state = 'failed'; run.reason = `Step ${id} has unmet dependencies`; break;
      }
      run.step = index + 1;
      const maxRetries = getTool(step.tool).sideEffects ? 0 : Math.max(0, Math.min(3, Number(step.maxRetries ?? options.maxRetries ?? 0)));
      const pending = run.logs.findLast((log) => log.id === id && log.state === 'waiting_approval');
      if (pending?.approvalId) {
        const approval = (state.approvals || []).find((item) => item.id === pending.approvalId);
        if (approval?.status === 'pending') { run.state = 'waiting_approval'; run.reason = `Step ${id} awaits approval`; break; }
        if (approval?.status !== 'approved') { run.state = 'failed'; run.reason = `Step ${id} approval was rejected or expired`; break; }
      }
      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        run.attempts += 1;
        try {
          const response = await invoke(state, {
            toolId: step.tool, input: step.arguments || {}, runId: run.id,
            approvalId: pending?.approvalId || null,
            idempotencyKey: `${run.id}:${id}`,
          });
          if (response.status === 202 && response.body?.approvalRequired) {
            run.logs.push({ id, tool: step.tool, attempt, at: new Date().toISOString(), state: 'waiting_approval', approvalId: response.body.approval.id });
            run.state = 'waiting_approval'; run.reason = `Step ${id} awaits approval`;
            break;
          }
          if (response.status !== 200 || !response.body?.ok) throw new Error(response.body?.error || response.body?.code || `Tool ${step.tool} failed`);
          run.logs.push({ id, tool: step.tool, attempt, at: new Date().toISOString(), state: 'completed', result: response.body });
          completed.add(id);
          break;
        } catch (error) {
          run.logs.push({ id, tool: step.tool, attempt, at: new Date().toISOString(), state: 'failed', error: error.message });
          if (attempt > maxRetries) { run.state = 'failed'; run.reason = error.message; }
        }
      }
      if (run.state !== 'running') break;
    }
  }
  if (run.state === 'running') run.state = 'completed';
  run.finishedAt = new Date().toISOString();
  if (!resuming && run.state !== 'blocked') workflow.runs = Number(workflow.runs || 0) + 1;
  workflow.lastRun = run;
  state.activity = [activityEntry(`workflow.${run.state}`, workflow.name, { workflowId: workflow.id, runId: run.id }), ...(state.activity || [])].slice(0, 200);
  return run;
}
