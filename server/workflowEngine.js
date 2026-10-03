import crypto from 'node:crypto';
import { activityEntry } from './store.js';
import { getTool } from './registry.js';
import { invokeToolRequest } from './toolRuntime.js';
import { addRunStep, completeRun, createRun, failRun, transitionRun } from './runEngine.js';

function syncCanonicalRun(state, workflow, workflowRun) {
  state.runs ??= [];
  let canonical = state.runs.find((item) => item.id === workflowRun.id);
  if (!canonical) {
    canonical = createRun({ type: 'workflow', request: workflow.name, workflowId: workflow.id });
    canonical.id = workflowRun.id;
    canonical.startedAt = workflowRun.startedAt;
    for (const step of workflow.steps || []) addRunStep(canonical, `Execute ${step.tool || 'unknown step'}`, step.tool || null, Boolean(getTool(step.tool)?.requiresApproval));
    state.runs.unshift(canonical);
    state.runs = state.runs.slice(0, 500);
  }
  for (const [index, step] of (workflow.steps || []).entries()) {
    const id = step.id || String(index + 1);
    const latest = workflowRun.logs.findLast((log) => log.id === id);
    if (!latest || !canonical.steps[index]) continue;
    const target = canonical.steps[index];
    target.status = latest.state === 'waiting_approval' ? 'waiting_for_approval' : latest.state;
    target.startedAt ||= latest.at;
    if (latest.result) target.result = latest.result;
    if (latest.error) target.error = latest.error;
    if (['completed', 'failed', 'cancelled'].includes(target.status)) target.completedAt ||= new Date().toISOString();
  }
  if (workflowRun.state === 'completed' && canonical.status !== 'completed') completeRun(canonical, { workflowId: workflow.id, steps: workflowRun.logs.filter((log) => log.state === 'completed').length });
  else if (workflowRun.state === 'failed' && canonical.status !== 'failed') failRun(canonical, new Error(workflowRun.reason || 'Workflow failed'));
  else if (workflowRun.state === 'waiting_approval' && canonical.status !== 'waiting_for_approval') transitionRun(canonical, 'waiting_for_approval');
  else if (['paused', 'blocked'].includes(workflowRun.state) && canonical.status !== 'paused') transitionRun(canonical, 'paused');
  else if (workflowRun.state === 'cancelled' && canonical.status !== 'cancelled') transitionRun(canonical, 'cancelled');
  else if (workflowRun.state === 'running' && canonical.status !== 'running') transitionRun(canonical, 'running');
}

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
    const evaluateCondition = (condition, logs) => {
      if (!condition) return true;
      try {
        const ctx = logs.reduce((acc, log) => { if (log.result) acc[log.id] = log.result; return acc; }, {});
        const keys = Object.keys(ctx);
        const vals = Object.values(ctx);
        return new Function(...keys, `return ${condition}`)(...vals);
      } catch (err) {
        return false;
      }
    };

    while (run.state === 'running') {
      if (workflow.state === 'paused' || workflow.state === 'cancelled') { run.state = workflow.state; break; }
      
      const latestLogs = new Map();
      for (const log of run.logs) latestLogs.set(log.id, log);
      const latest = [...latestLogs.values()];
      
      const completed = new Set(latest.filter((log) => log.state === 'completed' || log.state === 'skipped').map((log) => log.id));
      const failed = latest.filter((log) => log.state === 'failed');
      if (failed.length > 0) { run.state = 'failed'; run.reason = failed[0].error; break; }

      const pendingApproval = latest.find((log) => log.state === 'waiting_approval');
      if (pendingApproval) {
        const approval = (state.approvals || []).find((item) => item.id === pendingApproval.approvalId);
        if (approval?.status === 'pending') { run.state = 'waiting_approval'; run.reason = `Step ${pendingApproval.id} awaits approval`; break; }
        if (approval?.status !== 'approved') {
          run.state = 'failed'; run.reason = `Step ${pendingApproval.id} approval was rejected or expired`;
          run.logs.push({ id: pendingApproval.id, tool: pendingApproval.tool, at: new Date().toISOString(), state: 'failed', error: run.reason });
          break;
        }
      }
      
      const readySteps = workflow.steps.map((step, idx) => ({ step, id: step.id || String(idx + 1) })).filter(({ step, id }) => {
        if (completed.has(id)) return false;
        if (latestLogs.get(id)?.state === 'waiting_approval') return true; // Needs resume
        return (step.dependsOn || []).every((dep) => completed.has(dep));
      });

      if (readySteps.length === 0) {
        if (workflow.steps.some((step, idx) => !completed.has(step.id || String(idx + 1)))) {
          run.state = 'failed'; run.reason = 'Workflow deadlocked (unmet dependencies)';
        }
        break;
      }

      await Promise.all(readySteps.map(async ({ step, id }) => {
        if (!step || typeof step !== 'object' || !step.tool || !getTool(step.tool)?.enabled) {
          run.logs.push({ id, tool: step.tool || 'unknown', at: new Date().toISOString(), state: 'failed', error: `Step has no available canonical tool` });
          return;
        }
        
        if (step.condition && !evaluateCondition(step.condition, run.logs)) {
          run.logs.push({ id, tool: step.tool, at: new Date().toISOString(), state: 'skipped', result: { ok: true, skipped: true } });
          return;
        }

        const maxRetries = getTool(step.tool).sideEffects ? 0 : Math.max(0, Math.min(3, Number(step.maxRetries ?? options.maxRetries ?? 0)));
        const pending = run.logs.findLast((log) => log.id === id && log.state === 'waiting_approval');
        
        for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
          run.attempts += 1;
          try {
            const response = await invoke(state, {
              toolId: step.tool, input: step.arguments || {}, runId: run.id, stepId: id,
              approvalId: pending?.approvalId || null,
              idempotencyKey: `${run.id}:${id}`,
            });
            if (response.status === 202 && response.body?.approvalRequired) {
              run.logs.push({ id, tool: step.tool, attempt, at: new Date().toISOString(), state: 'waiting_approval', approvalId: response.body.approval.id });
              return;
            }
            if (response.status !== 200 || !response.body?.ok) throw new Error(response.body?.error || response.body?.code || `Tool ${step.tool} failed`);
            run.logs.push({ id, tool: step.tool, attempt, at: new Date().toISOString(), state: 'completed', result: response.body });
            break;
          } catch (error) {
            run.logs.push({ id, tool: step.tool, attempt, at: new Date().toISOString(), state: 'failed', error: error.message });
            if (attempt > maxRetries) return;
          }
        }
      }));
    }
  }
  if (run.state === 'running') run.state = 'completed';
  run.finishedAt = ['completed', 'failed', 'cancelled'].includes(run.state) ? new Date().toISOString() : null;
  if (!resuming && run.state !== 'blocked') workflow.runs = Number(workflow.runs || 0) + 1;
  workflow.lastRun = run;
  syncCanonicalRun(state, workflow, run);
  state.activity = [activityEntry(`workflow.${run.state}`, workflow.name, { workflowId: workflow.id, runId: run.id }), ...(state.activity || [])].slice(0, 200);
  return run;
}

export async function resumeWorkflowForApproval(state, approvalId, options = {}) {
  const workflow = (state.workflows || []).find((item) => item.lastRun?.state === 'waiting_approval' &&
    item.lastRun.logs?.some((log) => log.state === 'waiting_approval' && log.approvalId === approvalId));
  if (!workflow) return null;
  return runWorkflow(state, workflow, { ...options, resume: true });
}
