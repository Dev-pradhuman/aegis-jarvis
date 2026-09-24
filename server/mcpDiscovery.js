import crypto from 'node:crypto';

function configuredServers(raw = process.env.JARVIS_MCP_SERVERS) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected an array');
    return parsed.filter((item) => item && typeof item.name === 'string' && /^https?:\/\//.test(item.url || '')).slice(0, 20);
  } catch { return [{ name: 'configuration', configurationError: 'JARVIS_MCP_SERVERS must be a JSON array of {name,url,tokenEnv?}' }]; }
}

async function rpc(server, method, params, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const token = server.tokenEnv ? process.env[server.tokenEnv] : null;
    const response = await fetchImpl(server.url, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) throw new Error('SSE MCP transport is not yet supported');
    const result = await response.json();
    if (result.error) throw new Error(String(result.error.message || 'MCP error'));
    return result.result || {};
  } finally { clearTimeout(timer); }
}

export async function discoverMcpServers({ fetchImpl = fetch, raw } = {}) {
  return Promise.all(configuredServers(raw).map(async (server) => {
    if (server.configurationError) return { name: server.name, status: 'configuration_error', error: server.configurationError, tools: [] };
    const base = { name: server.name, url: server.url, transport: 'http-jsonrpc' };
    try {
      const init = await rpc(server, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'aegis-jarvis', version: '1.0.0' } }, fetchImpl);
      const listed = await rpc(server, 'tools/list', {}, fetchImpl);
      return { ...base, status: 'connected', serverInfo: init.serverInfo || null, tools: (Array.isArray(listed.tools) ? listed.tools : []).slice(0, 100).filter((tool) => typeof tool.name === 'string').map((tool) => ({ name: tool.name, description: tool.description || '', inputSchema: tool.inputSchema || { type: 'object' }, provenance: server.name })) };
    } catch (error) { return { ...base, status: 'unavailable', error: error.name === 'AbortError' ? 'Timed out after 5 seconds' : error.message, tools: [] }; }
  }));
}

export function mcpActionHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify([input.server, input.tool, input.arguments || {}])).digest('hex');
}

export async function callMcpTool(input, { fetchImpl = fetch, raw } = {}) {
  const server = configuredServers(raw).find((item) => item.name === input.server && item.url);
  if (!server) throw Object.assign(new Error('MCP server is not configured'), { code: 'MCP_SERVER_UNAVAILABLE' });
  const name = String(input.tool || '');
  const listed = await rpc(server, 'tools/list', {}, fetchImpl);
  if (!(listed.tools || []).some((tool) => tool.name === name)) throw Object.assign(new Error('MCP tool is not advertised by this server'), { code: 'MCP_TOOL_UNKNOWN' });
  const result = await rpc(server, 'tools/call', { name, arguments: input.arguments || {} }, fetchImpl);
  return { server: server.name, tool: name, content: result.content || [], isError: Boolean(result.isError) };
}
