import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest, cleanConversationalPrompt } from '../server/router.js';
import { DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_VISION_MODEL, localOllamaPool } from '../server/modelPool.js';
import { canUseLocalStage, executeBrainWorkflow } from '../server/brainWorkflow.js';

test('AC1: Dual Ollama model constants and local pool definitions', () => {
  assert.equal(DEFAULT_OLLAMA_MODEL, 'maternion/spark-x2.5-heretic:4b');
  assert.equal(DEFAULT_OLLAMA_VISION_MODEL, 'moondream:latest');

  const pool = localOllamaPool();
  assert.ok(pool['agent_brain'], 'agent_brain pool must exist');
  assert.equal(pool['agent_brain'][0].modelId, 'maternion/spark-x2.5-heretic:4b');
  assert.ok(pool['agent_brain'][0].capabilities.includes('tools'));
  assert.ok(pool['agent_brain'][0].capabilities.includes('reasoning'));
  assert.ok(pool['agent_brain'][0].capabilities.includes('code'));

  assert.ok(pool['perception'], 'perception pool must exist');
  assert.equal(pool['perception'][0].modelId, 'moondream:latest');
  assert.ok(pool['perception'][0].capabilities.includes('image'));
  assert.ok(pool['perception'][0].modalities.includes('image'));
});

test('AC2: Natural screen activity and active window routing in router.js', () => {
  const desktopQueries = [
    'what am i doing',
    'what am i working on',
    'what is on my screen',
    'what\'s on my screen',
    'look at my screen',
    'check my screen',
    'inspect my screen',
    'describe my screen'
  ];
  for (const q of desktopQueries) {
    const res = routeRequest(q);
    assert.equal(res.route, 'TOOL_CALL', `Failed for query: ${q}`);
    assert.equal(res.capability, 'screen.describe', `Failed capability for query: ${q}`);
    assert.equal(res.args.target, 'desktop', `Failed target for query: ${q}`);
  }

  const windowQueries = [
    'describe the active window',
    'what is on my active window',
    'take a look at the current window',
    'inspect active window',
    'look at the active window'
  ];
  for (const q of windowQueries) {
    const res = routeRequest(q);
    assert.equal(res.route, 'TOOL_CALL', `Failed for query: ${q}`);
    assert.equal(res.capability, 'screen.describe', `Failed capability for query: ${q}`);
    assert.equal(res.args.target, 'window', `Failed target for query: ${q}`);
  }
});

test('AC3: Execution mode routing logic in brainWorkflow.js', async () => {
  // In local mode, canUseLocalStage is always true
  assert.equal(canUseLocalStage({ requiresVision: true, requiresStrongReasoning: true }, { state: { modelRouting: { executionMode: 'local' } } }), true);

  const route = { primaryModel: 'agent_brain', supportModels: [] };
  const calls = [];
  const mockExecute = async (options) => {
    calls.push(options.sourceTier);
    return {
      reply: `result from ${options.sourceTier}`,
      provider: 'test',
      logicalModel: 'test',
      routingTelemetry: { providerAttempts: [] }
    };
  };

  // 1. Local execution mode: runs runLocal exclusively without API or Web calls
  calls.length = 0;
  const localRes = await executeBrainWorkflow({
    request: 'Explain quantum computing',
    route,
    state: { modelRouting: { executionMode: 'local' } },
    execute: mockExecute,
    web: async () => { throw new Error('Web should not be called in local mode'); }
  });
  assert.deepEqual(calls, ['local']);
  assert.equal(localRes.result.reply, 'result from local');
  assert.equal(localRes.result.routingTelemetry.executionTier, 'LOCAL_MODEL');

  // 2. Cloud execution mode: cascades ZERO_COST_API -> LOCAL_MODEL
  calls.length = 0;
  const cloudRes = await executeBrainWorkflow({
    request: 'Explain quantum computing',
    route,
    state: { modelRouting: { executionMode: 'cloud' } },
    execute: mockExecute,
    web: async () => { throw new Error('Web should not be called'); }
  });
  assert.deepEqual(calls, ['api']);
  assert.equal(cloudRes.result.reply, 'result from api');
  assert.equal(cloudRes.result.routingTelemetry.executionTier, 'ZERO_COST_API');
});

test('AC4: Conversational prefix and suffix stripping in router.js', () => {
  // cleanConversationalPrompt
  assert.equal(cleanConversationalPrompt('hey jarvis whats my system volume right now?'), 'whats my system volume');
  assert.equal(cleanConversationalPrompt('can you snooze for 5 minutes please'), 'snooze for 5 minutes');
  assert.equal(cleanConversationalPrompt('could you please check my screen for me?'), 'check my screen');

  // Exact AC4 query verification
  // 1. "hey jarvis whats my system volume right now?" -> audio.get_volume
  const vol1 = routeRequest('hey jarvis whats my system volume right now?');
  assert.equal(vol1.route, 'TOOL_CALL');
  assert.equal(vol1.capability, 'audio.get_volume');

  // 2. "what is the system volume" -> audio.get_volume
  const vol2 = routeRequest('what is the system volume');
  assert.equal(vol2.route, 'TOOL_CALL');
  assert.equal(vol2.capability, 'audio.get_volume');

  // 3. "turn the volume down by 5 percent" -> audio.volume_down (step: 5)
  const volDown = routeRequest('turn the volume down by 5 percent');
  assert.equal(volDown.route, 'TOOL_CALL');
  assert.equal(volDown.capability, 'audio.volume_down');
  assert.equal(volDown.args.step, 5);

  // 4. "can you snooze for 5 minutes" -> reminders.snooze (minutes: 5)
  const snooze = routeRequest('can you snooze for 5 minutes');
  assert.equal(snooze.route, 'TOOL_CALL');
  assert.equal(snooze.capability, 'reminders.snooze');
  assert.equal(snooze.args.minutes, 5);

  // 5. "check what apps and windows i have open right now" -> windows.list
  const winList = routeRequest('check what apps and windows i have open right now');
  assert.equal(winList.route, 'TOOL_CALL');
  assert.equal(winList.capability, 'windows.list');

  // 6. "what timers or reminders do i have running" -> reminders.list
  const remList = routeRequest('what timers or reminders do i have running');
  assert.equal(remList.route, 'TOOL_CALL');
  assert.equal(remList.capability, 'reminders.list');

  // 7. "what files have changed in my git repo" -> projects.status
  const proj = routeRequest('what files have changed in my git repo');
  assert.equal(proj.route, 'TOOL_CALL');
  assert.equal(proj.capability, 'projects.status');
});
