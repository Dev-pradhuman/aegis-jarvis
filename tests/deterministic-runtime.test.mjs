import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest } from '../server/router.js';
import { executeToolCall } from '../server/toolExecutor.js';
import { getToolDefinition } from '../server/registry.js';

const freshState = () => ({ tasks: [], memories: [], workflows: [], approvals: [], runs: [], activity: [], runtime: {} });

test('deterministic route becomes a canonical ToolCall with Run and telemetry evidence', async () => {
  const state = freshState();
  const route = routeRequest('show my tasks');
  assert.equal(route.route, 'TOOL_CALL');
  const result = await executeToolCall({ toolName: route.capability, arguments: route.args, source: 'deterministic-router' }, { state, request: 'show my tasks' });
  assert.equal(result.status, 'completed');
  assert.equal(state.runs[0].toolCalls[0].source, 'deterministic-router');
  assert.equal(state.runs[0].steps.length, 1);
  assert.equal(state.runtime.toolTelemetry[0].runId, result.runId);
});

test('canonical lookup and simple deterministic execution remain fast', async () => {
  const lookupStarted = performance.now();
  for (let index = 0; index < 5000; index += 1) assert.equal(getToolDefinition('tasks.list').id, 'tasks.list');
  const lookupMs = performance.now() - lookupStarted;

  const started = performance.now();
  for (let index = 0; index < 100; index += 1) {
    const result = await executeToolCall({ toolName: 'tasks.list', arguments: {}, source: 'benchmark' }, { state: freshState(), request: 'show tasks' });
    assert.equal(result.status, 'completed');
  }
  const averageMs = (performance.now() - started) / 100;
  assert.ok(lookupMs < 250, `5000 tool lookups took ${lookupMs.toFixed(2)}ms`);
  assert.ok(averageMs < 25, `canonical tasks.list averaged ${averageMs.toFixed(2)}ms`);
});
