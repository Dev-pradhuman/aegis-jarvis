import assert from 'node:assert/strict';
import test from 'node:test';
import { executeToolCall } from '../server/toolExecutor.js';
import { selectRelevantTools } from '../server/toolFilter.js';
import { listTools, getToolDefinition } from '../server/registry.js';
import { createExactApproval } from '../server/policy.js';
import { __resetAutoMcpForTests, __setAutoMcpTestClient, classifyAutoMcpRisk, refreshAutoMcpTools } from '../server/autoMcpAdapter.js';

const state = () => ({ tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} });
const env = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
}

test.afterEach(() => { __resetAutoMcpForTests(); restoreEnv(); });

test('Auto MCP disabled imports no tools and status is readable', async () => {
  delete process.env.AUTO_MCP_ENABLED;
  const result = await refreshAutoMcpTools();
  assert.equal(result.enabled, false);
  assert.equal(listTools().some((tool) => tool.id.startsWith('auto_mcp.gmail')), false);
  const status = await executeToolCall({ toolName: 'auto_mcp.status', arguments: {} }, { state: state() });
  assert.equal(status.status, 'completed');
  assert.equal(status.output.enabled, false);
});

test('Auto MCP discovery normalizes schemas and namespaces tools', async () => {
  process.env.AUTO_MCP_ENABLED = 'true';
  __setAutoMcpTestClient({ request: async () => ({ tools: [{ name: 'gmail.search', description: 'Search Gmail messages', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } }] }) });
  const result = await refreshAutoMcpTools();
  assert.equal(result.toolCount, 1);
  const def = getToolDefinition('auto_mcp.gmail.search');
  assert.equal(def.provider, 'auto_mcp');
  assert.equal(def.module, 'communication');
  assert.equal(def.inputSchema.required[0], 'query');
  assert.equal(def.riskLevel, 'READ_ONLY');
});

test('Auto MCP risk mapping is conservative', () => {
  assert.equal(classifyAutoMcpRisk({ name: 'gmail.search', description: 'Search email' }), 'READ_ONLY');
  assert.equal(classifyAutoMcpRisk({ name: 'discord.send_message', description: 'Send a message' }), 'EXTERNAL_ACTION');
  assert.equal(classifyAutoMcpRisk({ name: 'calendar.create_event', description: 'Create calendar event' }), 'PROJECT_WRITE');
  assert.equal(classifyAutoMcpRisk({ name: 'drive.delete_file', description: 'Delete a file' }), 'DESTRUCTIVE');
  assert.equal(classifyAutoMcpRisk({ name: 'mystery.tool', description: 'Do a thing' }), 'PROJECT_WRITE');
});

test('Auto MCP allowed and blocked filters are applied during import', async () => {
  process.env.AUTO_MCP_ENABLED = 'true';
  process.env.AUTO_MCP_ALLOWED_TOOLS = 'gmail.search,discord.send_message';
  process.env.AUTO_MCP_BLOCKED_TOOLS = 'discord.send_message';
  __setAutoMcpTestClient({ request: async () => ({ tools: [{ name: 'gmail.search', description: 'Search Gmail' }, { name: 'discord.send_message', description: 'Send Discord message' }, { name: 'calendar.list', description: 'List calendar events' }] }) });
  await refreshAutoMcpTools();
  assert.ok(getToolDefinition('auto_mcp.gmail.search'));
  assert.equal(getToolDefinition('auto_mcp.discord.send_message'), null);
  assert.equal(getToolDefinition('auto_mcp.calendar.list'), null);
});

test('canonical executor invokes Auto MCP read tool and records a verified run', async () => {
  process.env.AUTO_MCP_ENABLED = 'true';
  const calls = [];
  __setAutoMcpTestClient({ request: async (method, params) => {
    calls.push({ method, params });
    if (method === 'tools/list') return { tools: [{ name: 'gmail.search', description: 'Search Gmail', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } }] };
    return { content: [{ type: 'text', text: 'ok' }], structuredContent: { messages: [] } };
  } });
  await refreshAutoMcpTools();
  const current = state();
  const result = await executeToolCall({ toolName: 'auto_mcp.gmail.search', arguments: { query: 'from:arjun' } }, { state: current });
  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'auto_mcp');
  assert.equal(result.verified, true);
  assert.equal(calls.at(-1).method, 'tools/call');
  assert.equal(current.runs[0].toolCalls[0].provider, 'auto_mcp');
});

test('Auto MCP side-effect tools require exact approval and execute once', async () => {
  process.env.AUTO_MCP_ENABLED = 'true';
  let executions = 0;
  __setAutoMcpTestClient({ request: async (method) => {
    if (method === 'tools/list') return { tools: [{ name: 'discord.send_message', description: 'Send Discord message', inputSchema: { type: 'object', properties: { channel: { type: 'string' }, message: { type: 'string' } }, required: ['channel', 'message'], additionalProperties: false } }] };
    executions += 1;
    return { ok: true, messageId: 'm1' };
  } });
  await refreshAutoMcpTools();
  const args = { channel: 'c1', message: 'hello' };
  const current = state();
  const waiting = await executeToolCall({ toolName: 'auto_mcp.discord.send_message', arguments: args, idempotencyKey: 'auto-mcp-send-1' }, { state: current });
  assert.equal(waiting.status, 'waiting_for_approval');
  const rejected = createExactApproval({ toolName: 'auto_mcp.discord.send_message', input: args, runId: waiting.runId, stepId: waiting.stepId, toolCallId: waiting.toolCallId });
  rejected.status = 'rejected';
  const denied = await executeToolCall({ toolName: 'auto_mcp.discord.send_message', arguments: args, approvalId: rejected.id }, { state: { ...current, approvals: [rejected, ...current.approvals] } });
  assert.equal(denied.status, 'failed');
  assert.equal(executions, 0);
  current.approvals[0].status = 'approved';
  const sent = await executeToolCall({ toolName: 'auto_mcp.discord.send_message', arguments: args, approvalId: current.approvals[0].id, idempotencyKey: 'auto-mcp-send-1' }, { state: current });
  assert.equal(sent.status, 'completed');
  const replay = await executeToolCall({ toolName: 'auto_mcp.discord.send_message', arguments: args, idempotencyKey: 'auto-mcp-send-1' }, { state: current });
  assert.equal(replay.replayed, true);
  assert.equal(executions, 1);
});

test('capability resolver exposes relevant Auto MCP tools instead of Available tools empty', async () => {
  process.env.AUTO_MCP_ENABLED = 'true';
  __setAutoMcpTestClient({ request: async () => ({ tools: [{ name: 'gmail.search', description: 'Search Gmail messages' }, { name: 'discord.send_message', description: 'Send Discord messages' }] }) });
  await refreshAutoMcpTools();
  const selected = selectRelevantTools('any new mail for me?', listTools({ includeDisabled: false })).tools;
  assert.ok(selected.some((tool) => tool.id === 'auto_mcp.gmail.search'));
});
