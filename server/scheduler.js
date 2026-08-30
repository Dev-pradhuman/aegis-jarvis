import { runWorkflow } from './workflowEngine.js';

export function due(workflow, now = Date.now()) {
  const schedule = workflow.schedule;
  if (!schedule?.enabled || !schedule.intervalSeconds || workflow.state !== 'active') return false;
  const last = workflow.lastRun?.finishedAt ? Date.parse(workflow.lastRun.finishedAt) : 0;
  return now - last >= Number(schedule.intervalSeconds) * 1000;
}

export async function tick(state, now = Date.now()) {
  const runs = [];
  for (const workflow of state.workflows || []) if (due(workflow, now)) runs.push(await runWorkflow(state, workflow, { maxRetries: workflow.schedule.maxRetries || 0 }));
  return runs;
}
