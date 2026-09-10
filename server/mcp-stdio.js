#!/usr/bin/env node
import readline from 'node:readline';
import { getState, updateState } from './store.js';
import { handleMcpRequest } from './mcpAdapter.js';

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try { request = JSON.parse(line); }
  catch { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`); continue; }
  try {
    let response;
    if (request.method === 'tools/call') await updateState(async (state) => { response = await handleMcpRequest(request, { state }); return state; });
    else response = await handleMcpRequest(request, { state: await getState() });
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, error: { code: -32603, message: error.message } })}\n`);
  }
}
