#!/usr/bin/env node
import readline from 'node:readline';
import { executeTool } from './toolExecutor.js';
import { listTools } from './registry.js';

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try { request = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); continue; }
  let response;
  if (request.method === 'initialize') response = { jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'aegis-jarvis', version: '1.0.0' }, capabilities: { tools: {} } } };
  else if (request.method === 'tools/list') response = { jsonrpc: '2.0', id: request.id, result: { tools: listTools().map((tool) => ({ name: tool.id, description: tool.name, inputSchema: { type: 'object' } })) } };
  else if (request.method === 'tools/call') { try { const result = await executeTool(request.params?.name, request.params?.arguments || {}); response = { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result.data) }] } }; } catch (error) { response = { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } }; } }
  else response = { jsonrpc: '2.0', id: request.id ?? null, error: { code: -32601, message: 'Method not found' } };
  process.stdout.write(JSON.stringify(response) + '\n');
}
