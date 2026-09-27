import { transitionRun } from './runEngine.js';

export function expirePendingApprovals(state, now = Date.now()) {
  const expired = [];
  for (const approval of state.approvals || []) {
    if (approval.status !== 'pending' || Date.parse(approval.expiresAt || 0) > now) continue;
    approval.status = 'expired';
    expired.push(approval.id);
    const run = (state.runs || []).find((item) => item.id === approval.runId);
    if (run?.status === 'waiting_for_approval') {
      const step = run.steps?.find((item) => item.id === approval.stepId) || run.steps?.find((item) => item.status === 'waiting_for_approval');
      if (step) { step.status = 'cancelled'; step.completedAt = new Date(now).toISOString(); step.error = 'Approval expired'; }
      transitionRun(run, 'cancelled');
    }
    const workflow = (state.workflows || []).find((item) => item.lastRun?.id === approval.runId && item.lastRun?.state === 'waiting_approval');
    if (workflow) { workflow.lastRun.state = 'failed'; workflow.lastRun.reason = 'Approval expired'; workflow.lastRun.finishedAt = new Date(now).toISOString(); }
  }
  return expired;
}
