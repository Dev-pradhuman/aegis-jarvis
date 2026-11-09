import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pluginManager, PluginManager } from '../server/pluginManager.js';
import { executeTool } from '../server/toolExecutor.js';
import { getTool } from '../server/registry.js';
import { clearTelemetry, getTelemetryEvents, getMetrics } from '../server/plugins/jarvis-telemetry/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('PluginManager: loads built-in jarvis-telemetry plugin and registers tools', async () => {
  clearTelemetry();
  const plugins = await pluginManager.loadAllPlugins();
  assert.ok(plugins.some((p) => p.name === 'jarvis-telemetry'), 'jarvis-telemetry should be loaded');

  const loadedList = pluginManager.getLoadedPlugins();
  const telemetryPlugin = loadedList.find((p) => p.name === 'jarvis-telemetry');
  assert.ok(telemetryPlugin, 'Plugin should be in loaded plugins list');
  assert.ok(telemetryPlugin.tools.includes('telemetry.get_metrics'), 'telemetry.get_metrics tool should be registered');

  const tool = getTool('telemetry.get_metrics');
  assert.ok(tool, 'telemetry.get_metrics should be in canonical registry');
  assert.equal(tool.name, 'telemetry.get_metrics');
});

test('PluginManager: executes dynamic plugin tool via executeTool', async () => {
  clearTelemetry();
  await pluginManager.loadAllPlugins();

  const result = await executeTool('telemetry.get_metrics', { limit: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.toolId, 'telemetry.get_metrics');
  assert.ok(typeof result.data.totalEvents === 'number');
  assert.ok(typeof result.data.toolCounts === 'object');
});

test('PluginManager: preToolCall safety guardrail intercepts dangerous commands', async () => {
  await pluginManager.loadAllPlugins();

  await assert.rejects(
    async () => {
      await executeTool('command.execute', { command: 'rm -rf /' });
    },
    (err) => {
      assert.match(err.message, /\[SafetyGuardrail\] Blocked dangerous command/);
      return true;
    }
  );
});

test('PluginManager: lifecycle hooks track preToolCall and postToolCall', async () => {
  clearTelemetry();
  await pluginManager.loadAllPlugins();

  // Execute a safe tool (telemetry.get_metrics)
  await executeTool('telemetry.get_metrics', { limit: 5 });

  const events = getTelemetryEvents();
  assert.ok(events.length >= 2, 'Should have recorded preToolCall and postToolCall events');
  assert.ok(events.some((e) => e.type === 'preToolCall' && e.toolId === 'telemetry.get_metrics'));
  assert.ok(events.some((e) => e.type === 'postToolCall' && e.toolId === 'telemetry.get_metrics'));

  const metrics = getMetrics();
  assert.ok(metrics.toolCounts['telemetry.get_metrics'] >= 1);
});

test('PluginManager: agentStart and agentStop hooks record session events', async () => {
  clearTelemetry();
  await pluginManager.loadAllPlugins();

  await pluginManager.triggerHook('agentStart', { mode: 'cli', text: 'Test user prompt' });
  await pluginManager.triggerHook('agentStop', { mode: 'cli', status: 'completed' });

  const events = getTelemetryEvents();
  assert.ok(events.some((e) => e.type === 'agentStart' && e.mode === 'cli'));
  assert.ok(events.some((e) => e.type === 'agentStop' && e.mode === 'cli'));
});

test('PluginManager: custom hook registration and deregistration', async () => {
  let customHookCalled = false;
  const unregister = pluginManager.registerHook('preToolCall', async (ctx) => {
    if (ctx.toolId === 'custom-test-tool') {
      customHookCalled = true;
    }
  });

  await pluginManager.triggerHook('preToolCall', { toolId: 'custom-test-tool' });
  assert.equal(customHookCalled, true);

  customHookCalled = false;
  unregister();
  await pluginManager.triggerHook('preToolCall', { toolId: 'custom-test-tool' });
  assert.equal(customHookCalled, false);
});

test('PluginManager: unloadPlugin cleans up tools and hooks', async () => {
  const customPm = new PluginManager();
  const pluginDir = path.resolve(__dirname, '../server/plugins/jarvis-telemetry');
  await customPm.loadPlugin(pluginDir);

  assert.ok(customPm.hasToolHandler('telemetry.get_metrics'));
  assert.equal(customPm.getLoadedPlugins().length, 1);

  const unloaded = customPm.unloadPlugin('jarvis-telemetry');
  assert.equal(unloaded, true);
  assert.equal(customPm.hasToolHandler('telemetry.get_metrics'), false);
  assert.equal(customPm.getLoadedPlugins().length, 0);
});
