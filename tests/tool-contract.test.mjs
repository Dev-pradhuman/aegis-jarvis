import assert from 'node:assert/strict';
import test from 'node:test';
import { listTools } from '../server/registry.js';
import { executeTool, implementedToolIds } from '../server/toolExecutor.js';
import { requestOriginAllowed } from '../server/requestSecurity.js';
import { actionFingerprint } from '../server/idempotency.js';

test('every advertised tool has a handler and valid execution contract', () => {
  const implemented = new Set(implementedToolIds);
  for (const tool of listTools().filter((item) => item.enabled)) {
    assert.ok(implemented.has(tool.id), `${tool.id} has no handler`);
    assert.equal(tool.inputSchema?.type, 'object', tool.id);
    assert.equal(tool.outputSchema?.type, 'object', tool.id);
    assert.ok(tool.riskLevel && Number.isFinite(tool.timeout) && tool.timeout > 0, tool.id);
    assert.equal(typeof tool.sideEffects, 'boolean', tool.id);
  }
});

test('executor rejects unknown input fields and wrong types before action', async () => {
  await assert.rejects(executeTool('apps.open', { name: 1 }), { code: 'TOOL_INPUT_INVALID' });
  await assert.rejects(executeTool('apps.open', { name: 'Calculator', surprise: true }), { code: 'TOOL_INPUT_INVALID' });
});

test('exact approval cannot be reused for a different command', async () => {
  const approval = { status: 'approved', toolName: 'command.execute', actionHash: actionFingerprint('command.execute', { command: 'node --version' }), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await assert.rejects(executeTool('command.execute', { command: 'node -v' }, { approval }), /bound to the exact/);
});

test('local API accepts local frontend origins and rejects foreign origins and hosts', () => {
  assert.equal(requestOriginAllowed({ headers: { host: '127.0.0.1:8787', origin: 'http://localhost:5173' } }), true);
  assert.equal(requestOriginAllowed({ headers: { host: '[::1]:8787', origin: 'http://[::1]:5173' } }), true);
  assert.equal(requestOriginAllowed({ headers: { host: '127.0.0.1:8787', origin: 'https://evil.example' } }), false);
  assert.equal(requestOriginAllowed({ headers: { host: 'evil.example:8787' } }), false);
test('requestOriginAllowed rejects foreign Origin', () => {
  assert.equal(requestOriginAllowed({ headers: { host: 'localhost:8787', origin: 'https://evil.com' } }), false);
});

test('requestOriginAllowed rejects rebinding-style Host header', () => {
  assert.equal(requestOriginAllowed({ headers: { host: 'malicious-local-dns-rebind.com:8787' } }), false);
});

test('requestOriginAllowed requires Referer for state-changing browser requests without Origin', () => {
  assert.equal(requestOriginAllowed({ method: 'POST', headers: { host: 'localhost:8787', 'sec-fetch-mode': 'cors' } }), false); // Missing Referer
  assert.equal(requestOriginAllowed({ method: 'POST', headers: { host: 'localhost:8787', 'sec-fetch-mode': 'cors', referer: 'https://evil.com/page' } }), false); // Foreign Referer
  assert.equal(requestOriginAllowed({ method: 'POST', headers: { host: 'localhost:8787', 'sec-fetch-mode': 'cors', referer: 'http://localhost:5173/page' } }), true); // Local Referer
  assert.equal(requestOriginAllowed({ method: 'POST', headers: { host: 'localhost:8787' } }), true); // Non-browser request
});

});
