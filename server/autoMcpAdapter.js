import { spawn } from 'node:child_process';
import { ToolRuntimeError } from './toolErrors.js';

const DEFAULT_TIMEOUT_MS = 15000;
let cachedTools = [];
let lastSync = null;
let lastError = null;
let testClient = null;
let stdioSession = null;
let nextRequestId = 1;
const pending = new Map();

function csv(value = '') {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function enabled() {
  return String(process.env.AUTO_MCP_ENABLED || '').toLowerCase() === 'true';
}

function timeoutMs() {
  const parsed = Number(process.env.AUTO_MCP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.max(1000, Math.trunc(parsed)) : DEFAULT_TIMEOUT_MS;
}

function transport() {
  return String(process.env.AUTO_MCP_TRANSPORT || 'stdio').toLowerCase();
}

function namespacedName(name = '') {
  return `auto_mcp.${String(name).trim().replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function jsonSchema(schema) {
  if (schema && typeof schema === 'object') return schema;
  return { type: 'object', properties: {}, additionalProperties: true };
}

export function classifyAutoMcpRisk(tool = {}) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  if (/\b(delete|remove|destroy|revoke|payment|pay|purchase|security|password|token|archive|unsubscribe)\b/.test(text)) return 'DESTRUCTIVE';
  if (/\b(send|post|send.?email|message|dm|invite|share|upload|publish|reply|react)\b/.test(text)) return 'EXTERNAL_ACTION';
  if (/\b(create|update|edit|write|draft|schedule|set|add)\b/.test(text)) return 'PROJECT_WRITE';
  if (/\b(read|list|search|get|fetch|find|lookup|status|history)\b/.test(text)) return 'READ_ONLY';
  return 'PROJECT_WRITE';
}

function moduleForTool(tool = {}) {
  const text = `${tool.name || ''} ${tool.description || ''}`.toLowerCase();
  if (/\b(gmail|email|mail|message|discord|slack|whatsapp|instagram|dm|sms)\b/.test(text)) return 'communication';
  if (/\b(calendar|event|meeting|availability|reminder)\b/.test(text)) return 'calendar';
  if (/\b(browser|tab|webpage|url|youtube)\b/.test(text)) return 'browser';
  if (/\b(file|folder|drive|document|pdf|sheet)\b/.test(text)) return 'files';
  if (/\b(github|git|repo|issue|pull request|terminal|command)\b/.test(text)) return 'development';
  if (/\b(memory|note|obsidian)\b/.test(text)) return 'memory';
  return 'integrations';
}

function allowedByConfig(originalName, id) {
  const allowed = new Set(csv(process.env.AUTO_MCP_ALLOWED_TOOLS));
  const blocked = new Set(csv(process.env.AUTO_MCP_BLOCKED_TOOLS));
  if (blocked.has(originalName) || blocked.has(id)) return false;
  if (allowed.size && !allowed.has(originalName) && !allowed.has(id)) return false;
  return true;
}

export function normalizeAutoMcpTool(tool = {}) {
  const originalName = String(tool.name || tool.id || '').trim();
  if (!originalName) return null;
  const id = namespacedName(originalName);
  if (!allowedByConfig(originalName, id)) return null;
  const riskLevel = classifyAutoMcpRisk(tool);
  return {
    id,
    name: tool.title || tool.name || id,
    description: tool.description || `Auto MCP tool ${originalName}`,
    module: moduleForTool(tool),
    provider: 'auto_mcp',
    originalMcpName: originalName,
    riskLevel,
    sideEffects: riskLevel !== 'READ_ONLY',
    reversible: !['DESTRUCTIVE', 'EXTERNAL_ACTION'].includes(riskLevel),
    timeout: timeoutMs(),
    enabled: enabled(),
    availability: 'auto-mcp',
    configurationRequirements: ['AUTO_MCP_ENABLED=true', transport() === 'stdio' ? 'AUTO_MCP_COMMAND' : 'AUTO_MCP_URL'],
    requiresApproval: riskLevel !== 'READ_ONLY',
    exposeMcp: riskLevel === 'READ_ONLY',
    handler: 'auto_mcp.execute',
    verifier: 'auto_mcp.result',
    retry: { maxAttempts: 1, retryOn: ['TIMEOUT', 'CONNECTION_UNAVAILABLE'] },
    inputSchema: jsonSchema(tool.inputSchema || tool.input_schema),
    outputSchema: { type: 'object', properties: {}, additionalProperties: true },
    autoMcp: { originalName, transport: transport() },
  };
}

function parseMessages(buffer, onMessage) {
  let remaining = buffer;
  for (;;) {
    const headerEnd = remaining.indexOf('\r\n\r\n');
    if (headerEnd < 0) return remaining;
    const header = remaining.slice(0, headerEnd);
    const match = header.match(/content-length:\s*(\d+)/i);
    if (!match) return '';
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (remaining.length < start + length) return remaining;
    const body = remaining.slice(start, start + length);
    remaining = remaining.slice(start + length);
    onMessage(JSON.parse(body));
  }
}

async function stdioRequest(method, params = {}) {
  const command = String(process.env.AUTO_MCP_COMMAND || '').trim();
  if (!command) throw new ToolRuntimeError('CONFIGURATION_MISSING', 'AUTO_MCP_COMMAND is required for Auto MCP stdio transport');
  if (!stdioSession) {
    const args = csv(process.env.AUTO_MCP_ARGS);
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      try {
        buffer = parseMessages(buffer + chunk.toString('utf8'), (message) => {
          const request = pending.get(message.id);
          if (!request) return;
          pending.delete(message.id);
          if (message.error) request.reject(new ToolRuntimeError('PROVIDER_ERROR', message.error.message || 'Auto MCP returned an error', { details: message.error }));
          else request.resolve(message.result);
        });
      } catch (error) {
        for (const request of pending.values()) request.reject(error);
        pending.clear();
      }
    });
    child.on('exit', () => {
      stdioSession = null;
      for (const request of pending.values()) request.reject(new ToolRuntimeError('CONNECTION_UNAVAILABLE', 'Auto MCP stdio process exited'));
      pending.clear();
    });
    stdioSession = child;
    await stdioRequest('initialize', { protocolVersion: '2025-03-26', clientInfo: { name: 'aegis-jarvis', version: '1.1.0' }, capabilities: {} });
    stdioWrite({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  }
  const id = nextRequestId++;
  const request = { jsonrpc: '2.0', id, method, params };
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new ToolRuntimeError('TIMEOUT', `Auto MCP ${method} timed out`, { retryable: true })); }, timeoutMs());
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    stdioWrite(request);
  });
}

function stdioWrite(message) {
  const body = JSON.stringify(message);
  stdioSession.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

async function httpRequest(method, params = {}) {
  const url = String(process.env.AUTO_MCP_URL || '').trim();
  if (!url) throw new ToolRuntimeError('CONFIGURATION_MISSING', 'AUTO_MCP_URL is required for Auto MCP HTTP transport');
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: nextRequestId++, method, params }) });
  if (!response.ok) throw new ToolRuntimeError('CONNECTION_UNAVAILABLE', `Auto MCP HTTP returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new ToolRuntimeError('PROVIDER_ERROR', payload.error.message || 'Auto MCP returned an error', { details: payload.error });
  return payload.result;
}

async function request(method, params = {}) {
  if (testClient) return await testClient.request(method, params);
  return transport() === 'http' ? await httpRequest(method, params) : await stdioRequest(method, params);
}

export async function refreshAutoMcpTools() {
  if (!enabled()) {
    cachedTools = [];
    lastSync = new Date().toISOString();
    lastError = null;
    return { enabled: false, tools: [], toolCount: 0 };
  }
  try {
    const result = await request('tools/list', {});
    cachedTools = (result.tools || []).map(normalizeAutoMcpTool).filter(Boolean);
    lastSync = new Date().toISOString();
    lastError = null;
    return { enabled: true, tools: cachedTools, toolCount: cachedTools.length, lastSync };
  } catch (error) {
    lastError = { code: error.code || 'CONNECTION_UNAVAILABLE', message: error.message || 'Auto MCP discovery failed' };
    cachedTools = [];
    return { enabled: true, tools: [], toolCount: 0, lastError };
  }
}

export function listAutoMcpToolDefinitions() {
  return cachedTools.map((tool) => ({ ...tool }));
}

export function autoMcpStatus() {
  return { enabled: enabled(), transport: transport(), connected: enabled() && cachedTools.length > 0 && !lastError, toolCount: cachedTools.length, lastSync, lastError };
}

export async function executeAutoMcpTool(definition, args = {}) {
  if (!enabled()) throw new ToolRuntimeError('CONFIGURATION_MISSING', 'Auto MCP is disabled. Set AUTO_MCP_ENABLED=true.');
  const originalName = definition.originalMcpName || definition.autoMcp?.originalName;
  if (!originalName) throw new ToolRuntimeError('INVALID_ARGUMENTS', 'Auto MCP original tool name is missing');
  const result = await request('tools/call', { name: originalName, arguments: args });
  return { success: true, provider: 'auto_mcp', tool: originalName, result };
}

export function __setAutoMcpTestClient(client) {
  testClient = client;
}

export function __resetAutoMcpForTests() {
  testClient = null;
  cachedTools = [];
  lastSync = null;
  lastError = null;
  if (stdioSession) stdioSession.kill();
  stdioSession = null;
  pending.clear();
}
