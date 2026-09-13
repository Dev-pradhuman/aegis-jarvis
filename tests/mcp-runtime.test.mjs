import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpRequest } from '../server/mcpAdapter.js';

const state = () => ({ tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} });

test('MCP schemas are generated from canonical definitions', async () => {
  const reply = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { state: state() });
  const read = reply.result.tools.find((tool) => tool.name === 'files.read');
  assert.ok(read);
  assert.equal(read.inputSchema.type, 'object');
  assert.deepEqual(read.inputSchema.required, ['path']);
  assert.equal(reply.result.tools.some((tool) => tool.name === 'command.execute'), false);
});

test('MCP tool calls invoke the canonical executor and persist a verified Run', async () => {
  const current = state();
  const reply = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'tasks.create', arguments: { title: 'Created through MCP' } } }, { state: current });
  assert.equal(reply.result.isError, false);
  assert.equal(reply.result.structuredContent.status, 'completed');
  assert.equal(reply.result.structuredContent.verified, true);
  assert.equal(current.tasks[0].title, 'Created through MCP');
  assert.equal(current.runs[0].toolCalls[0].source, 'mcp');
});

test('MCP permission profile denies external actions even when a connector is configured', async () => {
  const prior = process.env.COMPOSIO_API_KEY; process.env.COMPOSIO_API_KEY = 'ak_test';
  const reply = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'composio.execute', arguments: { toolSlug: 'GMAIL_SEND_EMAIL', arguments: { recipient_email: 'nobody@example.com' } } } }, { state: state() });
  assert.equal(reply.result.isError, true);
  assert.equal(reply.result.structuredContent.error.code, 'PERMISSION_DENIED');
  if (prior === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = prior;
});

test('MCP rejects tools that are not explicitly exposed', async () => {
  const reply = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'command.execute', arguments: { command: 'node --version' } } }, { state: state() });
  assert.equal(reply.error.code, -32602);
});
