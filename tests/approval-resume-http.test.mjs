import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRun } from '../server/runEngine.js';
import { executeModelToolLoop } from '../server/modelToolLoop.js';

test('HTTP approval executes a real local command, continues via provider protocol, and persists final response', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jarvis-approval-http-'));
  let providerCalls = 0; let child;
  // Controlled provider fixture: validates protocol, not real provider authentication.
  const provider = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); providerCalls++;
    const confirmed = body.messages.findLast((message) => message.role === 'tool');
    const valid = confirmed && JSON.parse(confirmed.content).verified === true;
    res.writeHead(valid ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(valid ? { choices: [{ message: { content: 'The Node version was verified.' } }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } } : { error: { message: 'Verified result missing' } }));
  });
  try {
    provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
    const run = createRun({ type: 'chat', request: 'Execute command node --version' });
    const state = { schemaVersion: 2, runs: [run], tasks: [], workflows: [], memories: [], approvals: [], conversations: [], activity: [], runtime: {}, modelRouting: {} };
    const waiting = await executeModelToolLoop({ state, run, route: { primaryModel: 'deepseek-v4-flash' }, request: run.request, executeModel: async () => ({ reply: '', provider: 'fixture', model: 'fixture', toolCalls: [{ id: 'http-command', type: 'function', function: { name: 'command__execute', arguments: JSON.stringify({ command: 'node --version' }) } }] }) });
    await writeFile(path.join(directory, 'state.json'), JSON.stringify(state));
    const pools = { 'deepseek-v4-flash': [{ id: 'local-fixture', provider: 'custom', baseUrl: `http://127.0.0.1:${provider.address().port}`, modelId: 'fixture', credentialRef: 'JARVIS_TEST_PROVIDER_KEY' }] };
    child = spawn(process.execPath, ['server/index.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, JARVIS_PORT: '0', JARVIS_DATA_DIR: directory, JARVIS_AUTH_TOKEN: 'controlled-test-token', JARVIS_SCHEDULER: '0', MODEL_PROVIDER_POOLS: JSON.stringify(pools), JARVIS_TEST_PROVIDER_KEY: 'local-fixture-only' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
      child.once('error', reject);
      child.stdout.on('data', (data) => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    const headers = { authorization: 'Bearer controlled-test-token', 'content-type': 'application/json' };
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers, body: JSON.stringify({ message: 'approved' }) });
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.interceptedApproval, true); assert.equal(body.result.verified, true);
    assert.equal(body.synthesis.status, 'completed'); assert.equal(providerCalls, 1);
    const stored = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.equal(stored.runs.length, 1); assert.equal(stored.runs[0].id, run.id);
    assert.equal(stored.runs[0].status, 'completed'); assert.equal(stored.runs[0].toolCalls.length, 1);
    assert.match(stored.conversations.at(-1).lines[0], /Node version/);
    const replay = await fetch(`${base}/api/approvals/${waiting.approval.id}`, { method: 'POST', headers, body: JSON.stringify({ outcome: 'approved' }) });
    assert.equal(replay.status, 409); assert.equal(providerCalls, 1);
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    provider.closeAllConnections(); await new Promise((resolve) => provider.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
