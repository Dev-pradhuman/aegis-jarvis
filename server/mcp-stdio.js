#!/usr/bin/env node
import readline from 'node:readline';
import { invokeToolRequest } from './toolRuntime.js';
import { unattendedTool, unattendedTools } from './toolPolicy.js';
import { getState } from './store.js';

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try { request = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); continue; }
  let response;
  if (request.method === 'initialize') response = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'aegis-jarvis', version: '1.0.0' }, capabilities: { tools: {} } } };
  else if (request.method === 'tools/list') response = { jsonrpc: '2.0', id: request.id, result: { tools: unattendedTools().map((tool) => ({ name: tool.id, description: tool.description, inputSchema: tool.inputSchema })) } };
  else if (request.method === 'tools/call') { try { if (!unattendedTool(request.params?.name)) throw new Error('Tool requires the authenticated JARVIS runtime'); const result = await invokeToolRequest(await getState(), { toolId: request.params.name, input: request.params?.arguments || {} }); if (result.status !== 200 || !result.body?.ok) throw new Error(result.body?.error || result.body?.code || 'Tool call failed'); response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result.body.data) }] } }; } catch (error) { response = { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } }; } }
  else response = { jsonrpc: '2.0', id: request.id ?? null, error: { code: -32601, message: 'Method not found' } };
  process.stdout.write(JSON.stringify(response) + '\n');
}
