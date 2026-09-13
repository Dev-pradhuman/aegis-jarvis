import { runWorkflow } from './workflowEngine.js';

export function occurrenceKey(workflow, now = Date.now()) {
  const intervalMs = Number(workflow.schedule?.intervalSeconds || 0) * 1000;
  return intervalMs > 0 ? `interval:${Math.floor(now / intervalMs)}` : null;
}

export function due(workflow, now = Date.now()) {
  const schedule = workflow.schedule;
  if (!schedule?.enabled || !schedule.intervalSeconds || workflow.state !== 'active') return false;
  if (['queued', 'planning', 'running', 'waiting_for_approval', 'paused'].includes(workflow.lastRun?.status || workflow.lastRun?.state)) return false;
  const key = occurrenceKey(workflow, now);
  if (key && workflow.schedulerState?.lastOccurrenceKey === key) return false;
  const last = workflow.lastRun?.finishedAt ? Date.parse(workflow.lastRun.finishedAt) : 0;
  return now - last >= Number(schedule.intervalSeconds) * 1000;
}

export async function tick(state, now = Date.now()) {
  const runs = [];
  for (const workflow of state.workflows || []) {
    if (!due(workflow, now)) continue;
    const key = occurrenceKey(workflow, now);
    workflow.schedulerState = { ...(workflow.schedulerState || {}), lastOccurrenceKey: key, claimedAt: new Date(now).toISOString() };
    const run = await runWorkflow(state, workflow, { maxRetries: workflow.schedule.maxRetries || 0, occurrenceKey: key });
    workflow.schedulerState.completedAt = new Date().toISOString();
    workflow.schedulerState.lastRunId = run.runId || run.id;
    runs.push(run);
  }
  return runs;
}
