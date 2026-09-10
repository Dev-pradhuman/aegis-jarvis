import assert from 'node:assert/strict';
import test from 'node:test';
import { executeModelToolLoop, resumeModelToolLoop, retryModelSynthesis, stopApprovalContinuation } from '../server/modelToolLoop.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { createRun, transitionRun } from '../server/runEngine.js';

function fixture(request = 'Use tools') {
  const state = { tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {}, modelRouting: {} };
  const run = createRun({ type: 'chat', request, plan: { goal: request, intent: 'tool', steps: [] } });
  transitionRun(run, 'running'); state.runs.push(run);
  return { state, run, route: { primaryModel: 'deepseek-v4-flash' } };
}

const response = (overrides = {}) => ({ reply: '', toolCalls: [], provider: 'test-provider', model: 'test-model', logicalModel: 'deepseek-v4-flash', tokens: 1, inputTokens: 1, outputTokens: 0, cost: 0, routingTelemetry: { providerAttempts: [] }, ...overrides });

test('approval continuation survives serialization, synthesizes verified result, and cannot replay', async () => {
  const f = fixture('Execute command node --version');
  const waiting = await executeModelToolLoop({ ...f, request: f.run.request, executeModel: async () => response({ toolCalls: [{ id: 'approved-command', type: 'function', function: { name: 'command__execute', arguments: '{"command":"node --version"}' } }] }) });
  const state = JSON.parse(JSON.stringify(f.state)); const run = state.runs[0]; const approval = state.approvals[0]; approval.status = 'approved';
  const result = await executeToolCall({ id: approval.toolCallId, toolName: approval.toolName, arguments: approval.action, runId: run.id, stepId: approval.stepId, approvalId: approval.id, requestedBy: approval.requestedBy }, { state, autoCompleteRun: false });
  assert.equal(result.status, 'completed');
  let executions = 0;
  const resumed = await resumeModelToolLoop({ state, run, result, execute: async () => { executions++; throw new Error('Must not repeat'); }, executeModel: async ({ context }) => {
    assert.match(JSON.stringify(context), /Execute command node --version/);
    const message = context.findLast((item) => item.role === 'tool');
    assert.equal(JSON.parse(message.content).verified, true);
    return response({ reply: 'Version verified.' });
  } });
  assert.equal(resumed.status, 'completed'); assert.equal(executions, 0);
  assert.equal(resumed.toolResults.length, 1); assert.equal(waiting.approval.id, approval.id);
  await assert.rejects(resumeModelToolLoop({ state, run, result }), /No matching pending/);
});

test('synthesis failure preserves successful result without executing action again', async () => {
  const f = fixture('Execute command node --version');
  await executeModelToolLoop({ ...f, request: f.run.request, executeModel: async () => response({ toolCalls: [{ id: 'synthesis-command', type: 'function', function: { name: 'command__execute', arguments: '{"command":"node --version"}' } }] }) });
  const result = { toolCallId: 'synthesis-command', toolName: 'command.execute', status: 'completed', verified: true, output: { stdout: 'v24' } };
  await assert.rejects(resumeModelToolLoop({ ...f, result, executeModel: async () => { throw new Error('Provider unavailable'); } }), /Provider unavailable/);
  assert.equal(f.run.modelContinuation.status, 'synthesis_failed');
  assert.equal(f.run.modelContinuation.toolResults[0].verified, true);
  let executed = 0;
  const retry = await retryModelSynthesis({ ...f, execute: async () => { executed++; }, executeModel: async () => response({ reply: 'Recovered response.' }) });
  assert.equal(retry.status, 'completed'); assert.equal(executed, 0);
});

for (const code of ['PERMISSION_DENIED', 'APPROVAL_EXPIRED']) test(`${code} terminates pending continuation without execution`, async () => {
  const f = fixture('Execute command node --version');
  const waiting = await executeModelToolLoop({ ...f, request: f.run.request, executeModel: async () => response({ toolCalls: [{ id: 'denied', type: 'function', function: { name: 'command__execute', arguments: '{"command":"node --version"}' } }] }) });
  stopApprovalContinuation(f.run, waiting.approval, code);
  assert.equal(f.run.status, 'failed'); assert.equal(f.run.result.error.code, code);
  assert.equal(f.run.toolCalls[0].status, 'failed');
  await assert.rejects(retryModelSynthesis(f), /no retryable/);
});

for (const failure of ['EXECUTION_FAILED', 'VERIFICATION_FAILED']) test(`post-approval ${failure} is supplied to model, not represented as success`, async () => {
  const f = fixture('Execute command node --version');
  await executeModelToolLoop({ ...f, request: f.run.request, executeModel: async () => response({ toolCalls: [{ id: 'failed-command', type: 'function', function: { name: 'command__execute', arguments: '{"command":"node --version"}' } }] }) });
  const approval = f.state.approvals[0]; approval.status = 'approved';
  const result = await executeToolCall({ id: approval.toolCallId, toolName: approval.toolName, arguments: approval.action, approvalId: approval.id, requestedBy: approval.requestedBy }, { state: f.state, autoCompleteRun: false, handler: async () => {
    if (failure === 'EXECUTION_FAILED') throw new Error('Controlled failure');
    return { output: { code: 1, stdout: '', stderr: 'Failed command' } };
  } });
  assert.equal(result.error.code, failure);
  const resumed = await resumeModelToolLoop({ ...f, result, executeModel: async ({ context }) => {
    assert.match(JSON.stringify(context), new RegExp(failure)); return response({ reply: 'The command could not be verified.' });
  } });
  assert.equal(resumed.status, 'failed'); assert.equal(approval.status, 'consumed');
});

test('remaining calls in the paused model round are not discarded', async () => {
  const f = fixture('Execute command node --version and show tasks');
  await executeModelToolLoop({ ...f, request: f.run.request, executeModel: async () => response({ toolCalls: [
    { id: 'first', type: 'function', function: { name: 'command__execute', arguments: '{"command":"node --version"}' } },
    { id: 'second', type: 'function', function: { name: 'tasks__list', arguments: '{}' } },
  ] }) });
  const result = { toolCallId: 'first', toolName: 'command.execute', status: 'completed', verified: true, output: { stdout: 'v24' } };
  const resumed = await resumeModelToolLoop({ ...f, result, executeModel: async () => response({ reply: 'Done.' }) });
  assert.equal(resumed.toolResults.length, 2); assert.equal(resumed.toolResults[1].toolName, 'tasks.list');
  assert.equal(resumed.toolResults[1].verified, true);
});

test('model loop executes one canonical tool and returns grounded final response', async () => {
  const { state, run, route } = fixture('Show my tasks'); let round = 0;
  const result = await executeModelToolLoop({ route, request: 'Show my tasks', state, run, executeModel: async () => round++ === 0
    ? response({ toolCalls: [{ id: 'call-list', type: 'function', function: { name: 'tasks__list', arguments: '{}' } }] })
    : response({ reply: 'You have no tasks.' }) });
  assert.equal(result.reply, 'You have no tasks.');
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].verified, true);
  assert.equal(run.toolCalls[0].toolName, 'tasks.list');
});

test('model loop supports dependent sequential calls using prior tool output', async () => {
  const { state, run, route } = fixture('List tasks and create a follow-up task from the latest one');
  state.tasks.push({ id: 'existing', title: 'Review latest email', status: 'pending' }); let round = 0;
  const result = await executeModelToolLoop({ route, request: run.request, state, run, executeModel: async ({ context }) => {
    if (round++ === 0) return response({ toolCalls: [{ id: 'list', type: 'function', function: { name: 'tasks__list', arguments: '{}' } }] });
    if (round === 2) {
      assert.match(JSON.stringify(context), /Review latest email/);
      return response({ toolCalls: [{ id: 'create', type: 'function', function: { name: 'tasks__create', arguments: JSON.stringify({ title: 'Follow up: Review latest email' }) } }] });
    }
    return response({ reply: 'Created the follow-up task.' });
  } });
  assert.equal(result.toolResults.length, 2);
  assert.equal(state.tasks[0].title, 'Follow up: Review latest email');
  assert.ok(result.toolResults.every((item) => item.verified));
});

test('multiple independent tool calls execute in one model round', async () => {
  const { state, run, route } = fixture('Show tasks and diagnostics'); let round = 0;
  const result = await executeModelToolLoop({ route, request: run.request, state, run, executeModel: async () => round++ === 0
    ? response({ toolCalls: [
      { id: 'tasks', type: 'function', function: { name: 'tasks__list', arguments: '{}' } },
      { id: 'health', type: 'function', function: { name: 'diagnostics', arguments: '{}' } },
    ] })
    : response({ reply: 'Tasks and health checked.' }) });
  assert.deepEqual(result.toolResults.map((item) => item.toolName), ['tasks.list', 'diagnostics']);
});

test('tool errors are returned to the model without being represented as success', async () => {
  const { state, run, route } = fixture('Update a task'); let round = 0;
  const result = await executeModelToolLoop({ route, request: run.request, state, run, executeModel: async ({ context }) => {
    if (round++ === 0) return response({ toolCalls: [{ id: 'bad', type: 'function', function: { name: 'tasks__update', arguments: '{}' } }] });
    assert.match(JSON.stringify(context), /INVALID_ARGUMENTS/);
    return response({ reply: 'I could not update a task because its ID was missing.' });
  } });
  assert.equal(result.status, 'failed');
  assert.equal(result.toolResults[0].status, 'failed');
  assert.equal(result.toolResults[0].error.code, 'INVALID_ARGUMENTS');
  assert.match(result.reply, /could not update/);
});

test('approval pauses model loop and loop limits terminate explicitly', async () => {
  const approvalFixture = fixture('Execute command node --version');
  const waiting = await executeModelToolLoop({ ...approvalFixture, request: approvalFixture.run.request, executeModel: async () => response({ toolCalls: [{ id: 'command', type: 'function', function: { name: 'command__execute', arguments: JSON.stringify({ command: 'node --version' }) } }] }) });
  assert.equal(waiting.status, 'waiting_for_approval');
  assert.equal(waiting.toolResults[0].error.code, 'APPROVAL_REQUIRED');

  const limitedFixture = fixture('Keep checking tasks');
  await assert.rejects(() => executeModelToolLoop({ ...limitedFixture, request: limitedFixture.run.request, maxRounds: 2, executeModel: async () => response({ toolCalls: [{ id: `again-${Math.random()}`, type: 'function', function: { name: 'tasks__list', arguments: '{}' } }] }) }), (error) => error.code === 'TOOL_LOOP_LIMIT');
});
