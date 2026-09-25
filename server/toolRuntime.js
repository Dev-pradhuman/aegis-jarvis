import crypto from 'node:crypto';
import { activityEntry, updateState } from './store.js';
import { getTool } from './registry.js';
import { validateToolInput } from './toolSchema.js';
import { executeTool } from './toolExecutor.js';
import { actionFingerprint, findToolReplay, rememberToolResult, reserveToolAction } from './idempotency.js';
import { mcpActionHash } from './mcpDiscovery.js';
import { messageActionHash } from './liveAdapters.js';
import { composioActionHash, composioToolRisk } from './composioAdapter.js';

const inFlight = new Map();

function approvalHash(toolId, args) {
  if (toolId === 'mcp.call') return mcpActionHash(args);
  if (toolId === 'messages.send') return messageActionHash(args);
  if (toolId === 'composio.execute') return composioActionHash(args);
  return actionFingerprint(toolId, args);
}

async function perform(state, request, dependencies = {}) {
  const persist = dependencies.persist || updateState;
  const execute = dependencies.execute || executeTool;
  const toolId = String(request.toolId || '');
  const args = request.input || {};
  const tool = getTool(toolId);
  if (!tool) return { status: 404, body: { code: 'TOOL_NOT_FOUND', error: 'Tool is unavailable' } };
  if (!tool.enabled) return { status: 503, body: { code: 'CAPABILITY_NOT_CONFIGURED', error: `${toolId} is not configured` } };
  try { validateToolInput(tool.inputSchema, args); }
  catch (error) { return { status: 400, body: { error: error.code, details: error.details } }; }
  if (toolId === 'messages.send' && !String(args.text || args.message || '').trim()) return { status: 400, body: { error: 'Message text is required' } };
  if (toolId === 'mcp.call' && (!args.server || !args.tool)) return { status: 400, body: { error: 'MCP server and tool are required' } };
  if ((toolId === 'computer.keypress' || toolId === 'computer.type') && !request.idempotencyKey) return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: 'Desktop input requires an idempotency key' } };
  const replay = findToolReplay(state, request.idempotencyKey, toolId, args, request.runId || null);
  if (replay) return replay.state === 'in_progress' ? { status: 409, body: { code: 'ACTION_OUTCOME_UNKNOWN', error: 'Action was started; verify its outcome before retrying' } } : { status: 200, body: { ...replay.result, replayed: true, idempotencyKey: replay.idempotencyKey } };

  const runId = request.runId || null;
  const approvalRequired = tool.requiresApproval && !(toolId === 'composio.execute' && composioToolRisk(args.toolSlug) === 'READ_ONLY');
  const hash = approvalHash(toolId, args);
  const approval = request.approvalId ? (state.approvals || []).find((item) => item.id === request.approvalId) : null;
  const approvalForExecution = approval ? { ...approval } : null;
  if (approvalRequired && !approval) {
    const pending = {
      id: `approval-${crypto.randomUUID()}`, icon: 'shield', risk: 'high',
      title: `Approve ${tool.name}`, sub: toolId === 'computer.keypress' ? `Keys: ${args.keys}` : toolId === 'computer.type' ? `Type into the currently focused desktop application: ${args.text}` : tool.description, status: 'pending',
      toolName: toolId, actionHash: hash, runId,
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
          (current.runId || null) === runId && !current.consumedAt && Date.parse(current.expiresAt || 0) > Date.now()) {
        current.status = 'consumed'; current.consumedAt = new Date().toISOString(); claimed = true;
      }
      return draft;
    });
    if (!claimed) return { status: 403, body: { error: 'A current approval bound to this exact action is required' } };
  }
  if (tool.sideEffects && request.idempotencyKey) await persist((draft) => { reserveToolAction(draft, { idempotencyKey: request.idempotencyKey, runId, toolId, input: args }); return draft; });
  const result = await execute(toolId, args, { state, runId, approval: approvalForExecution });
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
