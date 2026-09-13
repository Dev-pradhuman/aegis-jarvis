import { listMcpTools } from './registry.js';
import { executeToolCall } from './toolExecutor.js';

const response = (id, result) => ({ jsonrpc: '2.0', id, result });
const error = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

export async function handleMcpRequest(request = {}, context = {}) {
  const id = request.id ?? null;
  if (request.method === 'initialize') return response(id, { protocolVersion: '2025-03-26', serverInfo: { name: 'aegis-jarvis', version: '1.1.0' }, capabilities: { tools: { listChanged: false } } });
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'tools/list') return response(id, { tools: listMcpTools() });
  if (request.method !== 'tools/call') return error(id, -32601, 'Method not found');
  const name = request.params?.name;
  if (!listMcpTools().some((tool) => tool.name === name)) return error(id, -32602, `Tool is not exposed over MCP: ${name || '(missing)'}`);
  const meta = request.params?._meta || {};
  const permissionContext = context.permissionContext || { allowedRiskLevels: ['READ_ONLY', 'LOW_RISK_WRITE'] };
  const result = await (context.execute || executeToolCall)({ id: meta.toolCallId, toolName: name, arguments: request.params?.arguments || {}, source: 'mcp', runId: meta.runId, stepId: meta.stepId, approvalId: meta.approvalId, requestedBy: meta.requestedBy || 'mcp-client', idempotencyKey: meta.idempotencyKey, permissionContext }, { state: context.state, request: `MCP tool call: ${name}`, requestedBy: meta.requestedBy || 'mcp-client', permissionContext });
  if (result.status !== 'completed') return response(id, { content: [{ type: 'text', text: JSON.stringify({ status: result.status, error: result.error, approval: result.approval ? { id: result.approval.id, expiresAt: result.approval.expiresAt } : null, runId: result.runId, toolCallId: result.toolCallId }) }], isError: true, structuredContent: result });
  return response(id, { content: [{ type: 'text', text: JSON.stringify(result.output) }], isError: false, structuredContent: result });
}
