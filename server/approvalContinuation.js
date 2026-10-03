import crypto from 'node:crypto';
import { activityEntry, getState, updateState } from './store.js';
import { transitionRun } from './runEngine.js';
import { errorRun, finishRun } from './orchestrator.js';
import { invokeToolRequest } from './toolRuntime.js';
import { resumeWorkflowForApproval } from './workflowEngine.js';

function chatOutcome(draft, run, approval, result, succeeded) {
  if (run?.origin !== 'chat') return;
  const tool = approval.pendingRequest?.toolId || approval.toolName;
  const detail = succeeded
    ? tool === 'computer.type' || tool === 'computer.keypress' ? 'The desktop portal accepted the input for the verified target. Application content was not read back.'
      : tool === 'windows.close' ? 'The selected window close action completed.'
        : `${tool} completed.`
    : `The approved ${tool} action failed: ${result?.error || result?.code || 'unknown error'}.`;
  draft.conversations ??= [];
  draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [run.request], runId: run.id },
    { who: 'JARVIS', time: new Date().toISOString(), lines: [detail], runId: run.id });
  draft.conversations = draft.conversations.slice(-100);
}

// A decision belongs to one pending approval. Its original request is persisted
// before the user sees it, so continuing never reparses a new user message.
export async function resolveApprovalRequest(id, outcome, dependencies = {}) {
  if (!['approved', 'rejected'].includes(outcome)) return { status: 400, body: { code: 'APPROVAL_DECISION_INVALID', error: 'Choose approved or rejected' } };
  const persist = dependencies.persist || updateState;
  const read = dependencies.read || getState;
  const invoke = dependencies.invoke || invokeToolRequest;
  const resumeWorkflow = dependencies.resumeWorkflow || resumeWorkflowForApproval;
  let approval = null;
  let expired = false;
  await persist((draft) => {
    const current = (draft.approvals || []).find((item) => item.id === id);
    if (!current || current.status !== 'pending') return draft;
    expired = Date.parse(current.expiresAt || 0) <= Date.now();
    current.status = expired ? 'expired' : outcome;
    approval = current;
    draft.activity = [activityEntry(`approval.${current.status}`, current.title, { approvalId: id, runId: current.runId || null }), ...(draft.activity || [])].slice(0, 200);
    if (current.status !== 'approved' && current.pendingRequest?.runId) {
      const run = (draft.runs || []).find((item) => item.id === current.pendingRequest.runId);
      if (run?.status === 'waiting_for_approval') {
        const step = run.steps.find((item) => item.id === current.stepId) || run.steps.find((item) => item.status === 'waiting_for_approval');
        if (step) { step.status = 'cancelled'; step.completedAt = new Date().toISOString(); }
        transitionRun(run, 'cancelled');
        if (run.origin === 'chat') {
          draft.conversations ??= [];
          draft.conversations.push({ who: 'YOU', time: new Date().toISOString(), lines: [run.request], runId: run.id },
            { who: 'JARVIS', time: new Date().toISOString(), lines: [`${current.toolName} was ${expired ? 'not run because approval expired' : 'not run because approval was denied'}.`], runId: run.id });
          draft.conversations = draft.conversations.slice(-100);
        }
      }
    }
    return draft;
  });
  if (!approval) return { status: 404, body: { code: 'APPROVAL_NOT_PENDING', error: 'Approval is unavailable or already resolved' } };
  if (!approval.pendingRequest) {
    const run = await resumeWorkflow(await read(), id);
    if (run) await persist((draft) => draft);
    return { status: expired ? 410 : 200, body: { approval, ...(run ? { run } : {}) } };
  }
  if (approval.status !== 'approved') return { status: expired ? 410 : 200, body: { approval } };

  try {
    const result = await invoke(await read(), { ...approval.pendingRequest, approvalId: id });
    await persist((draft) => {
      const run = (draft.runs || []).find((item) => item.id === approval.pendingRequest.runId);
      if (!run || run.status !== 'waiting_for_approval') return draft;
      const step = run.steps.find((item) => item.id === approval.stepId) || run.steps.find((item) => item.status === 'waiting_for_approval');
      const succeeded = result.status === 200 && result.body?.ok;
      if (step) { step.status = succeeded ? 'completed' : 'failed'; step.result = result.body; step.completedAt = new Date().toISOString(); }
      run.toolCalls.push({ id: `tool-call-${crypto.randomUUID()}`, tool: approval.pendingRequest.toolId, status: succeeded ? 'completed' : 'failed', resultId: approval.pendingRequest.idempotencyKey });
      if (succeeded) {
        if (run.type !== 'chat') finishRun(run, { toolId: approval.pendingRequest.toolId, dispatch: result.body.data });
        else {
          transitionRun(run, 'running');
          process.emit('jarvis_resume_chat', run.id);
        }
      }
      else {
        if (run.type !== 'chat') errorRun(run, new Error(result.body?.error || 'Approved action failed'));
        else {
          transitionRun(run, 'running');
          process.emit('jarvis_resume_chat', run.id);
        }
      }
      if (run.type !== 'chat') chatOutcome(draft, run, approval, result.body, succeeded);
      return draft;
    });
    return { status: result.status, body: { approval, result: result.body } };
  } catch (error) {
    await persist((draft) => {
      const run = (draft.runs || []).find((item) => item.id === approval.pendingRequest.runId);
      if (run?.status === 'waiting_for_approval') {
        const step = run.steps.find((item) => item.id === approval.stepId) || run.steps.find((item) => item.status === 'waiting_for_approval');
        if (step) { step.status = 'failed'; step.error = error.message; step.completedAt = new Date().toISOString(); }
        if (run.type !== 'chat') {
          errorRun(run, error);
          chatOutcome(draft, run, approval, { code: error.code, error: error.message }, false);
        } else {
          transitionRun(run, 'running');
          process.emit('jarvis_resume_chat', run.id);
        }
      }
      return draft;
    });
    return { status: 502, body: { approval, code: error.code || 'APPROVED_ACTION_FAILED', error: error.message } };
  }
}
