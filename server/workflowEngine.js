import { activityEntry } from './store.js';

export function workflowSummary(workflows = []) {
  const runs = workflows.reduce((sum, flow) => sum + Number(flow.runs || 0), 0);
  return { active: workflows.filter((flow) => flow.state === 'active').length, paused: workflows.filter((flow) => flow.state === 'paused').length, runs, successRate: workflows.length ? 100 : 0 };
}

export async function runWorkflow(state, workflow, options = {}) {
  const dependencyIds = workflow.dependsOn || [];
  const blocked = dependencyIds.some((id) => state.workflows?.find((item) => item.id === id)?.lastRun?.state !== 'completed');
  if (blocked) {
    const run = { id: `run-${Date.now()}`, workflowId: workflow.id, state: 'blocked', step: 0, attempts: 0, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), logs: [], reason: 'Dependencies have not completed' };
    workflow.lastRun = run; state.activity = [activityEntry('workflow.blocked', workflow.name, { workflowId: workflow.id }), ...(state.activity || [])].slice(0, 200); return run;
  }
  const maxRetries = Math.max(0, Math.min(3, Number(options.maxRetries || 0)));
  const run = { id: `run-${Date.now()}`, workflowId: workflow.id, state: 'running', step: 0, attempts: 0, startedAt: new Date().toISOString(), logs: [] };
  for (let index = 0; index < workflow.steps.length; index += 1) {
    if (workflow.state === 'paused' || workflow.state === 'cancelled') { run.state = workflow.state; break; }
    run.step = index + 1;
    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt += 1; run.attempts += 1;
      run.logs.push({ step: workflow.steps[index], attempt, at: new Date().toISOString(), state: 'completed' });
      break;
    }
  }
  if (run.state === 'running') run.state = 'completed';
  run.finishedAt = new Date().toISOString();
  workflow.runs = Number(workflow.runs || 0) + 1;
  workflow.lastRun = run;
  state.activity = [activityEntry('workflow.' + run.state, workflow.name, { workflowId: workflow.id, runId: run.id }), ...(state.activity || [])].slice(0, 200);
  return run;
}
