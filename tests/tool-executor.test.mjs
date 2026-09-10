import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTool } from '../server/toolExecutor.js';
import { createExactApproval } from '../server/policy.js';
import { createRun, transitionRun } from '../server/runEngine.js';

test('tool executor reads only bounded files inside the workspace', async () => {
  const result = await executeTool('files.read', { path: 'package.json' });
  assert.equal(result.ok, true);
  assert.match(result.data.content, /jarvis-command-console/);
  await assert.rejects(() => executeTool('files.read', { path: '..' }), /outside the JARVIS workspace/);
});

test('command execution requires an approved approval record', async () => {
  const input = { command: 'node --version' };
  await assert.rejects(() => executeTool('command.execute', input), /Approval required/);
  const mutationApproval = createExactApproval({ toolName: 'command.execute', input }); mutationApproval.status = 'approved';
  await assert.rejects(() => executeTool('command.execute', { command: 'node --help' }, { approval: mutationApproval }), /arguments do not match/);
  const approved = createExactApproval({ toolName: 'command.execute', input }); approved.status = 'approved';
  const result = await executeTool('command.execute', input, { approval: approved });
  assert.equal(result.ok, true);
  await assert.rejects(() => executeTool('command.execute', input, { approval: approved }), /already been consumed/);
  const malformed = createExactApproval({ toolName: 'command.execute', input: { command: 'node && whoami' } }); malformed.status = 'approved';
  await assert.rejects(() => executeTool('command.execute', { command: 'node && whoami' }, { approval: malformed }), /single executable command/);
});

test('central tool executor permits Composio reads but gates external writes', async () => {
  const originalKey = process.env.COMPOSIO_API_KEY; process.env.COMPOSIO_API_KEY = 'ak_test';
  const fetchImpl = async () => ({ ok: true, json: async () => ({ successful: true, data: { messages: [] }, log_id: 'log-read' }) });
  const read = await executeTool('composio.execute', { toolSlug: 'GMAIL_FETCH_EMAILS', arguments: {} }, { fetchImpl });
  assert.equal(read.ok, true);
  await assert.rejects(() => executeTool('composio.execute', { toolSlug: 'GMAIL_SEND_EMAIL', arguments: { recipient_email: 'a@example.com' } }, { fetchImpl }), /Approval required/);
  if (originalKey === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = originalKey;
});

test('central tool executor refuses new work on a terminal Run', async () => {
  const run = createRun({ request: 'already finished' });
  transitionRun(run, 'completed');
  const state = { tasks: [], memories: [], workflows: [], approvals: [], runs: [run], activity: [], runtime: {} };
  await assert.rejects(
    () => executeTool('tasks.list', {}, { state, runId: run.id }),
    /Cannot attach a new tool call to terminal Run/,
  );
  assert.equal(run.status, 'completed');
  assert.equal(run.steps.length, 0);
});
