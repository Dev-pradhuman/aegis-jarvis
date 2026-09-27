import crypto from 'node:crypto';
import { activityEntry, updateState } from './store.js';
import { getTool } from './registry.js';
import { validateToolInput } from './toolSchema.js';
import { executeTool } from './toolExecutor.js';
import { actionFingerprint, findToolReplay, rememberToolResult, reserveToolAction } from './idempotency.js';
import { mcpActionHash } from './mcpDiscovery.js';
import { messageActionHash } from './liveAdapters.js';
import { composioActionHash, composioToolRisk } from './composioAdapter.js';
import { osPlatform } from './platform/index.js';
import { windowError } from './platform/linux/windows.js';
import { approvalDecision } from './approvalPolicy.js';

const inFlight = new Map();

function approvalHash(toolId, args) {
  if (toolId === 'mcp.call') return mcpActionHash(args);
  if (toolId === 'messages.send') return messageActionHash(args);
  if (toolId === 'composio.execute') return composioActionHash(args);
  return actionFingerprint(toolId, args);
}

function approvalSummary(toolId, args, tool) {
  if (toolId === 'computer.keypress') return `Press ${args.keys} in ${args.target.appId} (${args.target.windowId})`;
  if (toolId === 'computer.type') return `Type "${args.text}" into ${args.target.appId} (${args.target.windowId})`;
  if (toolId === 'windows.close') return `Close ${args.target.appId} (${args.target.windowId})`;
  if (toolId === 'command.execute') return `Run exact command: ${args.command}`;
  if (toolId === 'messages.send') return `Send to ${args.recipient || args.destination || 'unspecified recipient'}: ${args.text || args.message}`;
  if (toolId === 'mcp.call') return `Call ${args.server}.${args.tool}`;
  return tool.description;
}

async function perform(state, request, dependencies = {}) {
  const persist = dependencies.persist || updateState;
  const execute = dependencies.execute || executeTool;
  const toolId = String(request.toolId || '');
  let args = request.input || {};
  const tool = getTool(toolId);
  if (!tool) return { status: 404, body: { code: 'TOOL_NOT_FOUND', error: 'Tool is unavailable' } };
  if (!tool.enabled) return { status: 503, body: { code: 'CAPABILITY_NOT_CONFIGURED', error: `${toolId} is not configured` } };
  try { validateToolInput(tool.inputSchema, args); }
  catch (error) { return { status: 400, body: { error: error.code, details: error.details } }; }
  if (toolId === 'messages.send' && !String(args.text || args.message || '').trim()) return { status: 400, body: { error: 'Message text is required' } };
  if (toolId === 'mcp.call' && (!args.server || !args.tool)) return { status: 400, body: { error: 'MCP server and tool are required' } };
  if ((toolId === 'computer.keypress' || toolId === 'computer.type') && !request.idempotencyKey) return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'Desktop input requires an idempotency key' } };
  let targetSensitive = false;
  if (toolId === 'computer.keypress' || toolId === 'computer.type' || toolId === 'windows.close') {
    const windows = (dependencies.platform || osPlatform).windows;
    try {
      if (!windows?.supported) throw windowError('WINDOW_OPERATION_UNSUPPORTED', 'Target-aware input requires a supported window backend');
      const resolved = args.target ? await windows.find(args.target) : await windows.getActive();
      if (!resolved) throw windowError('WINDOW_NOT_FOUND', 'No focused desktop window is available');
      targetSensitive = Boolean(resolved.sensitive);
      if (toolId !== 'windows.close' && !request.approvalId && args.target && (await windows.getActive())?.windowId !== resolved.windowId) await windows.focus({ windowId: resolved.windowId });
      args = { ...args, target: { windowId: resolved.windowId, appId: resolved.appId, ...(resolved.processId ? { processId: resolved.processId } : {}) } };
      validateToolInput(tool.inputSchema, args);
    } catch (error) { return { status: error.code === 'WINDOW_OPERATION_UNSUPPORTED' ? 503 : 409, body: { code: error.code || 'WINDOW_NOT_FOUND', error: error.message } }; }
  }
  const replay = findToolReplay(state, request.idempotencyKey, toolId, args, request.runId || null);
  if (replay) return replay.state === 'in_progress' ? { status: 409, body: { code: 'ACTION_OUTCOME_UNKNOWN', error: 'Action was started; verify its outcome before retrying' } } : { status: 200, body: { ...replay.result, replayed: true, idempotencyKey: replay.idempotencyKey } };

  const runId = request.runId || null;
  const intrinsicApproval = tool.requiresApproval && !(toolId === 'composio.execute' && composioToolRisk(args.toolSlug) === 'READ_ONLY');
  const decision = approvalDecision(state, { ...tool, requiresApproval: intrinsicApproval }, args, request);
  if (decision.action === 'DENY') return { status: 403, body: { code: 'APPROVAL_POLICY_DENIED', error: 'A custom approval rule denies this action' } };
  const approvalRequired = Boolean(request.approvalId) || decision.action === 'ASK' || intrinsicApproval && decision.action === 'AUTO';
  const hash = approvalHash(toolId, args);
  let approval = request.approvalId ? (state.approvals || []).find((item) => item.id === request.approvalId) : null;
  if (intrinsicApproval && decision.action === 'AUTO' && !approval) {
    if (tool.sideEffects && !request.idempotencyKey) return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'Automatically approved actions require an idempotency key' } };
    let ruleClaimed = true;
    const automatic = { id: `approval-${crypto.randomUUID()}`, status: 'approved', toolName: toolId, actionHash: hash, runId, stepId: request.stepId || null,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), consumedAt: null,
      automatic: true, policyMode: decision.reason, ruleId: decision.ruleId };
    await persist((draft) => {
      if (decision.reason === 'allow_once') {
        const index = (draft.approvalPolicy?.rules || []).findIndex((rule) => rule.id === decision.ruleId);
        if (index < 0) { ruleClaimed = false; return draft; }
        draft.approvalPolicy.rules.splice(index, 1);
      }
      draft.approvals ??= []; draft.approvals.unshift(automatic);
      draft.activity = [activityEntry('approval.auto', toolId, { approvalId: automatic.id, runId, mode: decision.reason }), ...(draft.activity || [])].slice(0, 200);
      return draft;
    });
    if (!ruleClaimed) return { status: 409, body: { code: 'APPROVAL_RULE_USED', error: 'One-use approval rule has already been consumed' } };
    approval = automatic;
  }
  const approvalForExecution = approval ? { ...approval } : null;
  if (approvalRequired && !approval) {
    const pending = {
      id: `approval-${crypto.randomUUID()}`, icon: 'shield', risk: 'high',
      title: `Approve ${tool.name}`, sub: approvalSummary(toolId, args, tool) + (targetSensitive ? ' — sensitive window; check the destination carefully' : ''), status: 'pending',
      toolName: toolId, actionHash: hash, runId, stepId: request.stepId || null,
      ...(request.resumeOnApproval || !runId ? { pendingRequest: { toolId, input: args, runId, ...(request.stepId ? { stepId: request.stepId } : {}), idempotencyKey: request.idempotencyKey || `approval:${request.stepId || toolId}:${crypto.randomUUID()}` } } : {}),
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), consumedAt: null,
    };
    await persist((draft) => { draft.approvals ??= []; draft.approvals.unshift(pending); draft.activity = [activityEntry('approval.requested', pending.title, { approvalId: pending.id }), ...(draft.activity || [])].slice(0, 200); return draft; });
    return { status: 202, body: { approvalRequired: true, approval: pending } };
  }
  if (approvalRequired) {
    let claimed = false;
    await persist((draft) => {
      const current = (draft.approvals || []).find((item) => item.id === approval.id);
      if (current?.status === 'approved' && current.toolName === toolId && current.actionHash === hash &&
          (current.runId || null) === runId && (current.stepId || null) === (request.stepId || null) && !current.consumedAt && Date.parse(current.expiresAt || 0) > Date.now()) {
        current.status = 'consumed'; current.consumedAt = new Date().toISOString(); claimed = true;
      }
      return draft;
    });
    if (!claimed) return { status: 403, body: { error: 'A current approval bound to this exact action is required' } };
  }
  if (tool.sideEffects && request.idempotencyKey) await persist((draft) => { reserveToolAction(draft, { idempotencyKey: request.idempotencyKey, runId, toolId, input: args }); return draft; });
  const result = await execute(toolId, args, { state, runId, approval: approvalForExecution, platform: dependencies.platform });
  await persist((draft) => {
    rememberToolResult(draft, { idempotencyKey: request.idempotencyKey, runId, toolId, input: args, result });
    draft.activity = [activityEntry('tool.executed', toolId, { toolId, runId }), ...(draft.activity || [])].slice(0, 200);
    return draft;
  });
  return { status: 200, body: result };
}

export async function invokeToolRequest(state, request, dependencies = {}) {
  const key = request.idempotencyKey;
  if (!key) return perform(state, request, dependencies);
  const fingerprint = actionFingerprint(request.toolId, { input: request.input || {}, runId: request.runId || null });
  const existing = inFlight.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) return { status: 409, body: { error: 'IDEMPOTENCY_CONFLICT' } };
    const result = await existing.promise;
    return { ...result, body: { ...result.body, replayed: true } };
  }
  const promise = perform(state, request, dependencies);
  inFlight.set(key, { fingerprint, promise });
  try { return await promise; }
  finally { inFlight.delete(key); }
}
