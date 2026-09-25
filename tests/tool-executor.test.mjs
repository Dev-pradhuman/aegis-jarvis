import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTool } from '../server/toolExecutor.js';
import { composioActionHash } from '../server/composioAdapter.js';

test('tool executor reads only bounded files inside the workspace', async () => {
  const result = await executeTool('files.read', { path: 'package.json' });
  assert.equal(result.ok, true);
  assert.match(result.data.content, /jarvis-command-console/);
  await assert.rejects(() => executeTool('files.read', { path: '..' }), /outside the JARVIS workspace/);
  await assert.rejects(() => executeTool('files.read', { path: '.env' }), /protected/);
  await assert.rejects(() => executeTool('files.read', { path: 'server/data/state.json' }), /protected/);
});

test('command execution requires an approved approval record', async () => {
  await assert.rejects(() => executeTool('command.execute', { command: 'node --version' }), /requires an approved approvalId/);
  await assert.rejects(() => executeTool('command.execute', { command: 'node && whoami' }, { approval: { status: 'approved' } }), /single executable command/);
});

test('central tool executor permits Composio reads but gates external writes', async () => {
  const originalKey = process.env.COMPOSIO_API_KEY; process.env.COMPOSIO_API_KEY = 'test';
  const fetchImpl = async () => ({ ok: true, json: async () => ({ successful: true, data: { messages: [] }, log_id: 'log-read' }) });
  const read = await executeTool('composio.execute', { toolSlug: 'GMAIL_FETCH_EMAILS', arguments: {} }, { fetchImpl });
  assert.equal(read.ok, true);
  const send = { toolSlug: 'GMAIL_SEND_EMAIL', arguments: { recipient_email: 'a@example.com' } };
  await assert.rejects(() => executeTool('composio.execute', send, { fetchImpl }), /approved approvalId/);
  await assert.rejects(() => executeTool('composio.execute', send, { fetchImpl, runId: 'run-other', approval: { status: 'approved', toolName: 'composio.execute', actionHash: composioActionHash(send), runId: 'run-original', expiresAt: new Date(Date.now() + 60000).toISOString() } }), /approved approvalId/);
  await assert.rejects(() => executeTool('composio.execute', send, { fetchImpl, runId: 'run-other', approval: { status: 'approved', toolName: 'composio.execute', actionHash: composioActionHash(send), runId: null, expiresAt: new Date(Date.now() + 60000).toISOString() } }), /approved approvalId/);
  if (originalKey === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = originalKey;
});
