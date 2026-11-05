#!/usr/bin/env node
import readline from 'node:readline';

const JARVIS_URL = process.env.JARVIS_URL || 'http://127.0.0.1:8787';

function normalizeToolName(rawName) {
  if (!rawName) return '';
  let name = String(rawName).trim();
  if (name.startsWith('jarvis_')) name = name.slice(7);
  else if (name.startsWith('jarvis.')) name = name.slice(7);
  return name;
}

async function fetchToolsFromDaemon() {
  try {
    const res = await fetch(`${JARVIS_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': JARVIS_URL
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'tools-list', method: 'tools/list' }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.result?.tools) return data.result.tools;
    }
  } catch {}

  // Fallback to internal registry
  try {
    const { listTools } = await import('../server/registry.js');
    const { unattendedTools } = await import('../server/toolPolicy.js');
    const tools = unattendedTools ? unattendedTools() : listTools();
    return tools.map((t) => ({
      name: t.id,
      description: t.description || `JARVIS ${t.id} tool`,
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }));
  } catch (err) {
    return [];
  }
}

async function executeToolViaDaemon(toolName, args = {}) {
  let normalized = normalizeToolName(toolName);
  // Convert underscore names (e.g. audio_get_volume -> audio.get_volume, screen_describe -> screen.describe)
  if (!normalized.includes('.') && normalized.includes('_')) {
    normalized = normalized.replace('_', '.');
  }

  // Try HTTP endpoint first
  try {
    const res = await fetch(`${JARVIS_URL}/api/tools/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': JARVIS_URL
      },
      body: JSON.stringify({ toolId: normalized, input: args }),
      signal: AbortSignal.timeout(30000)
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok !== false) {
      return body.data !== undefined ? body.data : body;
    }
    throw new Error(body.error || body.detail || body.code || 'Tool execution failed');
  } catch (httpErr) {
    // If daemon is not responding, fallback to direct in-process invocation
    try {
      const { invokeToolRequest } = await import('../server/toolRuntime.js');
      const { getState } = await import('../server/store.js');
      const state = await getState();
      const direct = await invokeToolRequest(state, { toolId: normalized, input: args });
      if (direct.status === 200 && direct.body?.ok !== false) {
        return direct.body.data !== undefined ? direct.body.data : direct.body;
      }
      throw new Error(direct.body?.error || direct.body?.code || httpErr.message);
    } catch {
      throw httpErr;
    }
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    continue;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'jarvis-mcp',
          version: '1.0.0'
        },
        capabilities: {
          tools: {}
        }
      }
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  } else if (method === 'notifications/initialized') {
    // Client notification: no response needed
  } else if (method === 'tools/list') {
    const rawTools = await fetchToolsFromDaemon();
    // Expose both original name (e.g. audio.get_volume) and underscore alias (audio_get_volume)
    const tools = [];
    const seen = new Set();
    for (const t of rawTools) {
      if (!seen.has(t.name)) {
        seen.add(t.name);
        tools.push(t);
      }
      const underName = t.name.replace(/\./g, '_');
      if (underName !== t.name && !seen.has(underName)) {
        seen.add(underName);
        tools.push({
          ...t,
          name: underName
        });
      }
    }
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: { tools }
    }) + '\n');
  } else if (method === 'tools/call') {
    try {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const data = await executeToolViaDaemon(toolName, args);
      const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text }],
          isError: false
        }
      }) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        }
      }) + '\n');
    }
  } else {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32601, message: 'Method not found' }
    }) + '\n');
  }
}
